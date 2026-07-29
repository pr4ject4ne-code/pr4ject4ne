'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './HospitalShell.module.css';

/**
 * Hospital management portal shell — separate from the public Layout and not
 * linked from the main site. Hospital staff reach it via /hospital/login.
 */
export default function HospitalShell({
  children,
  title,
  showLogout = true,
  staffEmail,
}: {
  children: React.ReactNode;
  title: string;
  showLogout?: boolean;
  /** Currently signed-in hospital staff email, if known — shown next to the
   * brand so it's always visible which account is authenticated. */
  staffEmail?: string | null;
}) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/hospital/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <div className={styles.brandGroup}>
          <span className={styles.brand}>Racoon Eye · Hospital Portal</span>
          {staffEmail && <span className={styles.identity}>Signed in as {staffEmail}</span>}
        </div>
        <nav className={styles.nav} aria-label="Sections">
          <Link href="/hospital/dashboard?tab=announcements">Institution updates</Link>
        </nav>
        {showLogout && (
          <button type="button" onClick={logout} className={styles.logout}>
            Log out
          </button>
        )}
      </header>
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </main>
    </div>
  );
}
