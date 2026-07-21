# Founder work list — 2026-07-21

Raw list as given by founder, verbatim (numbering preserved for cross-referencing in commits/PLAN). Status column updated as items are scoped/built.

| # | Item | Status |
|---|------|--------|
| 1 | Couldn't see the smooth, fluid, water-like transition/effect (liquid-glass) | Open — needs live visual verification first (browser pane has been unreliable; may need founder to confirm what's actually rendering) |
| 2 | Rankings, ratings, # of reviews, and rating breakdown (region/national/world) on hospital profile top right | Open — new feature |
| 3 | Hamburger menu: if enough horizontal space, show contents inline on the right instead of requiring the expander (new customers should see full site offering immediately) | Open |
| 4 | Hospital profile picture + map: change 100vh → 80vh (founder says 100vh was a mistake — no visual cue that content continues below) | Done — scoped to homepage only (the only full-viewport-height element in the codebase; hospital-profile gallery was already an aspect-ratio box, not affected). `.stage` 100dvh→80vh so the footer's top edge peeks into view; `.mapLayer` changed from `position: absolute` (scoped to `.stage`) to `position: fixed; inset:0` so the map is a true full-viewport backdrop that stays put as the page scrolls; new `.darkenOverlay` (fixed, z-index 1, below the z-index 400 results panel) darkens progressively via a `--map-darken` CSS var driven by a rAF-throttled scroll listener in `HomeClient.tsx` (imperative DOM write, no React re-render per scroll tick, capped at 0.55 opacity). Verified no ancestor sets transform/filter/perspective/contain that would break `position: fixed`. `tsc`, lint, and full Jest suite (251 tests) all pass. Confirmed via dev server + curl that the compiled CSS matches (`.stage{height:80vh}`, `.mapLayer{position:fixed}`, `.darkenOverlay{position:fixed;z-index:1;...}`) and the page renders 200 with no server/compile errors. **Follow-up live check (same day):** with browser access, confirmed structurally in a real DOM — stage renders at exactly 80% of viewport height, `.mapLayer` is `position:fixed` and stays at `top:0` regardless of scroll, footer's top edge sits inside the viewport (peeks in as intended). Could NOT visually confirm the darken animation itself firing — this browser pane's tab runs with `document.visibilityState:"hidden"`, which suspends `requestAnimationFrame` and CSS transitions in Chromium (background-tab power-saving), so the scroll listener's rAF-scheduled updates never execute in this harness. Isolated CSS tests confirmed the `var(--map-darken)`-in-`rgba()` wiring itself resolves correctly outside the suspended-transition case, so this reads as an environment limitation, not an app bug — but the actual darken-while-scrolling behavior should still get a real-eyes check at localhost:3000 or production before calling it fully signed off. |
| 5 | Nav bar purple looks "sick and pale" — make bar 80–95% transparent except on hover (preserve legibility of bar contents at that transparency) | Done — non-floating `.bar` now ~86% transparent at rest (dark ink text/icons for contrast against light pages), raises to filled violet glass + white text on hover/focus-within; homepage `.floating` map variant untouched |
| 6 | Centralize (center) the search bar in the nav bar | Done — `Header.module.css` switched to a 3-col grid (`left`/`search`/`right`), search bar now truly centers regardless of side-column width; responsive breakpoints re-tuned (900px still drops search to its own row, now grid-area based) |
| 7 | Can't expand results on the search bar | Bug — needs repro |
| 8 | Symptom search should actually work and link to hospitals ranked by price, location, availability (closest date/time), and general rank | Open — significant feature, ranking algorithm needed |
| 9 | Footer links → Linktree (URL to come later) | **Blocked on founder** — keep reminding |
| 10 | Remove doctors section for pharmacies/non-doctor institutions; verified accounts can add one if applicable | Open |
| 11 | Fix the routing system (map) | Bug — needs repro (may overlap with prior routing fixes) |
| 12 | Custom scrollbars (default ones look tacky) | Done — site-wide thin, pill-shaped, glassy-gradient scrollbar (`globals.css`, `--color-amethyst`/`--color-blue-light` tokens), hover-darken; Firefox `scrollbar-width`/`scrollbar-color` fallback |
| 13 | Homepage hospital side panel: filters by distance (km radius), private vs public, rating, day of week | Open — new feature |
| 14 | Verified accounts can add/organize services by department, sub-classifiable as they see fit | Open — new feature |
| 15 | Logo change (founder will provide the new logo asset later) | **Blocked on founder** — keep reminding |
| 16 | Direct question: "panda eye or raccoon eye?" statistically/objectively | Answer directly, no build needed |
| 17 | Password creation instructions + green/red-light validation (strength indicator) | Open — new feature |
| 18 | Email confirmation system + welcome email for new users | Open — significant feature (needs email delivery infra) |
| 19 | Forgot-password flow, secure + functional; requires email confirmation; warn users about their unique IHN string at signup and in the welcome email | Open — significant feature, depends on #18 |
| 20 | Rename "Biodata Farm" → "Biodata" everywhere | Done — dashboard heading + `docs/pages/dashboard.md` updated; no test asserted on the old string |
| 21 | No arrangement for a profile photo | Open — new feature |
| 22 | Add a dropdown explanation of why [biodata/IHN] is important | Done — collapsible "Why does this matter?" added to `IHNCodeDisplay`, frosted-glass treatment matching `Card.module.css`'s glass tokens |
| 23 | Users should be able to select what is visible through the IHN link (granular field-level sharing controls) | Open — significant feature, ties into the long-standing "IHN sharing is a dead path" item from memory |
| 24 | Homepage "string" tab: lets people look up a user's IHN string for biodata extraction, output as an organized document; must be extensively logged, dev-accessible | Open — significant feature |
| 25 | QR code accessible on the string tab | Open — depends on #24 |
| 26 | Footer help bar: detailed instructions organized by function/procedure, with its own keyword search | Open — new feature |
| 27 | Religion, tribe, ethnicity should be optional | Done — confirmed `religious_status` was already optional (not in `BioDataForm` validation); added optional `tribe`/`ethnicity` to `BiodataLayer` + form inputs; `sanitizeLayer` is a generic string sanitizer (no fixed allowlist) so no save-path change needed |
| 28 | Chronic disease section needs slots: disease, duration, progression, complication, care, cause (recommend doctor aid) | Open — schema + form change |
| 29 | Build a system to generate a report from IHN string/QR data — neatly organized, photo top-right, declaration + doctor signature block (name/contact) where doctor-recommended fields were approved | Open — large feature, depends on #23/#24/#30 |
| 30 | Doctor must explicitly consent to use of their name/info; doctor must be contacted and consent verified before approval; space to record denial of consent | Open — large feature, compliance-sensitive |
| 31 | Bolder/thicker/sharper-edged font | Done — base body weight 400→500, headings 700/800 with tightened letter-spacing (`globals.css`); same system-ui stack, no typeface swap; checked Button/Card/Header, no overflow/contrast regressions (component-level font-weight overrides take precedence) |
| 32 | Some static info feels "base"/out of place — needs a content/design pass | Open — needs founder to point at specifics |
| 33 | First aid entries don't feel intuitive; no space for pictures; keep simple but make intuitive | Open — UX rework |
| 34 | Add signs/symptoms section before procedure in first-aid entries (so people can tell if indicated); symptom search bar should require min. 2 symptoms to narrow to the right entry | Open — schema + search algorithm change |

## Standing reminders owed to founder
- **#9** — need the Linktree URL for footer links.
- **#15** — need the new logo asset.

## Direct question to answer now
- **#16** — panda eye vs raccoon eye (see chat response): raccoon eye, no contest — stronger/more distinctive brand hook, already built.

## Phased execution plan
See [PLAN-worklist.md](PLAN-worklist.md) for the full phased plan (planner pass, 2026-07-21) — recon findings, phase groupings, parallelization, and open decisions. Update this file's Status column as items land; keep the raw list above unedited.
