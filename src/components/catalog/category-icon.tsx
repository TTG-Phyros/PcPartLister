import type { ComponentCategory } from '@/lib/specs';

/**
 * One glyph per component category, drawn rather than imported: nine line icons
 * are cheaper as inline SVG than as a dependency, they inherit `currentColor`
 * so a selected card tints them, and they never make a network request — which
 * a form filled on a phone in a shop cannot count on.
 */

const PATHS: Record<ComponentCategory, React.ReactNode> = {
  cpu: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <rect x="10.5" y="10.5" width="3" height="3" rx="0.5" />
      <path d="M10 7V4M14 7V4M10 20v-3M14 20v-3M7 10H4M7 14H4M20 10h-3M20 14h-3" />
    </>
  ),
  motherboard: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="6" y="6" width="6" height="6" rx="1" />
      <path d="M15 6h3M15 9h3M6 15h12M6 18h8" />
    </>
  ),
  ram: (
    <>
      <rect x="2.5" y="7" width="19" height="9" rx="1.5" />
      <path d="M6 16v2M10 16v2M14 16v2M18 16v2M6 10v3M9.5 10v3M13 10v3M16.5 10v3" />
    </>
  ),
  gpu: (
    <>
      <rect x="2.5" y="6" width="19" height="10" rx="1.5" />
      <circle cx="8.5" cy="11" r="2.5" />
      <circle cx="16" cy="11" r="2.5" />
      <path d="M6 16v2.5M18 16v2.5" />
    </>
  ),
  storage: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </>
  ),
  psu: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="3" />
      <path d="M15 9.5h3M15 12h3M15 14.5h3" />
    </>
  ),
  case: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2" />
      <path d="M8.5 6h7M8.5 9h7" />
      <circle cx="12" cy="15.5" r="3" />
    </>
  ),
  cooling: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 10c0-3 1.5-5 4-5.5M14 12c3 0 5 1.5 5.5 4M12 14c0 3-1.5 5-4 5.5M10 12c-3 0-5-1.5-5.5-4" />
    </>
  ),
  misc: (
    <>
      <path d="M4 7h9a4 4 0 0 1 0 8H8" />
      <circle cx="17" cy="7" r="2.5" />
      <circle cx="6" cy="17" r="2.5" />
    </>
  ),
};

export function CategoryIcon({
  category,
  className = 'size-7',
}: {
  category: ComponentCategory;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[category]}
    </svg>
  );
}
