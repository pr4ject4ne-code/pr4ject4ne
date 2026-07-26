interface LogoProps {
  size?: number;
  color?: string;
  title?: string;
}

/**
 * Racoon Eye mark (updated 2026-07-26, founder-supplied replacement): a
 * binocular/mask silhouette — two rounded, outward-pointed lens shapes
 * joined by a narrow bridge, a small highlight dot in each lens, and a
 * small rounded nose beneath the bridge. Single-color silhouette, very
 * round edges, no sharp corners — same brand language as the prior mark.
 *
 * Recreated from a founder-pasted image (no file was saved to disk this
 * session, only the inline image) — a faithful redraw, not a pixel-exact
 * trace. Flag if it needs adjusting against the original asset.
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
      viewBox="0 0 200 120"
      role="img"
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {/* Left lens + bridge + right lens, one continuous silhouette */}
      <path
        d="M18 60
           C18 40 34 26 56 26
           C74 26 84 34 92 42
           C96 46 104 46 108 42
           C116 34 126 26 144 26
           C166 26 182 40 182 60
           C182 72 174 80 162 80
           C150 80 146 70 128 66
           C120 64 112 63 100 63
           C88 63 80 64 72 66
           C54 70 50 80 38 80
           C26 80 18 72 18 60 Z"
        fill={color}
      />
      {/* Highlight dot in each lens */}
      <circle cx="52" cy="50" r="6" fill="var(--color-white)" />
      <circle cx="148" cy="50" r="6" fill="var(--color-white)" />
      {/* Nose, beneath the bridge */}
      <path
        d="M100 74c-6 0-10.5 4-10.5 9s4.5 9 10.5 9 10.5-4 10.5-9-4.5-9-10.5-9z"
        fill={color}
      />
    </svg>
  );
}
