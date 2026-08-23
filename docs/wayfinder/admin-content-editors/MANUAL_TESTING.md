# Manual test guide: admin content editors

Covers every decision in `MAP.md`. Work top to bottom; later sections assume
the data created earlier. Use synthetic data only (`CLAUDE.md`).

## 1. Setup

Two terminals:

```bash
pnpm dev:convex      # Convex dev deployment, prints VITE_CONVEX_URL
pnpm dev             # Vite on http://localhost:5173
```

Env: `.env.local` needs `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`; the
Convex deployment needs `CLERK_JWT_ISSUER_DOMAIN` (see `.env.example`).

### 1.1 Admin user

1. Open `http://localhost:5173/sign-in`, sign up through Clerk. Copy the
   Clerk user id (`user_...`) from the Clerk dashboard.
2. Bootstrap (only works while no administrator exists):

```bash
npx convex run domains/users:bootstrapAdministrator \
  '{"clerkUserId":"user_XXXX","displayName":"Test Admin","email":"admin@example.test"}'
```

3. Reload; `/admin` should show the hub.

### 1.2 Second user for permission checks (optional)

Sign up a second Clerk account. In `/admin/users`, create a workforce user
with role `frontDesk` (has `content.author`, lacks `config.manage`). Use it
in a private window for the deny checks in section 9.

### 1.3 Seed and migrations

```bash
npx convex run domains/contentSeed:seedServicePages
npx convex run migrations/sectionContent:migrate
npx convex run migrations/coverImage:migrateCoverImages
```

Expected: six published service pages (`mental-health-care`,
`medication-management`, `addiction-medicine`,
`medication-assisted-treatment`, `ketamine-therapy`,
`holistic-integrative-care`). Run the two migrations a second time; they
must report no changes.

### 1.4 Mock images

Prepare on disk:

| File                                 | Purpose        |
| ------------------------------------ | -------------- |
| `ok-small.jpg` (any JPEG under 5 MB) | valid upload   |
| `ok.png`, `ok.webp`                  | valid types    |
| `too-big.jpg` (over 5 MB)            | size rejection |
| `bad.svg`                            | type rejection |
| `bad.gif`                            | type rejection |

## 2. Mock data

### 2.1 Service page: "Sleep Medicine"

Fixed metadata (left rail):

| Field        | Value                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| Title        | Sleep Medicine                                                          |
| Icon key     | `leaf`                                                                  |
| Summary      | Assessment and treatment of insomnia and circadian disorders.           |
| Chips        | `Insomnia`, `CBT-I`, `Telehealth available`                             |
| Tags         | `New service` (accent on), `Adults 18+`                                 |
| Introduction | Poor sleep worsens every mental health condition. We treat it directly. |
| Facts        | `Visit length` / `50 minutes`; `Format` / `In person or video`          |
| Safety note  | Sleep medications carry risks; your clinician reviews them with you.    |
| Cover image  | `ok-small.jpg`, alt `Calm bedroom at dawn`                              |

Sections, in order:

1. Rich text:

```
## What to expect

Your first visit is a **full sleep history**. We look at habits, medications, and _timing_.

> Most insomnia improves within six weeks of structured treatment.

Read our [sleep hygiene guide](https://example.test/sleep).
```

2. Numbered steps:
   - `Assessment` / `A 50 minute visit covering sleep history and screening.`
   - `Plan` / `CBT-I, medication review, or both.`
   - `Follow-up` / `Two-week check-ins until sleep stabilises.`
3. Item grid: `Insomnia`, `Delayed sleep phase`, `Shift work disorder`,
   `Nightmares`
4. Callout panel: title `Already on a sleep medication?`, body `Bring the
bottle to your first visit.`
5. Image: `ok.png`, alt `Clinician reviewing a sleep diary`
6. Bullet list: `No referral needed`, `Most insurance accepted`,
   `Evening appointments`

### 2.2 Blog post: "Five myths about ketamine therapy"

| Field       | Value                                                                            |
| ----------- | -------------------------------------------------------------------------------- |
| Title       | Five myths about ketamine therapy                                                |
| Category    | Mental health                                                                    |
| Excerpt     | Separating evidence from headlines on ketamine for depression. (under 300 chars) |
| Author name | Dr. Test Author                                                                  |
| Cover image | `ok.webp`, alt `Infusion suite with a reclining chair`                           |

Sections:

1. Rich text:

```
## Myth one: it is a party drug

Clinical ketamine is **dosed, monitored, and brief**.

### Why the confusion

Street use and medical use share a molecule and _nothing else_.

## Myth two: it works instantly for everyone

Response rates are high but not universal.
```

