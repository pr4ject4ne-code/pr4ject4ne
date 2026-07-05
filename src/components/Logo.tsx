interface LogoProps {
  size?: number;
  color?: string;
  title?: string;
}

/**
 * Racoon Eye mark: a minimal raccoon face — nose, eye, and eye-cutout (mask)
 * only, very round edges, rendered in a single color (amethyst by default).
 */
export default function Logo({
  size = 32,
  color = 'var(--color-amethyst)',
  title = 'Racoon Eye',
}: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {/* Eye mask cutout (rounded arc) */}
      <path
        d="M8 20c0-7 7-12 16-12s16 5 16 12c0 3-2 5-5 5-4 0-6-3-11-3s-7 3-11 3c-3 0-5-2-5-5z"
        fill={color}
        opacity="0.85"
      />
      {/* Eye */}
      <circle cx="17" cy="19" r="3.4" fill="var(--color-white)" />
      <circle cx="17" cy="19" r="1.6" fill={color} />
      {/* Nose (rounded triangle-ish, very round) */}
      <path
        d="M24 30c-3.2 0-5.6 2-5.6 4.6 0 3 2.6 5.4 5.6 5.4s5.6-2.4 5.6-5.4C29.6 32 27.2 30 24 30z"
        fill={color}
      />
    </svg>
  );
}
