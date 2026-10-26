// @vitest-environment edge-runtime
// 13.2 — Data exposure regression tests. Pins the reviewed boundaries from
// docs/DATA_EXPOSURE_REVIEW.md so a later change cannot silently reopen a
// leakage path.
import { convexTest } from "convex-test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";

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

test("draft preview content exposes only its allowlisted shape", async () => {
  const tx = convexTest(schema, modules);
  const administrator = await seedUser(
    tx,
    ["administrator"],
    "preview_administrator",
  );
  const author = await seedUser(tx, ["administrator"], "preview_author");
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
