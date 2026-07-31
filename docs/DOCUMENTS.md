# Patient documents

Increment 11.2–11.3. Uploaded files are validated, scanned, reviewed, and
served only through short-lived authorized downloads.

## Structure

- `documents` — identity, category, visibility, and review state.
- `documentVersions` — immutable per-upload records (storage reference,
  canonical extension, size, scan status). Replacements supersede; nothing is
  overwritten or hard-deleted.
- `documentDownloadGrants` — single-use, two-minute download tokens. Only the
  SHA-256 hash is stored.

## Invariants

- Storage identifiers never reach a client, and there is no public route to
  the bytes. The only path is `GET /documents/download?token=…`, which
  consumes a grant.
- Authorization is re-evaluated when the grant is consumed, not when the link
  is created: a copied link is useless after expiry, after a single use, once
  the user is suspended, or if the document is archived.
- Stored file names are derived from category, document id, and version. The
  client's original file name is checked for extension consistency and then
  discarded — original names routinely contain patient names, and filenames
  must be free of PHI.
- Size always comes from storage metadata. The content type comes from
  storage metadata when the upload carried one; the client-declared type is a
  fallback only.
- A rejected upload deletes its stored bytes and returns
  `{ ok: false, error }`. Rejection does not throw, because a thrown mutation
  rolls its transaction back and would leave the rejected bytes in storage.

## Malware-scanning strategy

Every version starts at `scanStatus: "pending"` and is undownloadable.
`recordScanResult` moves it to `clean` or `quarantined`; only `clean`
versions can be granted. Quarantined versions stay in place for
investigation and are never served.

**Before production:** `recordScanResult` must be driven by an approved
scanner (a Convex action calling the vendor, invoked after
`attachDocument`), not by a human. The mutation is the integration boundary;
nothing else about the flow changes when the scanner lands. Byte-level
content verification is the scanner's responsibility — the upload check
validates category, declared type, extension consistency, and size only.

## Review workflow

Patient uploads land as `source: "patient"`, `visibility: "patient"`,
`reviewStatus: "pending"` and are excluded from broader clinical use until
staff review them. Staff may accept, recategorize, request a replacement, or
restrict. Each review decision writes an audit event, and requesting a
replacement or publishing a document notifies the patient through the neutral
communication engine — the notification names no document detail.

## Failure modes

| Situation                                               | Behavior                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| Unsupported type, category, size, or extension mismatch | Bytes deleted, `{ ok: false }` returned, no document created |
| Scan pending or quarantined                             | Grant creation refused                                       |
| Expired, replayed, or foreign grant                     | HTTP 404, indistinguishable from a missing file              |
| Suspended user with a valid grant                       | HTTP 404                                                     |
| Archived document                                       | Grant creation refused; existing grants fail at consume time |

## Retention

Documents and versions are archived, never hard-deleted. Consumed and
expired grants are inert rows retained for audit. File retention and
deletion policy for generated exports is set in Increment 13.4.
