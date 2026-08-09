# Task 2 Report

## Status

Implemented the blog content schema in the shared content library.

## Changes

- Added shared strict/draft blog schemas using the six-type `sections` factory.
- Removed `body` from blog content validation and the create mutation args.
- Updated public blog projection to expose `sections`.
- Exported `BlogPostContent` from `convex/lib/content.ts`.

## Verification

- `node_modules/.bin/prettier --check convex/lib/content.ts convex/domains/blog.ts` — passed.
- `node_modules/.bin/oxlint convex/lib/content.ts convex/domains/blog.ts` — passed.
- `node_modules/.bin/tsc --noEmit --pretty false` — passed.
- `node_modules/.bin/vitest run tests/unit/blog.test.ts` — expected failures because existing fixtures still send legacy `body` and omit required `sections`; 6 tests passed, 8 failed at the old API boundary.

## Concerns

Existing blog admin/public code and tests still reference the legacy `body` shape; those updates belong to subsequent plan tasks.
