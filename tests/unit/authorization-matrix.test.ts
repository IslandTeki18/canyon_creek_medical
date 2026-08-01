// 13.1 — Authorization matrix.
//
// Static completeness check over every public Convex function: each exported
// query/mutation must route through a server-side auth mechanism. Runtime
// allow/deny behavior per category is covered by the per-domain test files
// (see authorization.test.ts and *-test files for each domain); this test
// guarantees no public function can be added without an auth check or an
// explicit, explained exemption.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const CONVEX_DIR = join(__dirname, "../../convex");

// Auth mechanisms accepted as a server-side gate. requireLinkedPatient and
// requirePatientOwnership imply requireAuthenticatedUser; requireCapability
// implies it too. Direct getUserIdentity use is only accepted via the
// exemption list below.
const AUTH_MARKERS = [
  "requireCapability(",
  "requireAuthenticatedUser(",
  "requirePatientOwnership(",
  "requireLinkedPatient(",
];

// Functions that are deliberately public or use identity directly, with the
// reason. Anything else without a marker fails the matrix.
const EXPLAINED_EXEMPTIONS: Record<string, string> = {
  "health.ts:ping":
    "Connectivity health check; returns environment name only, no data reads.",
  "domains/users.ts:ensureCurrentUser":
    "Identity bootstrap: reads ctx.auth.getUserIdentity directly and only touches the caller's own user row.",
  "domains/users.ts:currentUser":
    "Identity bootstrap: resolves the caller's own user row from getUserIdentity; returns null when unauthenticated.",
};

/**
 * File-local auth wrappers (e.g. requireTaskAccess) count as markers only
 * when their own body delegates to a core helper — verified statically here,
 * so a wrapper cannot silently drop its auth check.
 */
function localWrapperMarkers(source: string): string[] {
  const wrapperPattern = /^(?:export )?(?:async )?function (\w+)\(/gm;
  const bodies = new Map<string, string>();
  for (const match of source.matchAll(wrapperPattern)) {
    bodies.set(
      match[1],
      source.slice(match.index, source.indexOf("\n}", match.index) + 2),
    );
  }
  // Fixpoint: a helper counts if it calls a core marker or another counted
  // helper (e.g. loadTaskForActor -> requireTaskAccess -> requireCapability).
  const markers = new Set(AUTH_MARKERS);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, body] of bodies) {
      if (markers.has(`${name}(`)) continue;
      if ([...markers].some((m) => body.includes(m))) {
        markers.add(`${name}(`);
        changed = true;
      }
    }
  }
  return [...markers].filter((m) => !AUTH_MARKERS.includes(m));
}

function publicFunctions(
  file: string,
): Array<{ key: string; name: string; body: string; markers: string[] }> {
  const source = readFileSync(join(CONVEX_DIR, file), "utf8");
  const markers = [...AUTH_MARKERS, ...localWrapperMarkers(source)];
  const chunks = source.split(/^(?=export const )/m);
  const results: Array<{
    key: string;
    name: string;
    body: string;
    markers: string[];
  }> = [];
  for (const chunk of chunks) {
    const match = chunk.match(
      /^export const (\w+) = (query|mutation|action)\(/,
    );
    if (!match) continue;
    results.push({
      key: `${file}:${match[1]}`,
      name: match[1],
      body: chunk,
      markers,
    });
  }
  return results;
}

const files = [
  "health.ts",
  ...readdirSync(join(CONVEX_DIR, "domains"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `domains/${f}`),
];

const allFunctions = files.flatMap(publicFunctions);

test("matrix enumerates a plausible public surface", () => {
  // Guardrail against the parser silently matching nothing.
  expect(allFunctions.length).toBeGreaterThan(200);
});

test.each(allFunctions.map((f) => [f.key, f]))(
  "%s is authenticated, authorized, or explicitly exempted",
  (key, fn) => {
    const hasMarker = fn.markers.some((m) => fn.body.includes(m));
    const exemption = EXPLAINED_EXEMPTIONS[key];
    if (!hasMarker && !exemption) {
      throw new Error(
        `${key} is a public Convex function with no server-side auth mechanism ` +
          `and no explained exemption. Add requireCapability/ownership or an ` +
          `entry in EXPLAINED_EXEMPTIONS with a reason.`,
      );
    }
    // An exempted function must not silently gain data access without review:
    // it may not use ctx.db beyond its own documented scope. We at least pin
    // that exemptions stay exemptions deliberately.
    if (!hasMarker && exemption) {
      expect(fn.body).toContain(
        key === "health.ts:ping" ? "query(" : "ctx.auth.getUserIdentity()",
      );
    }
  },
);

test("exemption list has no stale entries", () => {
  const keys = new Set(allFunctions.map((f) => f.key));
  for (const key of Object.keys(EXPLAINED_EXEMPTIONS)) {
    expect(keys, `stale exemption: ${key}`).toContain(key);
  }
});
