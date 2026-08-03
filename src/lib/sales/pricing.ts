/**
 * Margin of a sale. Everything is in cents, so no rounding drift can creep in
 * between the components, the fees and the total.
 */

export type MarginInput = {
  salePriceCents: number;
  shippingCostCents: number;
  platformFeeCents: number;
  /** Components plus consumables, as computed by the build cost. */
  costCents: number;
};

export type Margin = MarginInput & {
  /** What actually lands in your pocket: sale price minus shipping and commission. */
  netRevenueCents: number;
  marginCents: number;
  /** Margin as a share of the sale price, the convention used everywhere here. */
  marginPct: number;
};

export function computeMargin(input: MarginInput): Margin {
  const netRevenueCents = input.salePriceCents - input.shippingCostCents - input.platformFeeCents;
  const marginCents = netRevenueCents - input.costCents;
  const marginPct = input.salePriceCents > 0 ? (marginCents / input.salePriceCents) * 100 : 0;

  return { ...input, netRevenueCents, marginCents, marginPct };
}

/** Commission amount for a percentage of the sale price. */
export function platformFeeFromPct(salePriceCents: number, pct: number): number {
  const bounded = Math.min(Math.max(pct, 0), 100);
  return Math.round((salePriceCents * bounded) / 100);
}

export type SalesStats = {
  count: number;
  totalRevenueCents: number;
  totalMarginCents: number;
  averageMarginCents: number;
  /** Average of the per-sale percentages, not the ratio of the totals. */
  averageMarginPct: number;
  best: { id: string; buildName: string; marginCents: number } | null;
  worst: { id: string; buildName: string; marginCents: number } | null;
};

export function computeSalesStats(
  sales: Array<{ id: string; buildName: string; margin: Margin }>,
): SalesStats {
  if (sales.length === 0) {
    return {
      count: 0,
      totalRevenueCents: 0,
      totalMarginCents: 0,
      averageMarginCents: 0,
      averageMarginPct: 0,
      best: null,
      worst: null,
    };
  }

  const totalRevenueCents = sales.reduce((sum, s) => sum + s.margin.salePriceCents, 0);
  const totalMarginCents = sales.reduce((sum, s) => sum + s.margin.marginCents, 0);
  const sorted = [...sales].sort((a, b) => a.margin.marginCents - b.margin.marginCents);

  const asExtreme = (entry: (typeof sales)[number]) => ({
    id: entry.id,
    buildName: entry.buildName,
    marginCents: entry.margin.marginCents,
  });

  return {
    count: sales.length,
    totalRevenueCents,
    totalMarginCents,
    averageMarginCents: Math.round(totalMarginCents / sales.length),
    averageMarginPct:
      sales.reduce((sum, s) => sum + s.margin.marginPct, 0) / sales.length,
    best: asExtreme(sorted.at(-1)!),
    worst: asExtreme(sorted[0]!),
  };
}
