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
`src/components/Card.module.css` is already correct — match its register
(white surface, hairline border, token radius, token shadow). Do NOT re-edit
Card, Header, HomeClient, HospitalMiniProfile, or Map — those are done.

## Verification
Do **not** run `npm run build` (concurrent builds race on `.next/` on Windows).
Leave the build + visual check to the orchestrator, who runs it once centrally.
