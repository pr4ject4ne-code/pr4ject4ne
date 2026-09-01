'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Logo from './Logo';
import SearchBar from './SearchBar';
import { useSession } from '@/lib/useSession';
import styles from './Header.module.css';

interface Announcement {
  id: string;
  title: string;
  body: string;
  start_at: string;
  end_at: string;
  created_at?: string;
}

interface HeaderProps {
  hospitalName?: string;
  hospitalLogoUrl?: string | null;
  onHospitalSearch?: (query: string) => void;
  floating?: boolean;
  showSearch?: boolean;
}

const DISMISSED_KEY = 'racoon:announcements:dismissed';

export default function Header({
  hospitalName,
  hospitalLogoUrl,
  onHospitalSearch,
  floating,
  showSearch,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const { user } = useSession();

  const [headlines, setHeadlines] = useState<Announcement[]>([]);
  const [headlineError, setHeadlineError] = useState<string | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const profileHref = user ? '/dashboard' : '/login';

  // Load headlines
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch('/api/announcements/headlines');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (mounted && Array.isArray(data)) setHeadlines(data);
      } catch (err) {
        if (mounted) setHeadlineError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Load dismissed set from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        setDismissed(new Set(arr));
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Compute visible headlines by filtering dismissed ids
  const visibleHeadlines = headlines.filter((h) => !dismissed.has(h.id));
  // Hoisted so the single-headline branch below doesn't need to re-index
  // visibleHeadlines[0] (noUncheckedIndexedAccess makes that `Headline | undefined`).
  const singleHeadline = visibleHeadlines.length === 1 ? visibleHeadlines[0] : undefined;

  function persistDismissed(set: Set<string>) {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {
      // ignore
    }
  }

  async function recordDismissalServer(announcementId: string) {
    try {
      await fetch('/api/announcements/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcement_id: announcementId, action: 'dismissed', details: { userAgent: navigator.userAgent } }),
      });
    } catch (e) {
      // non-blocking
      // optionally swallow or report to Sentry in future
    }
  }

  function dismissAnnouncement(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    persistDismissed(next);
    // update local headlines immediately
    setHeadlines((prev) => prev.filter((p) => p.id !== id));
    // fire-and-forget to server to record audit
    void recordDismissalServer(id);
    // if overlay open and active item dismissed, jump to next or close
    if (overlayOpen) {
      if (visibleHeadlines.length <= 1) {
        setOverlayOpen(false);
      } else if (activeIndex >= visibleHeadlines.length - 1) {
        setActiveIndex(Math.max(0, visibleHeadlines.length - 2));
      }
    }
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

  function openOverlay(idx = 0) {
    setActiveIndex(idx);
    setOverlayOpen(true);
    // focus the overlay for accessibility
    setTimeout(() => overlayRef.current?.focus(), 0);
  }

  function closeOverlay() {
    setOverlayOpen(false);
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

        {/* Headlines — show a single inline pill or a slim tab row when multiple */}
        {visibleHeadlines.length > 0 && (
          <div className={styles.headlines} aria-hidden={overlayOpen}>
            {singleHeadline ? (
              <div className={styles.headlineSingleWrap}>
                <button
                  type="button"
                  className={styles.headlineSingle}
                  onClick={() => openOverlay(0)}
                  aria-label={`Announcement: ${singleHeadline.title}`}
                >
                  {singleHeadline.title}
                </button>
                <button type="button" className={styles.headlineDismiss} onClick={() => dismissAnnouncement(singleHeadline.id)} aria-label="Dismiss announcement">
                  ×
                </button>
              </div>
            ) : (
              <div className={styles.headlineTabs} role="tablist" aria-label="Announcements">
                {visibleHeadlines.map((h, i) => (
                  <div key={h.id} className={styles.headlineTabWrap}>
                    <button
                      role="tab"
                      aria-selected={i === activeIndex}
                      className={i === activeIndex ? styles.headlineTabActive : styles.headlineTab}
                      onClick={() => openOverlay(i)}
                    >
                      {h.title}
                    </button>
                    <button type="button" className={styles.headlineTabDismiss} onClick={() => dismissAnnouncement(h.id)} aria-label={`Dismiss ${h.title}`}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {headlineError && <div className={styles.headlineError}>Announcements unavailable</div>}
      </div>

      {(onHospitalSearch || showSearch) && (
        <div className={styles.searchWrap}>
          <SearchBar onHospitalSearch={onHospitalSearch} />
        </div>
      )}

      <div className={styles.right}>
        <nav className={styles.inlineNav} aria-label="Main menu">
          <Link href={profileHref} className={styles.navItem}>
            Profile
          </Link>
          <Link href="/first-aid" className={styles.navItem}>
            First Aid
          </Link>
          <Link href="/filter" className={styles.navItem}>
            Directory
          </Link>
          <Link href="/string-lookup" className={styles.navItem}>
            Find by IHN
          </Link>
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

      {/* Announcement overlay (chronological view) */}
      {overlayOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className={styles.headlineOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeOverlay();
          }}
        >
          <div className={styles.headlineOverlayPanel} ref={overlayRef} tabIndex={-1}>
            <button className={styles.overlayClose} aria-label="Close announcements" onClick={closeOverlay}>
              ✕
            </button>
            <h2 className={styles.overlayTitle}>Announcements</h2>
            <div className={styles.overlayList}>
              {visibleHeadlines.map((h, i) => (
                <article key={h.id} className={styles.overlayItem} aria-hidden={i !== activeIndex}>
                  <div className={styles.overlayItemHead}>
                    <h3 className={styles.overlayItemTitle}>{h.title}</h3>
                    <div>
                      <button className={styles.overlayDismiss} onClick={() => dismissAnnouncement(h.id)} aria-label={`Dismiss ${h.title}`}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                  <time className={styles.overlayItemTime} dateTime={h.start_at}>
                    {new Date(h.start_at).toLocaleString()}
                  </time>
                  <div className={styles.overlayItemBody}>{h.body}</div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
