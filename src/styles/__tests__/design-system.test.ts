/**
 * Source-level design-system enforcement.
 *
 * These tests read the actual `.module.css` files off disk and pattern-match
 * their rule blocks — no browser, no CSS parser, no rendering. They exist
 * because the three rules below are repo-wide invariants that no amount of
 * code review reliably holds across many parallel builders:
 *
 *   1. anything that looks clickable must FEEL clickable (hover + press),
 *   2. no form control may render below the 16px iOS focus-zoom floor,
 *   3. glass (backdrop-filter) is floating chrome only, never page content.
 *
 * Where the current codebase genuinely violates a rule, the offending files
 * are listed in an explicit, documented allowlist so the suite is green by
 * construction TODAY while still failing the moment a NEW violation appears.
 * Entries are removed as later phases actually fix each file. Never add a file
 * to an allowlist to silence a failure you just introduced.
 */
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(process.cwd(), 'src');

// ---------------------------------------------------------------------------
// Minimal CSS scanning helpers (brace-depth walk, not a real parser — enough
// to get at "selector { declarations }" pairs, including inside @media).
// ---------------------------------------------------------------------------

interface CssRule {
  selector: string;
  body: string;
}

function listModuleCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listModuleCssFiles(full));
    else if (entry.name.endsWith('.module.css')) out.push(full);
  }
  return out.sort();
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Flattens a stylesheet to its style rules, descending into @media/@supports. */
function parseRules(css: string): CssRule[] {
  const src = stripComments(css);
  const rules: CssRule[] = [];

  const walk = (start: number, end: number): void => {
    let i = start;
    let preludeStart = start;
    while (i < end) {
      const ch = src[i];
      if (ch === '{') {
        const prelude = src.slice(preludeStart, i).trim();
        let depth = 1;
        let j = i + 1;
        while (j < end && depth > 0) {
          if (src[j] === '{') depth += 1;
          else if (src[j] === '}') depth -= 1;
          j += 1;
        }
        const body = src.slice(i + 1, j - 1);
        if (prelude.startsWith('@')) {
          // Conditional groups contain nested style rules; keyframes/font-face
          // contain declarations we don't care about.
          if (/^@(media|supports|layer|container)\b/.test(prelude)) walk(i + 1, j - 1);
        } else if (prelude) {
          rules.push({ selector: prelude, body });
        }
        i = j;
        preludeStart = j;
      } else if (ch === ';') {
        i += 1;
        preludeStart = i;
      } else {
        i += 1;
      }
    }
  };

  walk(0, src.length);
  return rules;
}

/** The class a compound selector actually targets, e.g. `.a .b:hover` -> `b`. */
function targetClass(compound: string): string | null {
  const matches = compound.trim().match(/\.([A-Za-z_][\w-]*)/g);
  const last = matches?.[matches.length - 1];
  return last ? last.slice(1) : null;
}

function allClasses(selector: string): string[] {
  return (selector.match(/\.([A-Za-z_][\w-]*)/g) ?? []).map((c) => c.slice(1));
}

function relative(file: string): string {
  return path.relative(process.cwd(), file).replace(/\\/g, '/');
}

const MODULE_CSS_FILES = listModuleCssFiles(SRC_DIR);

// ---------------------------------------------------------------------------
// 1. Press coverage
// ---------------------------------------------------------------------------

/**
 * ALLOWLIST — files that still declare `cursor: pointer` on a class with no
 * matching `:hover` + `:active` treatment and no `composes:` from
 * `src/styles/interactions.module.css`.
 *
 * This is a snapshot of the pre-redesign codebase, captured so the rule can be
 * enforced on NEW code immediately instead of waiting for a big-bang cleanup.
 * Each later redesign phase REMOVES the files it fixes from this list. The
 * list may only ever shrink: adding an entry hides a real regression.
 */
const PRESS_COVERAGE_ALLOWLIST: string[] = [
  'src/app/HomeClient.module.css',
  'src/app/dev/DevShell.module.css',
  'src/app/dev/primary/DevPrimary.module.css',
  'src/app/hospital/HospitalShell.module.css',
  'src/app/hospital/dashboard/HospitalDashboard.module.css',
  'src/components/BioDataForm.module.css',
  'src/components/Calendar.module.css',
  'src/components/IHNCodeDisplay.module.css',
  'src/components/SharingPrefsPanel.module.css',
  'src/components/SuggestionsBoard.module.css',
];

function pressCoverageFailures(file: string): string[] {
  const css = fs.readFileSync(file, 'utf8');
  const rules = parseRules(css);
  const hoverClasses = new Set<string>();
  const activeClasses = new Set<string>();

  for (const rule of rules) {
    for (const compound of rule.selector.split(',')) {
      if (/:hover/.test(compound)) allClasses(compound).forEach((c) => hoverClasses.add(c));
      if (/:active/.test(compound)) allClasses(compound).forEach((c) => activeClasses.add(c));
    }
  }

  const failures: string[] = [];
  for (const rule of rules) {
    if (!/cursor:\s*pointer/.test(rule.body)) continue;
    // Composing the shared mechanic brings its own :hover/:active with it.
    if (/composes:[^;]*interactions\.module\.css/.test(rule.body)) continue;
    for (const compound of rule.selector.split(',')) {
      const cls = targetClass(compound);
      if (!cls) continue;
      const missing: string[] = [];
      if (!hoverClasses.has(cls)) missing.push(':hover');
      if (!activeClasses.has(cls)) missing.push(':active');
      if (missing.length > 0) failures.push(`${compound.trim()} (missing ${missing.join(' + ')})`);
    }
  }
  return [...new Set(failures)];
}

