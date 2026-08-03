/**
 * GPU tier list: a ranking of graphics chips by relative performance index,
 * independent of what the catalog or the stock contain. It is reference data,
 * not inventory, so it never goes to the database.
 */

export const GPU_TIERS = [
  'extreme',
  'haut-de-gamme',
  'milieu-plus',
  'milieu',
  'entree-de-gamme',
  'budget',
] as const;

export type GpuTier = (typeof GPU_TIERS)[number];

/** Labels as written in the source file, and shown in the UI. */
export const GPU_TIER_LABELS: Record<GpuTier, string> = {
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
 * `danger`: a cheap card is not a broken one.
 */
export const GPU_TIER_STYLES: Record<GpuTier, { badge: string; bar: string }> = {
  extreme: { badge: 'bg-brand/20 text-brand', bar: 'bg-brand' },
  'haut-de-gamme': { badge: 'bg-brand/15 text-brand/90', bar: 'bg-brand/75' },
  'milieu-plus': { badge: 'bg-ok/15 text-ok', bar: 'bg-ok' },
  milieu: { badge: 'bg-ok/10 text-ok/90', bar: 'bg-ok/70' },
  'entree-de-gamme': { badge: 'bg-warn/15 text-warn', bar: 'bg-warn' },
  budget: { badge: 'bg-surface-hover text-ink-muted', bar: 'bg-ink-muted/60' },
};

export type GpuTierEntry = {
  /** Position in the ranking, 1-based. Derived from the row order when the source leaves it blank. */
  rank: number;
  model: string;
  brand: string;
  tier: GpuTier;
  /** Relative performance, in percent of the reference card (RTX 4090 = 100 %). */
  index: number;
};

/**
 * A ranked card plus the catalog model it was matched to, when there is one.
 * The match is resolved server-side so the table can link straight to the sheet.
 */
export type GpuTierRow = GpuTierEntry & {
  catalogComponentId: string | null;
};
