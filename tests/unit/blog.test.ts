// @vitest-environment edge-runtime
import { describe, expect, test } from "vitest";
import { hasCapability } from "../../convex/lib/permissions";

describe("content.author capability", () => {
  test.each([
    "frontDesk",
    "clinicalStaff",
    "provider",
    "administrator",
  ] as const)("%s can author content", (role) =>
    expect(hasCapability([role], "content.author")).toBe(true),
  );
  test.each(["patient", "auditor"] as const)(
    "%s cannot author content",
    (role) => expect(hasCapability([role], "content.author")).toBe(false),
  );
});
