# First-aid catalog admin

Covers `/dev/first-aid` — the developer surface for the public first-aid catalog.
Read [README.md](README.md) first for auth/access levels. Design spec:
[`docs/pages/first-aid.md`](../pages/first-aid.md) (developer section).

## Model

- The catalog is **developer-managed, publicly read-only**. The public browses at
  `/first-aid` and `/first-aid/[id]`; only developers create/edit/delete.
- Access: **both developer levels** (primary + secondary) may create, edit, and
  delete **any** entry — the First Aid catalog is a shared operational surface.
  `created_by_dev_id` is retained for attribution only, not as an edit gate.
- Every entry is a `procedure` or a `technique` (`category`) — the primary axis.
- A second axis, **topic/scenario tags**, layers on top: a closed 13-item
  whitelist (`src/lib/first-aid-tags.ts` — Bleeding, Burns, Choking, CPR &
  breathing, Fractures & sprains, Head & spine, Poisoning, Shock, Wounds & cuts,
  Bites & stings, Seizures, Heat & cold, Allergic reaction). Entries can carry
  zero or more tags; unknown/arbitrary strings are silently dropped
  (`normalizeTags`), so the stored set is always a whitelist subset. The
  whitelist is closed by design for catalog consistency — adding a new tag
  requires a code change (edit the constant, migrate if needed), not a dev-portal
  action. Some entries won't fit any existing tag well (e.g. a general technique
  that isn't tied to one injury/scenario type) — leaving it untagged is valid;
  don't force a poor-fit tag.
- Content disclaimer ("Educational reference only, not legal medical advice…")
  is displayed on all public first-aid pages and in the Terms — the catalog is not
  clinical advice.

## Entry fields

Title + category are required. `tags` is an optional array (validated server-side
against the whitelist). The rest are optional free-text, each sanitized on write:

`definition`, `description`, `process`, `dos`, `donts`,
`things_to_look_out_for`, `implications`, `indication`, `contraindications`,
plus `images` (an array of URLs).

## Search & filter (public `/first-aid`)

Three independent narrowing controls, all combinable: category tabs (All /
Procedures / Techniques), a topic-tag filter (13 chips, single-select), and a
free-text search box. Search runs a multi-column `ILIKE` across title,
definition, description, process, dos, donts, implications, indication,
contraindications, and the tags array — a term appearing in any one of those
fields matches, not just title/definition.

## Endpoints

| Method | Route | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/first-aid/entries` | Public | List/browse (paginated, searchable). |
| `GET` | `/api/first-aid/entries/[id]` | Public | Single entry detail. 404 on bad UUID. |
| `POST` | `/api/first-aid/entries/create` | Developer | Create. Rate-limited `first_aid_upload:<devId>` → 10 / hour. Title & valid category required. Emits `first_aid_upload`. |
| `PATCH` | `/api/first-aid/entries/[id]` | Any developer | Partial update; only supplied fields change. 404 on unknown id. Emits `first_aid_edit` with the changed field names. |
| `DELETE` | `/api/first-aid/entries/[id]` | Any developer | Hard delete. 404 on unknown id. Emits `first_aid_delete`. |

## Image handling

Images are uploaded via `POST /api/uploads` (multipart `file`) → Supabase Storage,
which returns a public URL saved on the entry. The upload endpoint validates type
(JPEG/PNG/WebP) and size (≤5 MB), rate-limits per uploader, and namespaces
first-aid images under a `first-aid/` prefix. Pasting a URL still works as a
fallback. Every stored URL is additionally passed through `safeHttpUrl()`, so only
`http(s)` URLs reach an `<img src>` sink. Max 10 images per entry. When
`SUPABASE_*` env is unset, uploads return 503 and only URL entry is available.

## Security notes

- All free-text fields go through `sanitizeText()`; all URLs through
  `safeHttpUrl()`. This is the XSS defence for the public detail page.
- Ownership is enforced server-side on every edit/delete — the client never decides
  it.
- Rate limiting caps upload spam per developer, not per IP, since the caller is
  always authenticated here.
