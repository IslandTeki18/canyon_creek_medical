// @vitest-environment edge-runtime
// 13.3 — Trust-boundary tests for public webhook endpoints: forged, stale,
// duplicated, malformed, and oversized requests. Signature verification and
// replay idempotency are also covered per-vendor in users-sync.test.ts and
// communications.test.ts; this file adds the abuse cases.
import { convexTest } from "convex-test";
import { beforeEach, expect, test } from "vitest";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

const WEBHOOK_SECRET = "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ=";

beforeEach(() => {
  process.env.CLERK_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.TWILIO_AUTH_TOKEN = "synthetic_twilio_token";
});

function t() {
  return convexTest(schema, modules);
}

async function svixHeaders(
  payload: string,
  id = "msg_hardening",
  timestamp = Math.floor(Date.now() / 1000),
) {
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
  return {
    "svix-id": id,
    "svix-timestamp": timestamp.toString(),
    "svix-signature": `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}`,
    "content-type": "application/json",
  };
}

const ENDPOINTS = ["/clerk-webhook", "/resend-webhook", "/twilio-status"];

test.each(ENDPOINTS.map((e) => [e]))(
  "%s rejects an oversized payload with 413",
  async (endpoint) => {
    const res = await t().fetch(endpoint, {
      method: "POST",
      body: "a".repeat(64 * 1024 + 1),
    });
    expect(res.status).toBe(413);
  },
);

test.each(ENDPOINTS.map((e) => [e]))(
  "%s rejects a malformed unsigned request",
  async (endpoint) => {
    const res = await t().fetch(endpoint, {
      method: "POST",
      body: "not json, no signature",
    });
    expect(res.status).toBe(400);
  },
);

test("stale svix timestamp is rejected even with a valid signature", async () => {
  const payload = JSON.stringify({
    type: "email.delivered",
    data: { email_id: "em_1" },
  });
  const staleTimestamp = Math.floor(Date.now() / 1000) - 60 * 60;
  const headers = await svixHeaders(payload, "msg_stale", staleTimestamp);
  const res = await t().fetch("/resend-webhook", {
    method: "POST",
    body: payload,
    headers,
  });
  expect(res.status).toBe(400);
});

test("valid but signed-with-wrong-secret resend event is rejected", async () => {
  process.env.RESEND_WEBHOOK_SECRET = "whsec_YW5vdGhlcnNlY3JldGFub3RoZXI=";
  const payload = JSON.stringify({
    type: "email.delivered",
    data: { email_id: "em_1" },
  });
  const headers = await svixHeaders(payload);
  const res = await t().fetch("/resend-webhook", {
    method: "POST",
    body: payload,
    headers,
  });
  expect(res.status).toBe(400);
});

test("duplicate twilio callbacks record exactly one webhook event", async () => {
  const tx = t();
  // Signature must match the exact URL convex-test uses; compute it inline
  // with the same HMAC the endpoint verifies.
  const params = new URLSearchParams({
    MessageSid: "SM_dup",
    MessageStatus: "delivered",
  });
  // convex-test serves http actions at this fixed base URL.
  const url = "https://some.convex.site/twilio-status";
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const signedPayload = url + entries.map(([k, v]) => `${k}${v}`).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("synthetic_twilio_token"),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(digest)));
  for (let i = 0; i < 2; i++) {
    const res = await tx.fetch("/twilio-status", {
      method: "POST",
      body: params.toString(),
      headers: {
        "x-twilio-signature": signature,
        "content-type": "application/x-www-form-urlencoded",
      },
    });
    expect(res.status).toBe(200);
  }
  const events = await tx.run((ctx) => ctx.db.query("webhookEvents").collect());
  expect(events).toHaveLength(1);
});
