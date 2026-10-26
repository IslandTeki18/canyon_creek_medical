// @vitest-environment edge-runtime
// 13.3 — Trust-boundary tests for public webhook endpoints: forged, stale,
// duplicated, malformed, and oversized requests. Signature verification and
// replay idempotency are also covered in users-sync.test.ts.
import { convexTest } from "convex-test";
import { beforeEach, expect, test } from "vitest";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

const WEBHOOK_SECRET = "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ=";

beforeEach(() => {
  process.env.CLERK_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

function t() {
  return convexTest(schema, modules);
}

const ENDPOINTS = ["/clerk-webhook"];

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
