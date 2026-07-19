/**
 * Hidden SVG filter defs for the liquid-glass refraction. Referenced from CSS
 * as `backdrop-filter: url(#lg-refract)` on glass surfaces that float over the
 * map. Static (no per-frame animation) so refraction is free at render time and
 * doesn't recompute every frame over the live MapLibre canvas. Mounted once in
 * Layout so the id is available on every page; harmless where unused.
 *
 * Chromium refracts via this filter; Safari (no url() backdrop-filter) simply
 * falls back to the plain translucent glass — a graceful degradation.
 */
export default function LiquidFilters() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
    >
      <defs>
        <filter id="lg-refract" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.011 0.015"
            numOctaves="2"
            seed="7"
            result="n"
          />
          <feGaussianBlur in="n" stdDeviation="1.2" result="nb" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="nb"
            scale="10"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
