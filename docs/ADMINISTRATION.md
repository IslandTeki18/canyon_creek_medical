# Content administration

## Public service pages

- `/admin/service-pages` lets administrators author, order, publish,
  unpublish, and archive structured website service content. All writes
  require `config.manage`; archive is the only removal path, and every state
  change writes a `content.servicePage.*` audit event.
- Run `npx convex run domains/contentSeed:seedServicePages` once per
  environment to migrate the original six marketing pages. The seed requires
  an active administrator and safely skips existing slugs on repeat runs.
  Because existing slugs are skipped, copy changes to the seed do not reach
  an already-seeded environment; edit and republish the affected pages in
  `/admin/service-pages` instead.
- `content.listPublishedServicePages` and
  `content.getPublishedServicePage` are intentionally unauthenticated public
  queries. They return published rows only through an explicit field
  allowlist and are documented exemptions in the authorization matrix.
- Spravato, HBOT, and peptide content remains a hardcoded future-services
  preview; these deferred modules cannot be published through this editor.

## Blog posts

`/admin/blog` lets administrators create, edit, preview, publish, unpublish, archive, and restore blog posts. Posts use the same draft/publish/archive lifecycle as Service Pages. Writes require `content.author`; lifecycle changes write `content.blogPost.*` audit events, while draft autosaves do not.
