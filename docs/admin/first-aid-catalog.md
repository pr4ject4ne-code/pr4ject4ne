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
- Every entry is a `procedure` or a `technique` (`category`).
- Content disclaimer ("Educational reference only, not legal medical advice…")
  is displayed on all public first-aid pages and in the Terms — the catalog is not
  clinical advice.

## Entry fields

Title + category are required. The rest are optional free-text, each sanitized on
write:

`definition`, `description`, `process`, `dos`, `donts`,
`things_to_look_out_for`, `implications`, `indication`, `contraindications`,
plus `images` (an array of URLs).

## Endpoints

| Method | Route | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/first-aid/entries` | Public | List/browse (paginated, searchable). |
| `GET` | `/api/first-aid/entries/[id]` | Public | Single entry detail. 404 on bad UUID. |
| `POST` | `/api/first-aid/entries/create` | Developer | Create. Rate-limited `first_aid_upload:<devId>` → 10 / hour. Title & valid category required. Emits `first_aid_upload`. |
| `PATCH` | `/api/first-aid/entries/[id]` | Any developer | Partial update; only supplied fields change. 404 on unknown id. Emits `first_aid_edit` with the changed field names. |
| `DELETE` | `/api/first-aid/entries/[id]` | Any developer | Hard delete. 404 on unknown id. Emits `first_aid_delete`. |

## Image handling

Image storage is **deferred** in v1 — the endpoints accept URL strings (local FS in
dev; S3/server later). Every image URL is passed through `safeHttpUrl()`, so only
`http(s)` URLs survive; `javascript:`/`data:` URLs are dropped before they can reach
an `<img src>` sink. Max 10 images per entry. When real upload storage is wired,
add file-type (jpeg/png/webp) and size (≤5 MB) validation at the write path — this
is the current `TODO` in the create/edit routes.

## Security notes

- All free-text fields go through `sanitizeText()`; all URLs through
  `safeHttpUrl()`. This is the XSS defence for the public detail page.
- Ownership is enforced server-side on every edit/delete — the client never decides
  it.
- Rate limiting caps upload spam per developer, not per IP, since the caller is
  always authenticated here.
