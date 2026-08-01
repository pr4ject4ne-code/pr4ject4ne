# Homepage — Racoon Eye v1

Status: **live, shipped** (last full rebuild: 2026-08-01). This describes what is actually
in `src/app/HomeClient.tsx` / `HomeClient.module.css` today, not the original mockup —
see the "History" section at the bottom for how the design evolved and why.

## Theme (applies site-wide, not just homepage)

- Colors: blue (lighter azure), white, amethyst purple, plus a luminous **teal highlight/accent** (map route + nearest pin, active/live states).
- **Finish: Apple-style "liquid glass"** (updated 2026-07-08, supersedes the original "matte / hard-edge" rule). Depth comes from soft, layered shadows rather than hard borders; borders are hairline-faint. Frosted-glass surfaces (translucent + backdrop blur) are reserved for **floating chrome only** — on the homepage that means the hero's search pill and the site Header, not page content. The map panel and result cards are plain page-content surfaces (shadow + hairline border, no blur), per the project's "glass = chrome only" rule. The single source of truth for tokens is `src/app/globals.css`.
- No blending of blue/purple into white backgrounds as multi-stop gradient *fades* (a colored block still meets white cleanly; soft shadows are the transition, not color bleed).
- No text rendered in blue or purple sitting directly on a white background (contrast/legibility rule — colored text always sits on a colored surface).
- Purple = **amethyst** specifically, not generic purple.

## Logo

- "Racoon Eye" mark: a minimal raccoon face — only nose, eye, and eye-cutout (mask) shapes are visible.
- Very round edges throughout (no sharp corners).
- Rendered in amethyst or blue (single-color mark, not both at once).

## Top bar

Shared `Header` component (translucent glass, `floating` on the homepage so the page reads through it). Left to right:
1. **Logo** (far left).
2. **Search bar** (`src/components/SearchBar.tsx`, extracted from Header 2026-08-01 so it can be reused in the homepage hero below) — a segmented pill mode switcher (`Nearby` / `By name` / `By symptom`, real buttons with `aria-pressed`, not a native `<select>`) plus one input/picker and a Search button. Three modes:
   - **Nearby** — geolocation-based nearest-hospital search.
   - **By name** — specific-hospital text search.
   - **By symptom** — two-stage: a Stage-1 red-flag/severity emergency gate (`src/lib/symptom-red-flags.ts`) that short-circuits straight to the emergency outcome, then a closed, region-based non-emergency symptom multi-select that recommends specialties, never diagnoses.
3. **Hamburger menu** (far right) — expands to reveal **Profile** (dashboard if logged in, else login/sign-up) and **First Aid**.

The homepage renders the search bar **once**, inside the hero (see below) — `Header` does not duplicate it there.

## Hero section

- Headline + subhead, then the glass-wrapped `SearchBar` (`.searchGlass` — the one true glass surface on the page), then a small trust line ("N hospitals in the directory") once the first load resolves.
- Soft radial amethyst/teal gradient wash behind the text, meeting the page's off-white background cleanly (no color bleeding into white, per the theme rule).

## Expandable map section

- Normal in-flow section (not a fixed-viewport backdrop, not full-bleed 100vw/80vh — that full-bleed model was retired in the 2026-08-01 rebuild, see History). Sits in the page's ordinary scroll, `max-width: 1180px`, centered.
- Header row: "The map" title + a short description, and a toggle button (`aria-expanded`, `aria-controls="homepage-map-panel"`) reading "Expand map" / "Collapse map" with a chevron that rotates 180° when open.
- The map panel itself is a plain page-content surface (hairline border + shadow, no blur) with a fixed pixel height that **animates between two states** on toggle:
  - Collapsed (default): **320px**.
  - Expanded: **580px**.
  - `Map.tsx`'s own `ResizeObserver → invalidateSize()`-equivalent keeps the MapLibre canvas correctly sized through the whole height transition (not just once it settles), so there are no gray/blank tile gutters mid-animation.
