import Logo from './Logo';
import styles from './LogoLoader.module.css';

interface LogoLoaderProps {
  size?: number;
  label?: string;
}

/**
 * Custom loading indicator (founder ask, 2026-07-26) — the brand mark itself,
 * gently pulsing, instead of a generic spinner. Collapses to a static (still
 * visible, non-animated) logo under prefers-reduced-motion via the blanket
 * animation-duration override in globals.css — no extra JS needed here.
 */
export default function LogoLoader({ size = 56, label = 'Loading…' }: LogoLoaderProps) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.pulse}>
        <Logo size={size} />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
