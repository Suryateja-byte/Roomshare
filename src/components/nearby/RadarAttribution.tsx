/**
 * RadarAttribution Component
 *
 * Shows Radar branding for the Places API. Map tile attribution (OpenFreeMap/OSM)
 * is handled by MapLibre's built-in attributionControl which reads from the style JSON.
 *
 * Design: Refined glass badge with subtle hover effect.
 *
 * @see https://radar.com/terms
 */

interface RadarAttributionProps {
  className?: string;
}

export default function RadarAttribution({
  className = "",
}: RadarAttributionProps) {
  return (
    <a
      href="https://radar.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`
        absolute bottom-3 left-3
        z-[1000]
        inline-flex items-center gap-1.5
        px-2.5 py-1.5
        bg-white/95
        backdrop-blur-md
        border border-outline-variant/20/50
        rounded-lg
        shadow-ambient shadow-black/5
        text-xs font-medium text-on-surface-variant
        hover:text-on-surface
        hover:border-outline-variant/30
        transition-all duration-200
        pointer-events-auto
        ${className}
      `}
      style={{
        paddingBottom: "max(6px, env(safe-area-inset-bottom))",
        marginLeft: "max(12px, env(safe-area-inset-left))",
      }}
      aria-label="Places data by Radar"
    >
      {/* Radar logo SVG */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="opacity-70"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
      <span>Radar</span>
    </a>
  );
}