- Digitized/interactive map, not a static image. Recommended/searched hospitals are drawn as pins with a route line to the nearest/selected hospital from the user's location. **No ETA number is shown** (removed 2026-08-01 — OSRM/MapTiler's free routing has no real-time or historical traffic model, so a driving-time figure for Enugu-area trips read as implausibly optimistic; the founder chose removal over adding a paid traffic-aware provider, which would conflict with the project's no-billing-signup policy). The route line itself is a separate, kept feature.
- **Map stack: MapLibre GL + MapTiler vector tiles** (migrated from Leaflet/OpenStreetMap-raster on 2026-07-12 — see memory.md — because the Leaflet stack had real routing/framing bugs, not because of cost; MapTiler's key is public/client-side by design and free-tier, protected via Allowed Origins rather than a billing gate). Falls back to raster OSM tiles if `NEXT_PUBLIC_MAPTILER_KEY` is unset.

## Results section

- Normal, in-flow, scrollable grid below the map section — **not** a floating panel, bottom sheet, or docked side panel. The mobile-drag-to-resize "sheet" interaction model (`src/lib/sheetDrag.ts`, minimized/collapsed/expanded snap states with flick-velocity detection) that the homepage used briefly is **retired** as of the 2026-08-01 rebuild; there is no sheet, no drag handle, and no scroll-linked map darken/parallax anywhere on this page anymore.
- Heading ("Hospitals" or "Results for '<query>'") + result count + a Filters toggle (`HospitalFilters`).
- Emergency banner (`role="alert"`, persistent "Call 112" link) when the Stage-1 gate fired; a geolocation-denied notice with a manual-location fallback form; a non-diagnostic "people with symptoms like this usually see: …" guidance line for a non-emergency symptom search.
- Each hospital renders as a **`HospitalResultCard`** (`src/components/HospitalResultCard.tsx`, replacing the old `HospitalMiniProfile`) in a responsive grid (3 columns desktop, 1 column ≤880px): photo/placeholder media block with verified/24h/distance-km badges, name, address, star rating, and up to 3 specialty pills. The whole card links to the hospital's full profile page (`/hospitals/[id]`) — clicking never expands inline, matching the original spec.
- "Load more" pagination button when more results exist than the current page.

## Footer

- Logo on the **right**.
- Left side: links to Privacy Policy, Terms & Conditions, and a link-tree (social links aggregator).

## Cross-page consistency

The top bar and footer defined here are shared components — every other page in the app (dashboard, login, first aid, hospital profile, etc.) reuses them as-is. Non-homepage pages get `showSearch={false}` (a clean brand+hamburger header, no search bar) except the hospital profile page, which passes its own `onHospitalSearch` handler into the same `SearchBar`.

## Open items / not yet decided

- Symptom-search → hospital recommendation: the closed-vocabulary two-stage design (red-flag gate + region-based symptom list) is built and shipped, but has not had a dedicated clinical/liability review beyond the founder's own product decisions — flag to security-auditor if the vocabulary or gate thresholds change.
- Availability data source/refresh mechanism for map annotations — still not decided.

## History (how this page got here)

- **2026-07-05**: original spec — full-bleed `100vw`/`80vh` fixed map backdrop with scroll-linked darkening, expandable mini-profile cards below it, Leaflet.js + OpenStreetMap + OSRM as the map stack.
- **2026-07-11 to 2026-07-28**: visual overhaul to liquid-glass; results became a floating frosted-glass panel — bottom sheet + drag handle on mobile, docked side panel on desktop (`src/lib/sheetDrag.ts`).
- **2026-07-12**: map stack migrated Leaflet → MapLibre GL + MapTiler (routing/framing bugs on the old stack, not a cost decision).
- **2026-08-01**: full homepage rebuild against a founder mockup — hero section, expandable (not fixed/full-bleed) map section, normal scrollable results grid using the new `HospitalResultCard`. The fixed-viewport map backdrop, scroll-linked darken, and the sheet-drag results panel were all retired in this rebuild; `SearchBar` was extracted from `Header` so the hero could reuse the real search system instead of rebuilding it. ETA display removed the same day (see the map-section note above).
