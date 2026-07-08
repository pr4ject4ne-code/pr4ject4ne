# Homepage — Racoon Eye v1

Status: **discussed and confirmed** (2026-07-05). This is the spec the planner should build the homepage phase from.

## Theme (applies site-wide, not just homepage)

- Colors: blue (lighter azure), white, amethyst purple, plus a luminous **teal highlight/accent** (map route + nearest pin, active/live states).
- **Finish: Apple-style "liquid glass"** (updated 2026-07-08, supersedes the earlier "matte / hard-edge" rule). Depth comes from soft, layered shadows rather than hard borders; borders are hairline-faint. Frosted-glass surfaces (translucent + backdrop blur) are allowed for floating chrome (popups, overlays). The single source of truth for tokens is `src/app/globals.css`.
- No blending of blue/purple into white backgrounds as multi-stop gradient *fades* (a colored block still meets white cleanly; soft shadows are the transition, not color bleed).
- No text rendered in blue or purple sitting directly on a white background (contrast/legibility rule — colored text always sits on a colored surface).
- Purple = **amethyst** specifically, not generic purple.

## Logo

- "Racoon Eye" mark: a minimal raccoon face — only nose, eye, and eye-cutout (mask) shapes are visible.
- Very round edges throughout (no sharp corners).
- Rendered in amethyst or blue (single-color mark, not both at once).

## Top bar layout

Left to right:
1. **Logo** (far left).
2. **Search bar** (left-of-center). Single field, three search modes it must support:
   - Nearest hospital (geolocation-based).
   - Specific hospital (name/text search).
   - Symptom search → recommends a hospital. **Needs clinical/product attention before launch** — this is the riskiest mode (overlaps with first-aid triage guidance rules: recommend/route, never diagnose).
3. **Hamburger menu** (far right, same horizontal row as logo/search) — represented as 3 vertical lines. Expands to reveal two items:
   - **Profile** — opens dashboard if logged in, otherwise login/sign-up.
   - **First Aid** — navigates to the First Aid page ([first-aid.md](first-aid.md)).

## Main area — map

- Full-bleed background: `100vw` x `100vh`.
- Digitized/interactive map, not a static image.
- **Map stack decision:** Leaflet.js + OpenStreetMap tiles + OSRM routing.
  - Reason: fully open-source, no API key/account/billing tier required anywhere in the stack — avoids any cost inquiry. Mapbox and OpenRouteService were considered but both require signup even at free tier, which risks a billing conversation later if usage caps are hit.
  - OSRM can start against the public demo server for MVP; self-host later if volume requires it (flag to founder if/when that becomes necessary).
- Recommended/searched hospitals are drawn on the map with their route from the user's location, annotated with:
  - Estimated arrival time (from OSRM routing).
  - Current availability (data source TBD — likely from the hospital's self-managed listing, see SPEC.md module 1).

## Below the map — hospital mini-profiles

- One expandable mini-profile card per recommended/searched hospital.
- Collapsed card shows: name, photo(s), address, specialties + availability (with dates if applicable), operating/visit hours.
- Clicking/expanding does **not** show more inline — it navigates to a full hospital profile page (separate page, spec TBD, not yet discussed).

## Footer

- Logo on the **right**.
- Left side: links to Privacy Policy, Terms & Conditions, and a link-tree (social links aggregator).

## Cross-page consistency

The top bar and footer defined here are shared components — every other page in the app (dashboard, login, first aid, hospital profile, etc.) reuses them as-is. Confirmed 2026-07-05 when the dashboard was discussed.

## Open items / not yet decided

- Symptom-search → hospital recommendation: needs explicit design attention (safety, liability, wording) before build — flag to security-auditor and treat like the first-aid disclaimer requirement.
- Hospital full-profile page (reached by clicking a mini-profile) — not yet discussed, will get its own page doc when it is.
- Availability data source/refresh mechanism for map annotations — not yet decided.
