import type { BuildLine } from './types';

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

/** Sale price reaching a gross margin objective, expressed as % of the price. */
export function suggestedSalePriceCents(totalCostCents: number, targetMarginPct: number): number {
  const ratio = Math.min(Math.max(targetMarginPct, 0), 95) / 100;
  return Math.round(totalCostCents / (1 - ratio));
}
