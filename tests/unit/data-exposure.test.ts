// @vitest-environment edge-runtime
// 13.2 — Data exposure regression tests. Pins the reviewed boundaries from
// docs/DATA_EXPOSURE_REVIEW.md so a later change cannot silently reopen a
// leakage path.
import { convexTest } from "convex-test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { APPROVED_TEMPLATE_VARIABLES } from "../../convex/lib/communications";
import { exportFileName } from "../../convex/lib/reports";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");
const ROOT = join(__dirname, "../..");
const SERVICE_PREVIEW_FIELDS = [
  "chips",
  "facts",
  "icon",
  "intro",
  "safetyNote",
  "sections",
  "summary",
  "tags",
  "title",
];
const POST_PREVIEW_FIELDS = [
  "authorName",
  "category",
  "excerpt",
  "sections",
  "title",
];

// The registry list is the widest patient list in the app; it must stay
// limited to identity fields needed to distinguish patients — no clinical
// content, addresses, or free-text fields.
const REGISTRY_FIELDS = [
  "_id",
  "legalFirstName",
  "legalLastName",
  "preferredName",
  "dateOfBirth",
  "email",
  "phone",
  "status",
].sort();

test("patient search rows contain only the approved registry fields", async () => {
  const tx = convexTest(schema, modules);
  await seedPatients(tx);
  await tx.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkUserId: "user_staff",
      type: "workforce",
      status: "active",
      roles: ["clinicalStaff"],
      displayName: "Synthetic Staff",
      createdAt: 0,
      updatedAt: 0,
    });
  });
  const result = await tx
    .withIdentity({ subject: "user_staff" })
    .query(api.domains.patients.searchPatients, {
      term: "",
      paginationOpts: { numItems: 10, cursor: null },
    });
  expect(result.page.length).toBeGreaterThan(0);
  for (const row of result.page) {
    // Optional fields may be absent, but no field outside the whitelist may
    // ever appear.
    for (const key of Object.keys(row)) {
      expect(REGISTRY_FIELDS, `unexpected registry field: ${key}`).toContain(
        key,
      );
    }
  }
});

test("draft preview content exposes only its allowlisted shape", async () => {
  const tx = convexTest(schema, modules);
  const administrator = await seedUser(
    tx,
    ["administrator"],
    "preview_administrator",
  );
  const author = await seedUser(tx, ["clinicalStaff"], "preview_author");
  const servicePageId = await administrator.mutation(
    api.domains.content.createServicePage,
    { title: "Preview service" },
  );
  const postId = await author.mutation(api.domains.blog.createPost, {
    title: "Preview post",
  });

  const servicePage = await administrator.query(
    api.domains.content.getServicePage,
    { servicePageId },
  );
  const post = await author.query(api.domains.blog.getPost, { postId });

  expect(Object.keys(servicePage!.draftContent!).sort()).toEqual(
    SERVICE_PREVIEW_FIELDS,
  );
  expect(Object.keys(post!.draftContent!).sort()).toEqual(POST_PREVIEW_FIELDS);
});

test("notification template variables remain neutral — no patient fields", () => {
  // Adding a variable here is a privacy decision, not a convenience: SMS and
  // email bodies must never carry names, services, or clinical context.
  expect([...APPROVED_TEMPLATE_VARIABLES].sort()).toEqual([
    "appointmentDate",
    "appointmentTime",
    "practiceName",
    "practicePhone",
  ]);
});

test("export filenames carry report key and range only", () => {
  expect(
    exportFileName({
      key: "no-show-trends",
      from: "2026-01-01",
      to: "2026-02-01",
    }),
  ).toBe("no-show-trends-2026-01-01-to-2026-02-01.csv");
});

test("no ad-hoc console logging in Convex outside the structured logger", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "_generated") walk(rel);
        continue;
      }
      if (!entry.name.endsWith(".ts") || rel === "convex/lib/logger.ts") {
        continue;
      }
      const source = readFileSync(join(ROOT, rel), "utf8");
      if (/console\.(log|warn|error|info|debug)\(/.test(source)) {
        offenders.push(rel);
      }
    }
  };
  walk("convex");
  expect(offenders).toEqual([]);
});

test("route paths carry only opaque id parameters — never identifying data", () => {
  const source = readFileSync(join(ROOT, "src/routes.tsx"), "utf8");
  const params = [...source.matchAll(/path[:=]\s*"([^"]*)"/g)]
    .flatMap(([, path]) => path.split("/"))
    .filter((segment) => segment.startsWith(":"));
  expect(params.length).toBeGreaterThan(0);
  // ":slug" is the public marketing blog — no patient context.
  const allowed = [":slug"];
  for (const param of params) {
    if (allowed.includes(param)) continue;
    expect(param, `route param ${param} must be an opaque id`).toMatch(
      /^:\w*Id\??$/,
    );
  }
});
