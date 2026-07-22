// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { beforeEach, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

function t() {
  return convexTest(schema, modules);
}

const sampleClerkUser = {
  clerkUserId: "user_abc123",
  type: "patient" as const,
  displayName: "Synthetic Patient",
  email: "synthetic@example.com",
};

// Svix secret used to sign test payloads (synthetic, not a real secret).
const WEBHOOK_SECRET = "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ=";

beforeEach(() => {
  process.env.CLERK_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

async function signedHeaders(payload: string, id = "msg_1") {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secretBytes = Uint8Array.from(atob(WEBHOOK_SECRET.slice(6)), (c) =>
    c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${payload}`),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${sigB64}`,
    "content-type": "application/json",
  };
}

const clerkUserCreatedPayload = JSON.stringify({
  type: "user.created",
  data: {
    id: "user_webhook1",
    first_name: "Synthetic",
    last_name: "Person",
    primary_email_address_id: "em_1",
    email_addresses: [{ id: "em_1", email_address: "s.person@example.com" }],
    primary_phone_number_id: null,
    phone_numbers: [],
    public_metadata: {},
  },
});

test("replayed upsert does not duplicate users", async () => {
  const tx = t();
  const id1 = await tx.mutation(
    internal.domains.users.upsertFromClerk,
    sampleClerkUser,
  );
  const id2 = await tx.mutation(internal.domains.users.upsertFromClerk, {
    ...sampleClerkUser,
    displayName: "Renamed Patient",
  });
  expect(id2).toBe(id1);
  const users = await tx.run((ctx) => ctx.db.query("users").collect());
  expect(users).toHaveLength(1);
  expect(users[0].displayName).toBe("Renamed Patient");
});

test("deactivation soft-deletes and is idempotent", async () => {
  const tx = t();
  await tx.mutation(internal.domains.users.upsertFromClerk, sampleClerkUser);
  await tx.mutation(internal.domains.users.deactivateFromClerk, {
    clerkUserId: sampleClerkUser.clerkUserId,
  });
  await tx.mutation(internal.domains.users.deactivateFromClerk, {
    clerkUserId: sampleClerkUser.clerkUserId,
  });
  const users = await tx.run((ctx) => ctx.db.query("users").collect());
  expect(users).toHaveLength(1);
  expect(users[0].status).toBe("deactivated");
});

test("webhook rejects a forged signature", async () => {
  const res = await t().fetch("/clerk-webhook", {
    method: "POST",
    body: clerkUserCreatedPayload,
    headers: {
      "svix-id": "msg_forged",
      "svix-timestamp": Math.floor(Date.now() / 1000).toString(),
      "svix-signature": "v1,Zm9yZ2VkZm9yZ2VkZm9yZ2VkZm9yZ2VkZm9yZ2Vk",
    },
  });
  expect(res.status).toBe(400);
});

test("signed webhook creates the user and replay does not duplicate", async () => {
  const tx = t();
  const headers = await signedHeaders(clerkUserCreatedPayload);
  const first = await tx.fetch("/clerk-webhook", {
    method: "POST",
    body: clerkUserCreatedPayload,
    headers,
  });
  expect(first.status).toBe(200);
  const replay = await tx.fetch("/clerk-webhook", {
    method: "POST",
    body: clerkUserCreatedPayload,
    headers,
  });
  expect(replay.status).toBe(200);
  const users = await tx.run((ctx) => ctx.db.query("users").collect());
  expect(users).toHaveLength(1);
  expect(users[0].email).toBe("s.person@example.com");
});

test("ensureCurrentUser reconciles a missing row exactly once", async () => {
  const tx = t();
  const asUser = tx.withIdentity({ subject: "user_recon", name: "Pat Doe" });
  const id1 = await asUser.mutation(api.domains.users.ensureCurrentUser, {});
  const id2 = await asUser.mutation(api.domains.users.ensureCurrentUser, {});
  expect(id2).toBe(id1);
  const users = await tx.run((ctx) => ctx.db.query("users").collect());
  expect(users).toHaveLength(1);
  expect(users[0].type).toBe("patient");
});

test("ensureCurrentUser rejects unauthenticated callers", async () => {
  await expect(
    t().mutation(api.domains.users.ensureCurrentUser, {}),
  ).rejects.toThrow("Not authenticated");
});
