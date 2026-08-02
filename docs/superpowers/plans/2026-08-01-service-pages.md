# Service Pages (Public Services Content) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded marketing service content in `src/features/public/services-page.tsx` and `src/features/public/service-detail-page.tsx` with an admin-authored, Convex-backed `servicePages` content feature.

**Architecture:** One new Convex table `servicePages` (draft/published/archived lifecycle, zod-validated structured content matching the existing `ServiceDetail` shape) in a new domain file `convex/domains/content.ts`. Admin CRUD is gated by the existing `config.manage` capability (admin-only). Two unauthenticated public queries serve published pages to the marketing site — the first public queries in the codebase, registered in the authorization-matrix exemption list. Existing public page components keep their markup and swap their data source from TS literals to `useQuery`.

**Tech Stack:** Convex, zod 4, React 19 + react-router 8, Tailwind, convex-test + Vitest (edge-runtime).

---

## Decisions and constraints (read first)

- **Table name:** `services` is already taken by the scheduling catalog (`convex/schema.ts:560`). The content table is `servicePages`.
- **Authorization:** reuse `config.manage` (already admin-only per `convex/lib/permissions.ts`). No new capability. "Only admins write services" is satisfied by the existing role→capability map.
- **No versioning tables.** Marketing content is not a clinical record; the immutability rule (CLAUDE.md) covers signed notes, consents, and form/template versions — not marketing copy. Single table, editable, with audit events on create/update/publish/unpublish/archive. `// ponytail: single table; add servicePageVersions if edit history is ever required.`
- **Soft delete only:** `status: "archived"`, never a hard delete (repo rule).
- **Content shape:** the zod schema mirrors `ServiceDetail` in `src/features/public/service-detail-page.tsx:5-14` plus card-level fields from `services-page.tsx`. Note the card literal's fields are `icon` (a lucide `IconType` component reference), `body`, `chips`, `slug`. In the stored content: `body` → `summary` (string), and `icon` becomes a **string key** — Task 6 creates a key→component map since none exists today. Stored as `v.any()` and zod-parsed on every write, same pattern as `convex/lib/forms.ts` `parseDefinition()`.
- **Public queries return published content only** and never expose `createdByUserId` or other internal fields. No PHI risk (marketing content), but keep the field allowlist explicit.
- **Feature flags:** the "future services" list (Spravato, HBOT, peptides) stays hardcoded in the page; flag-gated modules must not become publishable pages here. Do not wire `requireFeature` into this domain.
- **Audit actions:** `content.servicePage.created|updated|published|unpublished|archived`. Add `"content."` to `NOTICE_PREFIXES` in `convex/lib/audit.ts`.
- **Ordering:** explicit `sortOrder: number` field; public list sorts by it.
- **Seeding:** the existing hardcoded copy is migrated via an admin-run internal mutation seeded from the current TS literals, so the public site renders identical content on day one.

## File structure

| File                                                 | Action | Responsibility                                                     |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `convex/schema.ts`                                   | Modify | Add `servicePages` table + indexes                                 |
| `convex/lib/content.ts`                              | Create | zod schema `servicePageContentSchema`, `parseServicePageContent()` |
| `convex/domains/content.ts`                          | Create | Admin CRUD/publish mutations + admin list query + public queries   |
| `convex/lib/audit.ts`                                | Modify | Add `"content."` notice prefix                                     |
| `convex/domains/contentSeed.ts`                      | Create | `internalMutation` seeding pages from current literals             |
| `src/features/administration/service-pages-page.tsx` | Create | Admin editor UI (list, edit form, publish/archive)                 |
| `src/routes.tsx`                                     | Modify | Add `admin/service-pages` route (`config.manage`)                  |
| `src/features/public/services-page.tsx`              | Modify | Cards from `listPublishedServicePages`                             |
| `src/features/public/service-detail-page.tsx`        | Modify | Detail from `getPublishedServicePage`                              |
| `tests/unit/service-pages.test.ts`                   | Create | Lifecycle, validation, deny-path, public-query tests               |
| `tests/unit/authorization-matrix.test.ts`            | Modify | Exemption entries for the two public queries                       |
| `tests/fixtures/content.ts`                          | Create | `validServicePageContent()` fixture                                |

