'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Logo from './Logo';
import { useSession } from '@/lib/useSession';
import { FIRST_AID_TAGS } from '@/lib/first-aid-tags';
import styles from './Header.module.css';

/** Symptom search requires at least 2 recognised symptoms to narrow down to
 * an appropriate result (worklist #34) — a single symptom is too unspecific
 * to rank hospitals by specialty match. */
const MIN_SYMPTOMS = 2;

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
  const [mode, setMode] = useState<SearchMode>('nearest');
  const [q, setQ] = useState('');
  const [symptomTags, setSymptomTags] = useState<string[]>([]);
  const [symptomPickerOpen, setSymptomPickerOpen] = useState(false);
  const { user } = useSession();
  const router = useRouter();

  const profileHref = user ? '/dashboard' : '/login';
  const isSymptomMode = mode === 'symptom' && !onHospitalSearch;
  const symptomsBelowMin = isSymptomMode && symptomTags.length < MIN_SYMPTOMS;

  function toggleSymptom(tag: string) {
    setSymptomTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (onHospitalSearch) {
      onHospitalSearch(q);
      return;
    }
    if (isSymptomMode && symptomTags.length < MIN_SYMPTOMS) return;
    const params = new URLSearchParams();
    if (mode === 'hospital' && q) params.set('q', q);
    if (mode === 'symptom' && symptomTags.length >= MIN_SYMPTOMS) {
      params.set('symptom', symptomTags.join(','));
    }
    if (mode === 'nearest') params.set('nearest', '1');
    router.push(`/?${params.toString()}`);
  }

  return (
    <header className={floating ? `${styles.bar} ${styles.floating}` : styles.bar}>
      <div className={styles.left}>
        <Link href="/" className={styles.brand} aria-label="Racoon Eye home">
          <span className={styles.logoBadge}>
            <Logo size={26} />
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
                {symptomTags.length > 0
                  ? `${symptomTags.length} symptom${symptomTags.length > 1 ? 's' : ''} selected`
                  : 'Select symptoms…'}
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
            <button type="submit" className={styles.searchBtn} disabled={symptomsBelowMin}>
              Search
            </button>
          </form>
          {isSymptomMode && symptomPickerOpen && (
            <div className={styles.symptomPanel} role="group" aria-label="Select at least 2 symptoms">
              {FIRST_AID_TAGS.map((tag) => {
                const on = symptomTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={on}
                    className={on ? styles.symptomChipOn : styles.symptomChip}
                    onClick={() => toggleSymptom(tag)}
                  >
                    {tag}
                  </button>
                );
              })}
              <p className={styles.symptomHint} aria-live="polite">
                {symptomTags.length}/{MIN_SYMPTOMS} minimum selected — guidance only, never a
                diagnosis.
              </p>
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
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
        {menuOpen && (
          <nav className={styles.menu} aria-label="Main menu">
            <Link href={profileHref} onClick={() => setMenuOpen(false)}>
              Profile
            </Link>
            <Link href="/first-aid" onClick={() => setMenuOpen(false)}>
              First Aid
            </Link>
            <Link href="/filter" onClick={() => setMenuOpen(false)}>
              Directory
            </Link>
            <Link href="/string-lookup" onClick={() => setMenuOpen(false)}>
              Find by IHN
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
