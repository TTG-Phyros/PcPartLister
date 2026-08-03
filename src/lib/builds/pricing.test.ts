import { describe, expect, it } from 'vitest';
import { computeBuildCost, suggestedSalePriceCents } from './pricing';
import type { BuildLine } from './types';

function line(overrides: Partial<BuildLine>): BuildLine {
  return {
    id: 'line',
    slot: 'cpu',
    source: 'stock',
    inventoryItemId: 'unit',
    catalogComponentId: 'model',
    brand: 'AMD',
    model: 'Ryzen 5 5600X',
    imageUrl: '/placeholder.svg',
    summary: [],
    specs: {
      category: 'cpu',
      socket: 'AM4',
      cores: 6,
      threads: 12,
      baseClockGhz: 3.7,
      tdpW: 65,
      integratedGraphics: false,
    },
    priceCents: 0,
    condition: null,
    position: 0,
    ...overrides,
  };
}

describe('computeBuildCost', () => {
  it('separates what is already owned from what is still to buy', () => {
    const cost = computeBuildCost(
      [
        line({ id: 'a', source: 'stock', priceCents: 11250 }),
        line({ id: 'b', source: 'stock', priceCents: 8500 }),
        line({ id: 'c', source: 'a_acheter', inventoryItemId: null, priceCents: 9500 }),
      ],
      500,
    );

    expect(cost.stockCents).toBe(19750);
    expect(cost.toBuyCents).toBe(9500);
    expect(cost.componentsCents).toBe(29250);
    expect(cost.totalCents).toBe(29750);
    expect(cost.missingEstimates).toBe(0);
  });

  it('counts the lines to buy that carry no estimate, since the total understates them', () => {
    const cost = computeBuildCost(
      [
        line({ id: 'a', source: 'a_acheter', inventoryItemId: null, priceCents: null }),
        line({ id: 'b', source: 'a_acheter', inventoryItemId: null, priceCents: 4000 }),
      ],
      0,
    );

    expect(cost.toBuyCents).toBe(4000);
    expect(cost.missingEstimates).toBe(1);
  });

  it('returns zeros on an empty configuration', () => {
    expect(computeBuildCost([], 0).totalCents).toBe(0);
  });
});

describe('suggestedSalePriceCents', () => {
  it('reaches the margin objective expressed as a share of the sale price', () => {
    // 300 € of cost at 25 % margin: 400 € of sale price, 100 € of margin.
    expect(suggestedSalePriceCents(30000, 25)).toBe(40000);
  });

  it('returns the cost itself for a zero objective', () => {
    expect(suggestedSalePriceCents(30000, 0)).toBe(30000);
  });

  it('caps the objective below 100 % so the price stays finite', () => {
    expect(Number.isFinite(suggestedSalePriceCents(30000, 100))).toBe(true);
  });
});
