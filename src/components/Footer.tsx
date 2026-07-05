import Link from 'next/link';
import Logo from './Logo';
import styles from './Footer.module.css';

/** Shared footer: links left, logo right. Reused unchanged across all pages. */
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <nav className={styles.links} aria-label="Footer">
        <Link href="/privacy-policy">Privacy Policy</Link>
        <Link href="/terms-and-conditions">Terms &amp; Conditions</Link>
        <Link href="/links">Links</Link>
      </nav>
      <div className={styles.brand}>
        <Logo size={28} color="var(--color-white)" />
        <span>Racoon Eye</span>
      </div>
    </footer>
  );
}