describe('press coverage: clickable things must feel clickable', () => {
  it('every class with cursor:pointer has :hover + :active, or composes the shared mechanic', () => {
    const offenders: string[] = [];
    for (const file of MODULE_CSS_FILES) {
      const rel = relative(file);
      if (PRESS_COVERAGE_ALLOWLIST.includes(rel)) continue;
      const failures = pressCoverageFailures(file);
      if (failures.length > 0) offenders.push(`${rel}: ${failures.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the allowlist only names files that actually exist and still fail', () => {
    // Keeps the allowlist honest: a fixed (or deleted) file must be removed
    // from it, so the list can only ever shrink.
    const stale = PRESS_COVERAGE_ALLOWLIST.filter((rel) => {
      const full = path.join(process.cwd(), rel);
      if (!fs.existsSync(full)) return true;
      return pressCoverageFailures(full).length === 0;
    });
    expect(stale).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Control font floor (the iOS focus-zoom guard)
// ---------------------------------------------------------------------------

/** Known font-size tokens, in px, so `font-size: var(--fs-*)` can be checked. */
const FONT_SIZE_TOKENS_PX: Record<string, number> = {
  '--fs-control': 16,
  '--fs-body': 16,
  '--fs-body-sm': 14.4,
  '--fs-caption': 12.8,
  '--fs-micro': 11.52,
  '--fs-nav': 14.4,
  '--fs-h4': 15.68,
  '--fs-h3': 17.6,
};

/** Resolves a font-size value to px, or null when it can't be judged. */
function fontSizeToPx(value: string): number | null {
  const v = value.trim().toLowerCase();
  const varName = v.match(/^var\(\s*(--[\w-]+)/)?.[1];
  if (varName) return FONT_SIZE_TOKENS_PX[varName] ?? null;
  const num = v.match(/^([\d.]+)(rem|em|px|%)$/);
  if (!num?.[1] || !num[2]) return null; // inherit / clamp() / unknown — not a floor violation
  const n = parseFloat(num[1]);
  if (num[2] === 'px') return n;
  if (num[2] === '%') return (n / 100) * 16;
  return n * 16; // rem, and em (nearest ancestor is 16px in every real case here)
}

/** True when a selector targets a real form control. */
function targetsFormControl(compound: string): boolean {
  // Bare element selector: `select`, `input[type='text']`, `.filters select`.
  if (/(^|[\s>+~(])(input|textarea|select)([\s.:[)]|$)/.test(compound.trim())) return true;
  // Class named after a control: .input, .searchInput, .textarea, .inputError.
  // camelCase/kebab split, so `.selected` (a calendar day) is NOT a control.
  const cls = targetClass(compound);
  if (!cls) return false;
  return cls
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .some((word) => ['input', 'textarea', 'select'].includes(word.toLowerCase()));
}

describe('control font floor: no input/select/textarea below 16px', () => {
  it('every form-control rule declares a font-size of at least 1rem/16px', () => {
    const offenders: string[] = [];
    for (const file of MODULE_CSS_FILES) {
      for (const rule of parseRules(fs.readFileSync(file, 'utf8'))) {
        const declared = rule.body.match(/(?:^|[;{])\s*font-size\s*:\s*([^;}]+)/)?.[1];
        if (!declared) continue;
        const px = fontSizeToPx(declared);
        if (px === null || px >= 16) continue;
        for (const compound of rule.selector.split(',')) {
          if (targetsFormControl(compound)) {
            offenders.push(
              `${relative(file)}: ${compound.trim()} { font-size: ${declared.trim()} }`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Glass containment
// ---------------------------------------------------------------------------

/**
 * Sanctioned glass surfaces: floating chrome only. `backdrop-filter` blurs
 * whatever is BEHIND an element, so it only makes sense on something that
 * genuinely floats over other content — a sticky header, a search pill, an
 * overlay. On ordinary in-flow page content it blurs the flat page background,
 * costing real compositor time for no visual payoff.
 */
const GLASS_ALLOWLIST = [
  'src/app/HomeClient.module.css', // .searchGlass — floating search surface
  'src/components/Card.module.css', // frosted card shell
  'src/components/Header.module.css', // sticky/floating site chrome
  'src/components/Modal.module.css', // overlay
  'src/components/SearchBar.module.css', // search pill
];

/**
 * KNOWN VIOLATIONS — page CONTENT that still uses backdrop-filter and must be
 * de-glassed by the phase that owns each file. Same shrink-only contract as
 * the press-coverage allowlist: remove entries as they're fixed, never add.
 */
const GLASS_KNOWN_VIOLATIONS = [
  'src/components/BioDataForm.module.css',
  'src/components/IHNCodeDisplay.module.css',
  'src/components/StringLookupClient.module.css',
];

describe('glass containment: backdrop-filter is floating chrome only', () => {
  it('no unsanctioned file uses backdrop-filter', () => {
    const permitted = new Set([...GLASS_ALLOWLIST, ...GLASS_KNOWN_VIOLATIONS]);
    const offenders = MODULE_CSS_FILES.filter(
      (file) =>
        /backdrop-filter/.test(stripComments(fs.readFileSync(file, 'utf8'))) &&
        !permitted.has(relative(file)),
    ).map(relative);
    expect(offenders).toEqual([]);
  });

  it('the known-violations list only names files that still use backdrop-filter', () => {
    const stale = GLASS_KNOWN_VIOLATIONS.filter((rel) => {
      const full = path.join(process.cwd(), rel);
      return (
        !fs.existsSync(full) ||
        !/backdrop-filter/.test(stripComments(fs.readFileSync(full, 'utf8')))
      );
    });
    expect(stale).toEqual([]);
  });
});
