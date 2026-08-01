'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Logo from './Logo';
import { useSession } from '@/lib/useSession';
import { SYMPTOM_REGIONS, SYMPTOM_ITEMS } from '@/lib/symptom-specialty-map';
import { RED_FLAG_SYMPTOMS, evaluateRedFlagGate, MAX_SEVERITY } from '@/lib/symptom-red-flags';
import styles from './Header.module.css';

export type SearchMode = 'nearest' | 'hospital' | 'symptom';

interface HeaderProps {
  /** Hospital-profile header shows the hospital logo/name and scopes search. */
  hospitalName?: string;
  hospitalLogoUrl?: string | null;
  /** When set, the search bar is hospital-specific and calls this instead of navigating. */
  onHospitalSearch?: (query: string) => void;
  /** Float the bar over a full-bleed background (homepage map) as translucent glass. */
  floating?: boolean;
  /** Show the hospital search bar. The map homepage sets this; other pages (login,
   * dashboard, first-aid…) get a clean brand+menu header with no map search. */
  showSearch?: boolean;
}

const MODE_PLACEHOLDER: Record<SearchMode, string> = {
  nearest: 'Find the nearest hospital…',
  hospital: 'Search hospitals by name…',
  symptom: 'Describe your symptoms…',
};

export default function Header({
  hospitalName,
  hospitalLogoUrl,
  onHospitalSearch,
  floating,
  showSearch,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Keeps the dropdown mounted for the brief exit animation instead of
  // vanishing instantly on close (menuOpen alone still drives aria-expanded
  // + the actual open/close logic; this only controls animation lifecycle).
  const [menuClosing, setMenuClosing] = useState(false);
  const [mode, setMode] = useState<SearchMode>('nearest');
  const [q, setQ] = useState('');
  const [symptomIds, setSymptomIds] = useState<string[]>([]);
  const [redFlagIds, setRedFlagIds] = useState<string[]>([]);
  const [severity, setSeverity] = useState<number | null>(null);
  const [symptomPickerOpen, setSymptomPickerOpen] = useState(false);
  const { user } = useSession();
  const router = useRouter();

  const profileHref = user ? '/dashboard' : '/login';
  const isSymptomMode = mode === 'symptom' && !onHospitalSearch;
  // Stage 1 red-flag gate (symptom-red-flags.ts) — evaluated purely
  // client-side here so the Search button/copy can reflect it immediately;
  // the actual short-circuit (skip Stage 2 specialty routing entirely)
  // happens on submit below and again, redundantly, wherever the emergency
  // outcome is rendered.
  const redFlagGate = evaluateRedFlagGate({ selectedRedFlagIds: redFlagIds, severity });
  // Nothing selected yet and severity not raised — nothing to search for.
  const symptomSearchBlocked =
    isSymptomMode && !redFlagGate.isEmergency && symptomIds.length === 0;
  const totalSymptomSelections = symptomIds.length + redFlagIds.length;

  function toggleSymptom(id: string) {
    setSymptomIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function toggleRedFlag(id: string) {
    setRedFlagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function toggleMenu() {
    setMenuOpen((prev) => {
      const next = !prev;
      setMenuClosing(!next);
      return next;
    });
  }

  function closeMenu() {
    setMenuOpen(false);
    setMenuClosing(true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (onHospitalSearch) {
      onHospitalSearch(q);
      return;
    }
    if (isSymptomMode) {
      // Stage 1 ALWAYS runs first, regardless of anything else selected —
      // never proceed to Stage 2 specialty routing when it fires.
      if (redFlagGate.isEmergency) {
        router.push('/?emergency=1');
        return;
      }
      if (symptomIds.length === 0) return;
      const params = new URLSearchParams();
      params.set('symptom', symptomIds.join(','));
      router.push(`/?${params.toString()}`);
      return;
    }
    const params = new URLSearchParams();
    if (mode === 'hospital' && q) params.set('q', q);
    if (mode === 'nearest') params.set('nearest', '1');
    router.push(`/?${params.toString()}`);
  }

  return (
    <header className={floating ? `${styles.bar} ${styles.floating}` : styles.bar}>
      <div className={styles.left}>
        <Link href="/" className={styles.brand} aria-label="Racoon Eye home">
          <span className={styles.logoBadge}>
            <Logo size={34} color="var(--header-fg)" />
          </span>
          <span className={styles.brandName}>Racoon Eye</span>
        </Link>
        {hospitalName && (
          <span className={styles.hospitalBrand}>
            {hospitalLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hospitalLogoUrl} alt="" className={styles.hospitalLogo} />
            ) : null}
            <span className={styles.hospitalName}>{hospitalName}</span>
          </span>
        )}
      </div>

      {(onHospitalSearch || showSearch) && (
        <div className={styles.searchWrap}>
          <form className={styles.searchPill} onSubmit={onSubmit} role="search">
            {!onHospitalSearch && (
              <select
                className={styles.mode}
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as SearchMode);
                  setSymptomPickerOpen(false);
                }}
                aria-label="Search mode"
              >
                <option value="nearest">Nearest</option>
                <option value="hospital">By name</option>
                <option value="symptom">By symptom</option>
              </select>
            )}
            {isSymptomMode ? (
              <button
                type="button"
                className={styles.symptomToggle}
                aria-haspopup="true"
                aria-expanded={symptomPickerOpen}
                onClick={() => setSymptomPickerOpen((o) => !o)}
              >
                {redFlagGate.isEmergency
                  ? 'Emergency — tap Search'
                  : totalSymptomSelections > 0
                    ? `${totalSymptomSelections} selected`
                    : 'Describe your symptoms…'}
              </button>
            ) : (
              <input
                className={styles.searchInput}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={onHospitalSearch ? 'Search this hospital…' : MODE_PLACEHOLDER[mode]}
                aria-label="Search"
              />
            )}
            <button type="submit" className={styles.searchBtn} disabled={symptomSearchBlocked}>
              Search
            </button>
          </form>
          {isSymptomMode && symptomPickerOpen && (
            <div
              className={styles.symptomPanel}
              role="group"
              aria-label="Describe your symptoms"
            >
              <div className={styles.severityBlock}>
                <label htmlFor="symptom-severity" className={styles.severityLabel}>
                  How severe does it feel right now? (0 = mild, {MAX_SEVERITY} = worst pain
                  imaginable)
                </label>
                <input
                  id="symptom-severity"
                  type="range"
                  min={0}
                  max={MAX_SEVERITY}
                  step={1}
                  value={severity ?? 0}
                  onChange={(e) => setSeverity(Number(e.target.value))}
                  className={styles.severitySlider}
                />
                <span className={styles.severityValue} aria-live="polite">
                  {severity ?? 0}/{MAX_SEVERITY}
                </span>
              </div>
              <p className={styles.redFlagLabel}>Is any of this happening right now?</p>
              <div className={styles.redFlagGroup}>
                {RED_FLAG_SYMPTOMS.map((rf) => {
                  const on = redFlagIds.includes(rf.id);
                  return (
                    <button
                      key={rf.id}
                      type="button"
                      aria-pressed={on}
                      className={on ? styles.redFlagChipOn : styles.redFlagChip}
                      onClick={() => toggleRedFlag(rf.id)}
                    >
                      {rf.label}
                    </button>
                  );
                })}
              </div>
              {redFlagGate.isEmergency ? (
                <p className={styles.emergencyHint} role="alert">
                  This may be an emergency. Press Search for urgent guidance — or call 112 / go to
                  the nearest hospital now.
                </p>
              ) : (
                <>
                  {SYMPTOM_REGIONS.map((region) => (
                    <div key={region} className={styles.symptomRegionGroup}>
                      <p className={styles.symptomRegionLabel}>{region}</p>
                      <div className={styles.symptomRegionChips}>
                        {SYMPTOM_ITEMS.filter((s) => s.region === region).map((s) => {
                          const on = symptomIds.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              aria-pressed={on}
                              className={on ? styles.symptomChipOn : styles.symptomChip}
                              onClick={() => toggleSymptom(s.id)}
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <p className={styles.symptomHint} aria-live="polite">
                    This is based on which services hospitals list, not an assessment of your
                    condition — never a diagnosis. If you think this is an emergency, call 112 or
                    go to the nearest hospital now.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className={styles.right}>
        <nav className={styles.inlineNav} aria-label="Main menu">
          <Link href={profileHref}>Profile</Link>
          <Link href="/first-aid">First Aid</Link>
          <Link href="/filter">Directory</Link>
          <Link href="/string-lookup">Find by IHN</Link>
        </nav>
        <button
          type="button"
          className={styles.hamburger}
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={toggleMenu}
        >
          <span />
          <span />
          <span />
        </button>
        {(menuOpen || menuClosing) && (
          <nav
            className={menuOpen ? styles.menu : `${styles.menu} ${styles.menuClosing}`}
            aria-label="Main menu"
            onAnimationEnd={() => {
              if (!menuOpen) setMenuClosing(false);
            }}
          >
            <Link href={profileHref} onClick={closeMenu}>
              Profile
            </Link>
            <Link href="/first-aid" onClick={closeMenu}>
              First Aid
            </Link>
            <Link href="/filter" onClick={closeMenu}>
              Directory
            </Link>
            <Link href="/string-lookup" onClick={closeMenu}>
              Find by IHN
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