2. Bullet list: `Monitored vitals`, `Licensed clinician present`,
   `Integration session after`
3. Callout panel: body `Talk to your prescriber before stopping any
medication.`

Expected TOC on the public post: `Myth one: it is a party drug`,
`Why the confusion` (nested), `Myth two: it works instantly for everyone`.

### 2.3 Invalid inputs (for the publish gate)

| Input                                | Expected problem                         |
| ------------------------------------ | ---------------------------------------- |
| Empty Safety note                    | "Safety note" listed in publish problems |
| Image section with empty alt         | alt problem linked to that section       |
| Numbered steps with zero steps       | section problem                          |
| Excerpt of 301+ chars (blog)         | "Excerpt must be at most 300 characters" |
| Rich text link `javascript:alert(1)` | renders as plain text, not a link        |

## 3. Admin naming and hub

1. `/admin`: cards **Bookable services** (`/admin/services`) and **Website
   services** (`/admin/service-pages`) both present.
2. Each page's `<h1>` matches its card title.

## 4. Website services: list, cards, ordering

1. `/admin/service-pages`. Six cards, each with badge **Live** (solid dot).
2. Drag a card to a new position. Reload: order persists. Visit `/services`:
   public order matches.
3. Keyboard: focus a card, use **Move earlier** / **Move later**; order
   changes and persists.
4. **New service page**: dialog asks for a title only. Enter `Sleep
Medicine`; the address preview shows `/services/sleep-medicine`. Create.
   Editor opens; card later shows badge **Draft** (dashed ring).
5. Blank title in the dialog is rejected.
6. **Show archived** toggle hides/reveals archived cards (none yet).

## 5. Editor, sections, autosave

Open the Sleep Medicine draft.

### 5.1 Canvas

1. Hover between sections: a `+` appears at each gap. Click, choose a type;
   it inserts at that position.
2. Add the six sections from 2.1 in order, using `+` placement.
3. Reorder with the up/down arrows; first section's up and last section's
   down are disabled.
4. Drag a section header to reorder with the mouse.
5. Delete a section: it disappears immediately, toast offers **Undo**. Click
   Undo within six seconds: it returns at its original index. Delete again and
   wait: toast disappears after about six seconds, section stays gone.
   Re-add it.

### 5.2 Autosave timing

Watch the header status line.

| Action                                       | Expected                                                    |
| -------------------------------------------- | ----------------------------------------------------------- |
| Type in Summary, stop                        | after about 1s: `Saving…` then `Saved just now`             |
| Type continuously for 12s                    | a save happens around the 10s mark while still typing       |
| Add/delete/reorder a section                 | `Saving…` immediately, no 1s wait                           |
| Confirm an image upload, toggle a tag accent | immediate save                                              |
| Type, then blur the field (Tab)              | immediate save                                              |
| Leave it idle                                | label advances (`Saved 1 minute ago`) on its own within 30s |

No "Unsaved changes" text appears in the header.

### 5.3 Reload survival

Type a distinctive phrase, wait for `Saved`, hard-reload. The phrase is
present. The public `/services/sleep-medicine` still 404s (draft only).

### 5.4 Navigation guard

1. Type, then within 1s click **Back** or the browser back button. A dialog:
   **Stay** / **Leave anyway**. Stay keeps you; the save completes.
2. Type, then close the tab within 1s: browser "leave site?" prompt.
3. With nothing dirty, navigation is silent.

### 5.5 Failure states

1. Stop `pnpm dev:convex`. Type. Status shows `Saving…`; after about 5s
   the banner "Your changes aren't saving right now. We're still trying —
   please keep this page open." appears. Restart Convex: the save completes,
   banner clears, `Saved` returns.
2. Rejection path (requires a deliberate bad draft): in the browser devtools
   console run a `saveServicePageDraft` with an unknown section type, or
   temporarily edit the draft in the Convex dashboard to add
   `{"type":"bogus"}`; the editor shows "Your changes couldn't be saved.
   Copy your text before leaving." with **Copy page text**. Clicking copies
   the page text to the clipboard. Remove the bad section to recover.

### 5.6 Rich text toolbar

In the rich text section: select text, click **Bold**, **Italic**,
**Heading**, **Subheading**, **Quote**, **Link** (dialog asks for URL).
Markers are inserted (`**`, `_`, `## `, `### `, `> `, `[label](url)`). A
Subheading with no Heading above it shows the skipped-level warning.

## 6. Images

