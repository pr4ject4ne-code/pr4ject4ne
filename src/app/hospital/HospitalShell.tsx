'use client';

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
}: {
  children: React.ReactNode;
  title: string;
  showLogout?: boolean;
}) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/hospital/logout', { method: 'POST' });
    router.push('/hospital/login');
  }

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <span className={styles.brand}>Racoon Eye · Hospital Portal</span>
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