---

## Chunk 1: Backend

### Task 1: Schema + content validation

**Files:**

- Modify: `convex/schema.ts`
- Create: `convex/lib/content.ts`
- Create: `tests/fixtures/content.ts`
- Test: `tests/unit/service-pages.test.ts`

- [ ] **Step 1: Add the `servicePages` table to `convex/schema.ts`** (alongside the other content-ish tables, e.g. after `formVersions`):

```ts
servicePages: defineTable({
  slug: v.string(),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  sortOrder: v.number(),
  content: v.any(), // ServicePageContent, zod-validated on write (see convex/lib/content.ts)
  publishedAt: v.optional(v.number()),
  archivedAt: v.optional(v.number()),
  archiveReason: v.optional(v.string()),
  createdByUserId: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_slug", ["slug"])
  .index("by_status", ["status", "sortOrder"]),
```

- [ ] **Step 2: Write failing validation tests** in `tests/unit/service-pages.test.ts`:

```ts
// @vitest-environment edge-runtime
import { describe, expect, test } from "vitest";
import { parseServicePageContent } from "../../convex/lib/content";
import { validServicePageContent } from "../fixtures/content";

describe("service page content validation", () => {
  test("accepts a valid content payload", () => {
    expect(() =>
      parseServicePageContent(validServicePageContent()),
    ).not.toThrow();
  });
  test("rejects missing title", () => {
    const c = { ...validServicePageContent(), title: "" };
    expect(() => parseServicePageContent(c)).toThrow(/title/i);
  });
  test("rejects unknown extra fields", () => {
    const c = { ...validServicePageContent(), phi: "nope" };
    expect(() => parseServicePageContent(c)).toThrow();
  });
});
```

And `tests/fixtures/content.ts`:

```ts
export function validServicePageContent() {
  return {
    title: "Mental Health Care",
    icon: "brain",
    summary:
      "Comprehensive psychiatric evaluations and individualized treatment.",
    chips: ["Depression", "Anxiety"],
    tags: [{ label: "Mental health", accent: true }],
    intro:
      "Comprehensive psychiatric evaluations and individualized treatment.",
    howItWorks: ["Care begins with a thorough evaluation."],
    indications: ["Depression", "Anxiety Disorders"],
    steps: [
      { title: "Comprehensive evaluation", body: "An in-depth first visit." },
    ],
    facts: [{ k: "Category", v: "Psychiatric care" }],
    safetyNote:
      "This page is informational and not a substitute for medical advice.",
  };
}
```

- [ ] **Step 3: Run to verify failure.** `npx vitest run tests/unit/service-pages.test.ts` — expect FAIL (module not found).

- [ ] **Step 4: Implement `convex/lib/content.ts`** — follow the style of `parseDefinition` in `convex/lib/forms.ts` (readable error messages, `.strict()` objects):

```ts
import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

export const servicePageContentSchema = z
  .object({
    title: nonEmpty,
    icon: nonEmpty, // key into the marketing Icon set
    summary: nonEmpty,
    chips: z.array(nonEmpty).max(12),
    tags: z
      .array(
        z.object({ label: nonEmpty, accent: z.boolean().optional() }).strict(),
      )
      .max(6),
    intro: nonEmpty,
    howItWorks: z.array(nonEmpty).min(1),
    indications: z.array(nonEmpty),
    steps: z
      .array(z.object({ title: nonEmpty, body: nonEmpty }).strict())
      .min(1),
    facts: z.array(z.object({ k: nonEmpty, v: nonEmpty }).strict()),
    safetyNote: nonEmpty,
  })
  .strict();

export type ServicePageContent = z.infer<typeof servicePageContentSchema>;

export function parseServicePageContent(raw: unknown): ServicePageContent {
  const result = servicePageContentSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `Invalid service page content: ${issue.path.join(".")} — ${issue.message}`,
    );
  }
  return result.data;
}
```