1. Cover image slot: upload `ok-small.jpg`; alt field required. Save with
   empty alt is allowed in the draft; publish lists it as a problem.
2. Image section: upload `ok.png` with alt. Replace with `ok.webp`. Remove.
3. Upload `too-big.jpg`: rejected "Image must be 5 MB or smaller".
4. Upload `bad.svg` and `bad.gif`: rejected as unsupported type.
5. Publish, then discard/replace flows release orphans: in the Convex
   dashboard `_storage`, an image removed before publish is gone after
   publish; an uploaded-then-abandoned draft image remains (accepted leak).

## 7. Publish gate, preview, live edits

1. With Safety note empty and one image alt empty, click **Publish**. It
   stays clickable; a problem list appears, each item linking/scrolling to
   the owning section or field. Fix them; list empties.
2. **View as visitor** on the draft: opens
   `/admin/service-pages/<id>/preview`, renders the public template with the
   draft, including cover image and hero. "Back to editor" returns.
3. Publish. Card badge is **Live**. `/services/sleep-medicine` renders all
   six section types with the seeded visual treatments; the link opens
   `https://example.test/sleep`.
4. Edit the Summary on the live page. Badge becomes **Live · edited**
   (square mark). Public page unchanged. **Discard edits**: badge back to
   **Live**, summary reverts, notice "Unpublished changes discarded".
5. Edit again, **Publish edits**: public page updates.
6. Try a `javascript:` link in rich text, publish: it renders as text.
7. **Take off the website**: status dialog requires a reason; public page
   404s; card badge **Draft**. **Put on the website** restores it.
8. `•••` menu: **Archive service page** opens the reason dialog ("Archived
   service pages leave the website..."). Archive; card gone until **Show
   archived**; **Restore** brings it back as Draft.
9. `/admin/audit`: publish, unpublish, discard, archive, restore each wrote
   an event. Autosave wrote none.

## 8. Blog posts

Repeat at `/admin/blog` with 2.2:

1. **New post** names first; address preview `/blog/five-myths-about-ketamine-therapy`.
2. Category select saves immediately; Excerpt over 300 chars is a publish
   problem.
3. Cover image shows in the card media slot.
4. No drag ordering on blog cards (ordered by publish date); archived toggle
   present.
5. Publish; `/blog/<slug>` shows the TOC with the nested subheading; `/blog`
   lists newest first.
6. Preview route `/admin/blog/<id>/preview` works for a draft.
7. Sign in as the `frontDesk` user: can create/edit/publish posts
   (`content.author`), cannot open `/admin/service-pages` writes.

## 9. Authorization and exposure

With the `frontDesk` user (section 1.2):

| Action                                                      | Expected                           |
| ----------------------------------------------------------- | ---------------------------------- |
| Open `/admin/service-pages`, edit a draft                   | save fails (needs `config.manage`) |
| Upload an image targeting a service page                    | rejected                           |
| Upload an image targeting a post                            | allowed                            |
| Open `/admin/service-pages/<id>/preview`                    | denied / not found                 |
| Signed out, open either preview URL                         | redirected to sign-in              |
| Signed out, `/services/<published>` and `/blog/<published>` | render                             |
| Signed out, `/services/<draft-only slug>`                   | 404                                |

## 10. Prompt replacement

No `window.prompt` / `window.confirm` on these screens; each is a dialog
with named buttons and free-text reason:

| Screen                              | Trigger                         | Dialog                                                        |
| ----------------------------------- | ------------------------------- | ------------------------------------------------------------- |
| Website services                    | `•••` > Archive                 | "Archive this service page?"                                  |
| Blog posts                          | `•••` > Archive                 | "Archive this post?"                                          |
| Form templates `/admin/forms/<id>`  | Retire / Restore                | "Retire this template?" / "Restore this template?"            |
| Form templates                      | Publish version                 | "Publish this version?"                                       |
| Bookable services `/admin/services` | Mark active / future / disabled | "Mark <name> <status>?", **Mark disabled** styled destructive |

Bookable services with future appointments: create a service and appointment
type under `/admin/scheduling`, book a future appointment, then **Mark
disabled**. A second dialog offers two named choices (cancel those
appointments vs keep them and stop new bookings), destructive choice not in
default focus; the notice reports the cancelled count.

## 11. Regression checks

- `/admin/forms` list still works (no card treatment by decision).
- `/admin/feature-flags` and `/admin/reports` still use `window.prompt`
  (out of scope, expected).
- Resize to 375px wide: editor and cards remain usable (not specified;
  note anything broken).
