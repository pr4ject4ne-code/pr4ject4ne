# Liquid-glass visual system (site-wide)

The single source of truth for tokens is `src/app/globals.css`. This file is the
**conversion spec**: how every component/page stylesheet must be brought from the
old flat "matte" look to the liquid-glass finish. Founder-approved 2026-07-08.

## Non-negotiables
- **Keep the primary colors.** Blue, white, amethyst are the brand. Teal
  (`--color-highlight`) is an *accent only* — active/live/nearest states, never a
  new primary. Do not introduce other hues.
- **Colored-text rule still holds:** blue/amethyst text never sits directly on
  plain white — it sits on a tinted surface (`--color-blue-light`, `--color-amethyst-light`)
  or is white-on-color.
- CSS-only changes wherever possible. Only touch `.tsx` to add a wrapper
  `className` when a surface genuinely needs one; never change component logic.

## The conversion (apply consistently)
1. **Borders → hairline + shadow.** Replace hard `1px solid var(--color-border)`
   structural borders with `1px solid var(--color-hairline)` and let depth come
   from shadow. Keep a visible divider only where it's a genuine content separator.
2. **Radii up.** Small controls/inputs/buttons → `var(--radius-sm)`; cards/panels
   → `var(--radius)`; large hero/overlay panels → `var(--radius-lg)`.
3. **Shadows via tokens.** Replace every literal `rgba(...)` box-shadow with
   `var(--shadow-sm)` (resting cards), `var(--shadow)` (raised/hover), or
   `var(--shadow-lg)` (floating panels). No hardcoded shadow colors.
4. **Floating chrome = glass.** Anything that floats over content — Modal panel,
   dropdown menus, popovers, the map popup, the suggestion tab — uses:
   `background: var(--glass-bg); backdrop-filter: var(--glass-blur);
   -webkit-backdrop-filter: var(--glass-blur); border: 1px solid var(--glass-border);
   box-shadow: var(--shadow-lg);`
5. **Fluid interactions.** Interactive surfaces (cards, buttons, list rows, nav
   items) get `transition: transform .15s ease, box-shadow .15s ease, background .15s ease;`
   and a hover lift: `transform: translateY(-2px); box-shadow: var(--shadow);`
   Buttons: resting `var(--shadow-sm)`, hover lift, keep existing brand colors.
6. **Inputs.** Hairline border, `var(--radius-sm)`, off-white/white fill; focus =
   amethyst ring (`box-shadow: 0 0 0 3px var(--color-amethyst-light)`) + amethyst
   border, no default outline.

## Reference implementation
`src/components/Card.module.css` is the shared register. **Updated 2026-07-26
(worklist #1, interaction-feel engineering pass)** — Card now has two
variants, not one fixed style: `<Card variant="glass">` (default) and
`<Card variant="plain">`. Per Apple's own liquid-glass guidance, glass is
reserved for the navigation/floating-chrome layer, not stamped on every
surface — stacking/overusing it is exactly why nothing used to read
distinctly AS glass. **Kept glass:** Header (`Header.module.css`, unchanged),
the homepage results panel (`HomeClient.module.css` — doesn't use the Card
component, has its own refraction/backdrop-filter), Modal/dropdown popovers
(`Modal.module.css`), the IHN "why does this matter?" collapsible
(`IHNCodeDisplay.module.css`'s `.whyBody`, independent of Card), the Help
panel (`HelpBar.module.css`, rendered inside Modal), `HospitalMiniProfile`
(explicitly kept — the homepage's pointer-tracked-sheen exemplar, sits
inside the already-glass results panel), and `HospitalProfileClient`'s
in-page search-results dropdown (`.searchResults`, behaves like a popover).
**Converted to `variant="plain"`:** every other `<Card>` consumer across the
app (~23 files, ~40 usages) — hospital-profile info/hours/departments/
ranking/doctor-roster sections, dashboard/hospital-dashboard/dev-portal
panels, all auth-flow cards (login/signup/forgot/reset/verify-email), First
Aid catalog + detail, IHN's own outer card, string-lookup, sharing-prefs,
results-list. These are page CONTENT, not floating chrome — `.plain` uses
the same on-theme off-white/hairline-border/shadow-token register, just
without blur.

Do NOT re-edit Header or Map (still done/unchanged). Card, HomeClient, and
HospitalMiniProfile WERE deliberately re-edited this pass (spring easing,
velocity-aware sheet drag, a parallax proof-point, the sheen fade, the glass
variant split, reduced-motion + device-tier fallbacks) — this overrides the
prior "don't touch" note for those three files specifically, same as the
2026-07-11 homepage rebuild overrode an earlier version of this same note.
`--spring` (globals.css) is a real sampled damped-spring `linear()` curve now,
not a bezier — every consumer needs an explicit `<duration> var(--spring)`
pair (a bare `var(--spring) ease` or `var(--spring) 0s` is invalid/inert CSS;
three such bugs existed in `LoginForm.module.css` and one in
`Button.module.css` before this pass, silently killing the "spring feel" —
fixed, see inline comments at each site).

## Verification
Do **not** run `npm run build` (concurrent builds race on `.next/` on Windows).
Leave the build + visual check to the orchestrator, who runs it once centrally.
