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

## Inquiries

`/admin/inquiries` lists Contact Inquiries from `/contact`. Reading and changing status require `config.manage`. New, Handled, and Archived filters show up to the latest 200 inquiries for that status. Staff can mark a new inquiry handled, or archive a new or handled inquiry with an operational reason. Archived inquiries cannot be reopened or deleted. Contact details and message text cannot be edited.

The inbox displays name, email, optional phone, submission date, status, and expandable message text. Audit actions are `contact.inquiry.submitted` (no actor or reason), `contact.inquiry.handled`, and `contact.inquiry.archived` (administrator actor and archive reason). Each has notice severity.

Visitor text may contain sensitive health details. Never copy it into audit reasons, logs, or URLs. Archive reasons must describe the operational decision without visitor or health details. Reads are currently not audited because Convex queries cannot write audit rows; see `DATA_EXPOSURE_REVIEW.md`. No email or text is sent, and staff must follow up separately.

Contact details are placeholders until the practice supplies its real address, phone, and email. Dedicated contact submission, authorization-denial, archive-reason, and browser regression tests remain follow-up work; this change updates only the existing authorization matrix.
