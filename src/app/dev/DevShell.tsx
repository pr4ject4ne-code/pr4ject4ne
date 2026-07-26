'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './DevShell.module.css';

/**
 * Internal developer portal shell. Intentionally NOT the public Layout — it has
 * no links back into the main site nav, and the main site never links here. Only
 * reachable by direct URL / the primary-dev hub.
 */
export default function DevShell({
  children,
  title,
  showNav = true,
}: {
  children: React.ReactNode;
  title: string;
  showNav?: boolean;
}) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/dev/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <span className={styles.brand}>Racoon Eye · Developer Portal</span>
        {showNav && (
          <nav className={styles.nav}>
            <Link href="/dev/dashboard">Dashboard</Link>
            <Link href="/dev/first-aid">First Aid</Link>
            <Link href="/dev/institutions">Institutions</Link>
            <Link href="/dev/doctor-consent">Doctor consent</Link>
            <Link href="/dev/primary">Admin</Link>
            <button type="button" onClick={logout}>
              Log out
            </button>
          </nav>
        )}
      </header>
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </main>
    </div>
  );
}
