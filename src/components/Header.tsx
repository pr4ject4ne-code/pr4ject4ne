'use client';

import { useState } from 'react';
import Link from 'next/link';
import Logo from './Logo';
import SearchBar from './SearchBar';
import { useSession } from '@/lib/useSession';
import styles from './Header.module.css';

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
  const { user } = useSession();

  const profileHref = user ? '/dashboard' : '/login';

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
          <SearchBar onHospitalSearch={onHospitalSearch} />
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
