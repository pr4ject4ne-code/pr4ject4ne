'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Logo from './Logo';
import { useSession } from '@/lib/useSession';
import styles from './Header.module.css';

export type SearchMode = 'nearest' | 'hospital' | 'symptom';

interface HeaderProps {
  /** Hospital-profile header shows the hospital logo/name and scopes search. */
  hospitalName?: string;
  hospitalLogoUrl?: string | null;
  /** When set, the search bar is hospital-specific and calls this instead of navigating. */
  onHospitalSearch?: (query: string) => void;
}

const MODE_PLACEHOLDER: Record<SearchMode, string> = {
  nearest: 'Find the nearest hospital…',
  hospital: 'Search hospitals by name…',
  symptom: 'Describe your symptoms…',
};

export default function Header({ hospitalName, hospitalLogoUrl, onHospitalSearch }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<SearchMode>('nearest');
  const [q, setQ] = useState('');
  const { user } = useSession();
  const router = useRouter();

  const profileHref = user ? '/dashboard' : '/login';

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (onHospitalSearch) {
      onHospitalSearch(q);
      return;
    }
    const params = new URLSearchParams();
    if (mode === 'hospital' && q) params.set('q', q);
    if (mode === 'symptom' && q) params.set('symptom', q);
    if (mode === 'nearest') params.set('nearest', '1');
    router.push(`/?${params.toString()}`);
  }

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <Link href="/" className={styles.brand} aria-label="Racoon Eye home">
          <Logo size={34} />
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

      <form className={styles.search} onSubmit={onSubmit} role="search">
        {!onHospitalSearch && (
          <select
            className={styles.mode}
            value={mode}
            onChange={(e) => setMode(e.target.value as SearchMode)}
            aria-label="Search mode"
          >
            <option value="nearest">Nearest</option>
            <option value="hospital">By name</option>
            <option value="symptom">By symptom</option>
          </select>
        )}
        <input
          className={styles.searchInput}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={onHospitalSearch ? 'Search this hospital…' : MODE_PLACEHOLDER[mode]}
          aria-label="Search"
        />
        <button type="submit" className={styles.searchBtn}>
          Search
        </button>
      </form>

      <div className={styles.right}>
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
          </nav>
        )}
      </div>
    </header>
  );
}