- [ ] **Step 5: Run tests, expect PASS.** `npx vitest run tests/unit/service-pages.test.ts`

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(content): add servicePages schema and content validation"`

### Task 2: Admin mutations + lifecycle

**Files:**

- Create: `convex/domains/content.ts`
- Modify: `convex/lib/audit.ts` (add `"content."` to `NOTICE_PREFIXES`)
- Test: `tests/unit/service-pages.test.ts`

- [ ] **Step 1: Write failing lifecycle + deny-path tests** (append to the same test file, using `seedUser` from `tests/fixtures/forms.ts`):

```ts
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { seedUser } from "./fixtures-helpers-as-in-forms"; // use the actual import path from tests/fixtures/forms.ts

const modules = import.meta.glob("../../convex/**/*.ts");

describe("service page lifecycle", () => {
  test("admin can create, publish, unpublish, archive", async () => {
    const tx = convexTest(schema, modules);
    const admin = await seedUser(tx, ["administrator"], "sp_admin");
    const id = await admin.mutation(api.domains.content.createServicePage, {
      slug: "mental-health-care",
      sortOrder: 1,
      content: validServicePageContent(),
    });
    await admin.mutation(api.domains.content.publishServicePage, {
      servicePageId: id,
    });
    const published = await tx.query(
      api.domains.content.listPublishedServicePages,
      {},
    );
    expect(published).toHaveLength(1);
    expect(published[0]).not.toHaveProperty("createdByUserId");
    await admin.mutation(api.domains.content.unpublishServicePage, {
      servicePageId: id,
    });
    expect(
      await tx.query(api.domains.content.listPublishedServicePages, {}),
    ).toHaveLength(0);
    await admin.mutation(api.domains.content.archiveServicePage, {
      servicePageId: id,
      reason: "retired copy",
    });
  });

  test("duplicate slug is rejected", async () => {
    /* create twice with same slug → rejects */
  });
  test("invalid content is rejected on create and update", async () => {
    /* bad payload → /Invalid service page content/ */
  });

  test("service page administration is restricted to config.manage", async () => {
    const tx = convexTest(schema, modules);
    const staff = await seedUser(tx, ["clinicalStaff"], "sp_staff");
    await expect(
      staff.mutation(api.domains.content.createServicePage, {
        slug: "x",
        sortOrder: 1,
        content: validServicePageContent(),
      }),
    ).rejects.toThrow("Not authorized");
    await expect(
      staff.query(api.domains.content.listServicePages, {}),
    ).rejects.toThrow("Not authorized");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`api.domains.content` missing).

- [ ] **Step 3: Implement `convex/domains/content.ts`.** Every admin function opens with `const actor = await requireCapability(ctx, "config.manage")`; every state change ends with `writeAudit`. Functions:

  - `createServicePage({ slug, sortOrder, content })` — normalize slug (`/^[a-z0-9-]+$/`, reject otherwise), reject duplicate slug via `by_slug`, `parseServicePageContent`, insert as `draft`, audit `content.servicePage.created`.
  - `updateServicePage({ servicePageId, sortOrder?, content? })` — reject if `archived`; parse content; patch `updatedAt`; audit `content.servicePage.updated`. Publishing state is unchanged by edits (edits to a published page go live — acceptable for marketing copy; note in the admin UI).
  - `publishServicePage` / `unpublishServicePage` — set status + `publishedAt`; audit.
  - `archiveServicePage({ servicePageId, reason })` — set `archived` + `archivedAt` + `archiveReason`; audit with `reason`.
  - `listServicePages` (admin, `config.manage`) — all non-archived plus archived flagged, full docs.
  - `getServicePage({ servicePageId })` (admin) — full doc for the editor.

  Add `"content."` to `NOTICE_PREFIXES` in `convex/lib/audit.ts`.

- [ ] **Step 4: Run tests, expect PASS** (public-query assertions still fail until Task 3 — implement Task 3's queries as part of making this suite green if preferred, or mark those two assertions in Task 3).

- [ ] **Step 5: Commit.** `git commit -m "feat(content): service page admin CRUD with audit and authz"`

### Task 3: Public queries + authorization-matrix exemptions

**Files:**

- Modify: `convex/domains/content.ts`
- Modify: `tests/unit/authorization-matrix.test.ts`
- Test: `tests/unit/service-pages.test.ts`

- [ ] **Step 1: Write failing tests** for the public surface:

```ts
test("public queries only expose published pages with an allowlisted shape", async () => {
  // seed draft + published + archived pages as admin
  const list = await tx.query(
    api.domains.content.listPublishedServicePages,
    {},
  ); // no identity
  expect(list.map((p) => p.slug)).toEqual(["published-slug"]);
  expect(Object.keys(list[0]).sort()).toEqual(["content", "slug", "sortOrder"]);
  const page = await tx.query(api.domains.content.getPublishedServicePage, {
    slug: "published-slug",
  });
  expect(page?.content.title).toBeDefined();
  expect(
    await tx.query(api.domains.content.getPublishedServicePage, {
      slug: "draft-slug",
    }),
  ).toBeNull();
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** the two public queries in `convex/domains/content.ts`, with an explicit projection helper:

```ts
// Public marketing queries: intentionally unauthenticated. Published content only,
// explicit field allowlist — never return the raw document.
function toPublicServicePage(doc: Doc<"servicePages">) {
  return { slug: doc.slug, sortOrder: doc.sortOrder, content: doc.content };
}

export const listPublishedServicePages = query({
  args: {},
  handler: async (ctx) => {
    const pages = await ctx.db
      .query("servicePages")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
    return pages.map(toPublicServicePage);
  },
});

export const getPublishedServicePage = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const page = await ctx.db
      .query("servicePages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    return page && page.status === "published"
      ? toPublicServicePage(page)
      : null;
  },
});
```

- [ ] **Step 4: Add `EXPLAINED_EXEMPTIONS` entries** in `tests/unit/authorization-matrix.test.ts`:

```ts
"domains/content.ts:listPublishedServicePages":
  "Public marketing content; returns only published service pages via an explicit field allowlist.",
"domains/content.ts:getPublishedServicePage":
  "Public marketing content; returns a single published page or null via an explicit field allowlist.",
```

- [ ] **Step 5: Run the full unit suite**, expect PASS including `authorization-matrix.test.ts` and `data-exposure.test.ts`: `npx vitest run tests/unit`

- [ ] **Step 6: Commit.** `git commit -m "feat(content): public published service page queries"`

### Task 4: Seed migration from hardcoded copy

**Files:**

- Create: `convex/domains/contentSeed.ts`

- [ ] **Step 1: Implement `seedServicePages` as an `internalMutation`** that inserts one `servicePages` row per entry currently in `SERVICE_DETAILS` (`service-detail-page.tsx`) merged with its card entry in `SERVICES` (`services-page.tsx`), status `published`, `sortOrder` matching current display order. Field mapping from the card literal: `body` → `summary`, `icon` component → its string key (e.g. `Brain` → `"brain"`); `chips` and `slug` carry over as-is. Idempotent: skip any slug that already exists. Attribute `createdByUserId` to the first administrator user; throw with a clear message if none exists. Copy the literals into this file verbatim.
- [ ] **Step 2: Test:** unit test that running the seed twice yields no duplicates and `listPublishedServicePages` returns all seeded slugs in order.
- [ ] **Step 3: Run, PASS, commit.** `git commit -m "feat(content): idempotent service page seed from existing marketing copy"`

Run in each environment with `npx convex run domains/contentSeed:seedServicePages` (document in README/env notes per definition of done).

## Chunk 2: Frontend

### Task 5: Admin editor page

**Files:**

- Create: `src/features/administration/service-pages-page.tsx`
- Modify: `src/routes.tsx`

- [ ] **Step 1: Build the page** following `form-templates-page.tsx` exactly (default export, `useAuthConfigured()` guard, `useQuery(api.domains.content.listServicePages)`, mutations in try/catch → local error state, `role="status"` loading text). Layout:
  - List view: table of pages (title, slug, status badge, sortOrder) with Publish/Unpublish/Archive buttons (archive prompts for a required reason).
  - Editor: form fields for every `ServicePageContent` field. Array fields (howItWorks, indications, steps, facts, chips, tags) use simple add/remove row controls — plain `useState` + controlled inputs, matching how the rest of admin UI is written. Show a warning banner when editing a published page: "Changes to a published page go live on save."
  - Loading/empty/error/success states for every query and mutation (definition of done).
- [ ] **Step 2: Add the route** in `src/routes.tsx` under the app/admin group: `admin/service-pages` → `<RequireAuth capability="config.manage">`, `lazy()` import, nav entry alongside `admin/services`. Label it "Service pages (website)" to distinguish it from the scheduling service catalog.
- [ ] **Step 3: Verify** `npm run typecheck && npm run lint` pass; manually exercise create→publish→edit→archive against a dev deployment.
- [ ] **Step 4: Commit.** `git commit -m "feat(content): admin service pages editor"`

### Task 6: Wire public pages to Convex

**Files:**

- Modify: `src/features/public/services-page.tsx`
- Modify: `src/features/public/service-detail-page.tsx`

- [ ] **Step 1: `services-page.tsx`** — replace the `SERVICES` literal with `useQuery(api.domains.content.listPublishedServicePages, {})`. Keep all markup. Add an icon key map (none exists today — cards currently hold lucide component references directly): `const ICONS: Record<string, IconType> = { brain: Brain, pill: Pill, ... }` covering every icon currently used in `SERVICES`, with a neutral fallback component for unknown keys. Render `<Icon as={ICONS[content.icon] ?? Fallback}>`. States: `undefined` → skeleton cards with `role="status"`; empty array → keep the page shell with the `FUTURE` section only. The hardcoded `FUTURE` (flag-gated) list stays hardcoded.
- [ ] **Step 2: `service-detail-page.tsx`** — replace `SERVICE_DETAILS[slug]` with `useQuery(api.domains.content.getPublishedServicePage, { slug })`. `undefined` → loading state; `null` → existing `NotFound`. Delete the `SERVICE_DETAILS` literal and the now-unused `ServiceDetail` interface (the shape lives in `convex/lib/content.ts`; import the type from there).
- [ ] **Step 3: Verify** `npm run typecheck && npm run lint && npx vitest run tests/unit` pass; run the app, confirm `/services` and `/services/mental-health-care` render seeded content identically to before, and an unpublished slug 404s.
- [ ] **Step 4: Run Playwright smoke + accessibility specs:** `npx playwright test tests/e2e` — expect PASS (public pages are covered there).
- [ ] **Step 5: Commit.** `git commit -m "feat(content): public service pages read from Convex"`

### Task 7: Definition-of-done sweep

- [ ] Full suite: `npm run typecheck && npm run lint && npx vitest run && npx playwright test`.
- [ ] Confirm audit events appear for each admin action (query `auditEvents` in dev dashboard).
- [ ] Confirm no PHI-capable fields exist anywhere in this feature (content is operator-authored marketing copy; slugs appear in URLs by design and contain no PHI).
- [ ] Update docs: note the new admin page, seed command, and the two public-query exemptions in the relevant docs file (wherever prior increments documented admin features).
- [ ] Commit: `git commit -m "docs(content): document service pages feature"`

## Out of scope (explicitly)

- Version history / rollback for pages (upgrade path: add `servicePageVersions` mirroring `formVersions`).
- Rich text — content is structured fields only.
- Image uploads (pages currently use icon keys and CSS placeholders).
- Any change to the scheduling `services` table or `admin/services` catalog page.
