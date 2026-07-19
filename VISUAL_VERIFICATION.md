# Visual Verification Checklist — Phase 2 Liquid Glass

**Server running on:** http://localhost:49784 (or your current dev port)

## Interactive Effects to Verify

### 1. **Hospital Cards — Pointer-Tracked Sheen** ✅ Code Ready
**File:** `src/components/HospitalMiniProfile.module.css` + `HospitalMiniProfile.tsx`
**What to test:**
- [ ] Hover over any hospital card in the homepage results panel
- [ ] A white specular highlight (sheen) should appear and follow your cursor across the card
- [ ] The sheen is a radial gradient that's centered on your mouse position
- [ ] It fades out when you move away from the card
- [ ] Effect works on all 6 hospital cards in the results list

**CSS Implementation:**
- `.sheen` pseudo-element with `radial-gradient` positioned at `--mx`/`--my` CSS variables
- `onPointerMove` handler sets `--mx`/`--my` to cursor position
- Opacity transitions smoothly in/out on hover

---

### 2. **Buttons — Gloss Overlay + Jelly Squash** ✅ Code Ready
**File:** `src/components/Button.module.css`
**What to test:**
- [ ] Click any button on the page (Login, Search, "Load more", etc.)
- [ ] Button should have a glossy appearance with a white gradient overlay
- [ ] On click/press, button should squash slightly (scale ~0.97) with a bouncy spring animation
- [ ] Effect is subtle and uses the `--spring` easing (overshoots slightly, then settles)

**CSS Implementation:**
- `::before` pseudo-element with linear gradient for gloss
- `:active` state uses `scale(0.97)` with `--spring` easing
- Works on all button variants (primary, secondary, ghost, danger)

---

### 3. **Login Segmented Control — Liquid Sliding Pill** ✅ Code Ready
**File:** `src/components/LoginForm.module.css`
**What to test:**
- [ ] Navigate to `/login` or log out and return to login page
- [ ] Look at the "Sign in" / "Create account" segmented control tabs
- [ ] Click between tabs: the white pill background should slide smoothly from one tab to the other
- [ ] The animation uses spring easing for a bouncy, liquid feel
- [ ] The pill animates in and out cleanly

**CSS Implementation:**
- `.activeTab::before` pseudo-element renders the white pill
- `transition: all var(--spring) ease` on the pseudo-element
- Position/size animate via CSS properties

---

### 4. **Homepage Panel Refraction — Over the Map** ✅ Code Ready
**File:** `src/app/HomeClient.module.css` + `src/components/LiquidFilters.tsx`
**What to test:**
- [ ] On the homepage at `/`, view the results panel (hospital cards area)
- [ ] The panel should have a frosted-glass appearance with refraction
- [ ] Look through the panel at the map behind it — the map should appear slightly distorted/bent through the glass (refraction effect)
- [ ] The panel is more transparent than regular glass surfaces (ultra-transparent design for map visibility)
- [ ] The bottom edge has an inset white highlight (rim light) suggesting glass thickness

**CSS Implementation:**
- `backdrop-filter: url(#lg-refract) saturate(200%) blur(18px)` applies the refraction filter
- `#lg-refract` SVG filter uses `feTurbulence` + `feDisplacementMap` for the bend effect
- Inset box-shadow provides the rim highlight

---

### 5. **Dashboard Account Section — Password Change UI** ✅ Code Ready
**File:** `src/app/dashboard/DashboardClient.tsx` + `HospitalDashboardClient.tsx`
**What to test:**
- [ ] Patient: Go to `/dashboard` (sign in as a patient first if needed)
- [ ] Look at the "My account" section at the top
- [ ] Should have "Current password" and "New password" fields
- [ ] Enter passwords and click "Change password"
- [ ] On success: "Password changed. Your other sessions were signed out." message appears
- [ ] Hospital Staff: Check `/hospital/dashboard` (if you have hospital credentials) — same UI below the tabs

**Implementation:**
- Form submits to `PATCH /api/account/password` (already working backend)
- Success/error messages styled with color feedback
- Form clears on successful submission

---

## Visual Polish Checklist

- [ ] **Gloss overlays** appear on all buttons (primary, secondary, ghost, danger variants)
- [ ] **Jelly animation** fires on every button press (not just some)
- [ ] **Sheen effect** is smooth and responsive (no lag following cursor)
- [ ] **Segmented control pill** slide is fluid and uses spring easing (bouncy overshoot)
- [ ] **Refraction on panel** is visible in bright light (feTurbulence distortion shows)
- [ ] **Theme consistency** — all interactions use `--spring` easing + glass + purple-forward colors
- [ ] **No visual regressions** — existing pages look the same (first-aid, filter, hospital profile, etc.)

---

## Theme Token Reference

All interactive effects use these CSS variables (in `src/app/globals.css`):
```css
--spring: cubic-bezier(0.34, 1.56, 0.64, 1);  /* Bouncy easing for interactions */
--glass-blur: saturate(200%) blur(18px);       /* Glass effect base */
--color-amethyst: #6d4aff;                     /* Purple (primary) */
--color-highlight: #12b5c9;                    /* Teal (map accents) */
--shadow: 0 2px 6px rgba(...), 0 12px 28px ... /* Soft depth */
```

---

## If Visual Issues Found

1. **Sheen doesn't follow cursor:**
   - Check `HospitalMiniProfile.tsx` line 25-30 (onPointerMove handler)
   - Check CSS custom properties in `.sheen` rule

2. **Buttons aren't gloss/jelly:**
   - Check `Button.module.css` `::before` and `:active` rules
   - Verify `--spring` token is defined in globals.css

3. **Segmented pill doesn't slide:**
   - Check LoginForm.module.css `.activeTab::before` rule
   - Verify transition is on the right element

4. **Refraction doesn't show:**
   - Check LiquidFilters.tsx SVG is mounting (search for `lg-refract` in page source)
   - Check HomeClient.module.css `.panel` has `backdrop-filter: url(#lg-refract)`
   - Note: Chromium-based browsers required; Safari degrades gracefully

---

## Next Steps

Once visual verification is complete:
1. Note any issues / surprises
2. We can iterate on UX improvements (spacing, sizing, interaction timing, etc.)
3. Polish remaining pages (first-aid, filter, hospital-profile)
