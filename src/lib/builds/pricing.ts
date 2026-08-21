import type { BuildLine, BuildStatus } from './types';

/**
 * Cost of a configuration. Owned units are counted at what they actually cost,
 * parts still to buy at their estimate — mixing the two is the whole point of
 * the exercise.
 */
export type BuildCost = {
  stockCents: number;
  toBuyCents: number;
  componentsCents: number;
  consumablesCents: number;
  totalCents: number;
  /** Lines still to buy that carry no estimate, so the total is understated. */
  missingEstimates: number;
};

export function computeBuildCost(lines: BuildLine[], consumablesCents: number): BuildCost {
  let stockCents = 0;
  let toBuyCents = 0;
  let missingEstimates = 0;

  for (const line of lines) {
    if (line.source === 'stock') {
      stockCents += line.priceCents ?? 0;
      continue;
    }
    if (line.priceCents === null) {
      missingEstimates += 1;
      continue;
    }
    toBuyCents += line.priceCents;
  }

  const componentsCents = stockCents + toBuyCents;
  return {
    stockCents,
    toBuyCents,
    componentsCents,
    consumablesCents,
    totalCents: componentsCents + consumablesCents,
    missingEstimates,
  };
}

/**
 * Margin a configuration makes at a given price, before any selling cost. The
 * objective is a simulation, so it knows nothing of the postage and the
 * commission a real sale pays — `computeMargin` in `lib/sales/pricing` is the
 * one that nets those out, and stays the authority on a concluded sale.
 */
export type TargetMargin = {
  targetPriceCents: number;
  costCents: number;
  marginCents: number;
  /** Share of the target price, the convention used everywhere here. */
  marginPct: number;
};

/**
 * NULL target — no objective entered yet — gives back NULL rather than a zero:
 * « not filled in » and « worth nothing » are not the same statement, and the
 * caller shows the difference.
 */
export function computeTargetMargin(
  targetPriceCents: number | null,
  totalCostCents: number,
): TargetMargin | null {
  if (targetPriceCents === null) return null;

  const marginCents = targetPriceCents - totalCostCents;
  return {
    targetPriceCents,
    costCents: totalCostCents,
    marginCents,
    // A free configuration has no price to take a share of; guarding the
    // division keeps the panel showing 0 % instead of NaN.
    marginPct: targetPriceCents > 0 ? (marginCents / targetPriceCents) * 100 : 0,
  };
}

/**
 * The single price the cost panel leads with, picked by how settled the figure
 * is: what the sale actually fetched, then what the listing asks, then the
 * objective set for a configuration nobody has been told about yet — and
 * failing all three, the suggestion computed from the default margin.
 *
 * A margin rides along with the objective alone. It is a simulation, and the
 * margin of a real sale — net of postage and commission — belongs to the sale
 * section, which is the only place that knows those costs.
 */
export type HeadlinePrice = {
  kind: 'sale' | 'asking' | 'target' | 'suggested';
  priceCents: number;
  margin: TargetMargin | null;
};

export function headlinePrice(input: {
  status: BuildStatus;
  targetMargin: TargetMargin | null;
  askingPriceCents: number | null;
  salePriceCents: number | null;
  suggestedCents: number;
}): HeadlinePrice {
  // Announced or sold: a real price exists and outranks any estimate. A
  // configuration moved along the flow without one falls through — there is
  // nothing real to show yet.
  if (input.status === 'en_vente' || input.status === 'vendue') {
    if (input.salePriceCents !== null) {
      return { kind: 'sale', priceCents: input.salePriceCents, margin: null };
    }
    if (input.askingPriceCents !== null) {
      return { kind: 'asking', priceCents: input.askingPriceCents, margin: null };
    }
  }

  if (input.targetMargin !== null) {
    return {
      kind: 'target',
      priceCents: input.targetMargin.targetPriceCents,
      margin: input.targetMargin,
    };
  }

  return { kind: 'suggested', priceCents: input.suggestedCents, margin: null };
}

/** Sale price reaching a gross margin objective, expressed as % of the price. */
export function suggestedSalePriceCents(totalCostCents: number, targetMarginPct: number): number {
  const ratio = Math.min(Math.max(targetMarginPct, 0), 95) / 100;
  return Math.round(totalCostCents / (1 - ratio));
}
