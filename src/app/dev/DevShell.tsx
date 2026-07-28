'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './DevShell.module.css';

interface DevIdentity {
  email: string;
  access_level: string | null;
}

/**
 * Internal developer portal shell. Intentionally NOT the public Layout — it has
 * no links back into the main site nav, and the main site never links here. Only
 * reachable by direct URL / the primary-dev hub.
 */
export default function DevShell({
  children,
  title,
  showNav = true,
  dev,
}: {
  children: React.ReactNode;
  title: string;
  showNav?: boolean;
  /** Currently signed-in developer, if known — shown next to the brand so it's
   * always visible which account is authenticated and at what access level. */
  dev?: DevIdentity | null;
}) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/dev/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <div className={styles.brandGroup}>
          <span className={styles.brand}>Racoon Eye · Developer Portal</span>
          {dev && (
            <span className={styles.identity}>
              Signed in as {dev.email} · {dev.access_level ?? 'developer'}
            </span>
          )}
        </div>
        {showNav && (
          <nav className={styles.nav}>
            <Link href="/dev/dashboard">Dashboard</Link>
            <Link href="/dev/first-aid">First Aid</Link>
            <Link href="/dev/institutions">Institutions</Link>
            <Link href="/dev/hospitals">Hospitals</Link>
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
