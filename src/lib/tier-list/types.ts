/**
 * Tier lists: rankings of components by relative performance index, independent
 * of what the catalog or the stock contain. They are reference data, not
 * inventory, so they never go to the database.
 *
 * The tiers are shared by every ranking: a « Milieu+ » processor and a
 * « Milieu+ » graphics card wear the same badge and the same colour, which is
 * what lets the two rankings be read side by side.
 */

export const TIERS = [
  'extreme',
  'haut-de-gamme',
  'milieu-plus',
  'milieu',
  'entree-de-gamme',
  'budget',
] as const;

export type Tier = (typeof TIERS)[number];

/** Labels as written in the GPU source file, and shown in the UI. */
export const TIER_LABELS: Record<Tier, string> = {
  extreme: 'Extrême',
  'haut-de-gamme': 'Haut de gamme',
  'milieu-plus': 'Milieu+',
  milieu: 'Milieu',
  'entree-de-gamme': 'Entrée de gamme',
  budget: 'Budget',
};

/**
 * Colours ride the existing palette and follow the ranking: brand (blue) at the
 * top, then ok, warn, and neutral for the cheap end. Budget is deliberately not
 * `danger`: a cheap part is not a broken one.
 */
export const TIER_STYLES: Record<Tier, { badge: string; bar: string }> = {
  extreme: { badge: 'bg-brand/20 text-brand', bar: 'bg-brand' },
  'haut-de-gamme': { badge: 'bg-brand/15 text-brand/90', bar: 'bg-brand/75' },
  'milieu-plus': { badge: 'bg-ok/15 text-ok', bar: 'bg-ok' },
  milieu: { badge: 'bg-ok/10 text-ok/90', bar: 'bg-ok/70' },
  'entree-de-gamme': { badge: 'bg-warn/15 text-warn', bar: 'bg-warn' },
  budget: { badge: 'bg-surface-hover text-ink-muted', bar: 'bg-ink-muted/60' },
};

export type TierEntry = {
  /** Position in the ranking, 1-based. Derived from the row order when the source leaves it blank. */
  rank: number;
  model: string;
  brand: string;
  tier: Tier;
  /** Relative performance, on the scale its own ranking defines. */
  index: number;
};

/**
 * A ranked part plus the catalog model it was matched to, when there is one.
 * The match is resolved server-side so the table can link straight to the sheet.
 */
export type TierRow = TierEntry & {
  catalogComponentId: string | null;
};
