import { describe, expect, it } from 'vitest';
import {
  computeBuildCost,
  computeTargetMargin,
  headlinePrice,
  suggestedSalePriceCents,
} from './pricing';
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
    originalPriceCents: null,
    condition: null,
    unit: { status: 'en_stock', receivedAt: '2026-01-10' },
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

  it('counts an owned unit at its adjusted cost, not at what it was bought for', () => {
    // A card given away: it stays worth 250 € in stock, and costs this
    // configuration nothing.
    const cost = computeBuildCost(
      [
        line({ id: 'a', priceCents: 0, originalPriceCents: 25000 }),
        line({ id: 'b', priceCents: 8500 }),
      ],
      0,
    );

    expect(cost.stockCents).toBe(8500);
    expect(cost.totalCents).toBe(8500);
  });

  it('returns zeros on an empty configuration', () => {
    expect(computeBuildCost([], 0).totalCents).toBe(0);
  });
});

describe('computeTargetMargin', () => {
  it('measures the margin of a target price against the cost', () => {
    // 300 € of cost aiming at 400 €: 100 € of margin, a quarter of the price.
    const margin = computeTargetMargin(40000, 30000);

    expect(margin).not.toBeNull();
    expect(margin!.marginCents).toBe(10000);
    expect(margin!.marginPct).toBeCloseTo(25);
  });

  it('says nothing rather than zero when no objective is set', () => {
    expect(computeTargetMargin(null, 30000)).toBeNull();
  });

  it('reports a target below the cost as a loss', () => {
    const margin = computeTargetMargin(20000, 30000);

    expect(margin!.marginCents).toBe(-10000);
    expect(margin!.marginPct).toBeCloseTo(-50);
  });

  it('holds a percentage of zero on a free configuration, rather than NaN', () => {
    const margin = computeTargetMargin(0, 0);

    expect(margin!.marginCents).toBe(0);
    expect(margin!.marginPct).toBe(0);
  });
});

describe('headlinePrice', () => {
  const base = {
    targetMargin: computeTargetMargin(40000, 30000),
    askingPriceCents: null,
    salePriceCents: null,
    suggestedCents: 39000,
  };

  it('leads with the objective while the configuration is not announced', () => {
    const headline = headlinePrice({ ...base, status: 'brouillon' });

    expect(headline.kind).toBe('target');
    expect(headline.priceCents).toBe(40000);
    expect(headline.margin?.marginCents).toBe(10000);
  });

  it('keeps the objective on an assembled configuration, still unannounced', () => {
    expect(headlinePrice({ ...base, status: 'montee' }).kind).toBe('target');
  });

  it('hands the slot to the asking price once the configuration is listed', () => {
    const headline = headlinePrice({ ...base, status: 'en_vente', askingPriceCents: 42000 });

    expect(headline.kind).toBe('asking');
    expect(headline.priceCents).toBe(42000);
    // The real margin nets out postage and commission, which this panel ignores.
    expect(headline.margin).toBeNull();
  });

  it('prefers what the sale fetched over what the listing asked', () => {
    const headline = headlinePrice({
      ...base,
      status: 'vendue',
      askingPriceCents: 42000,
      salePriceCents: 38000,
    });

    expect(headline.kind).toBe('sale');
    expect(headline.priceCents).toBe(38000);
  });

  it('falls back to the objective when a listing carries no price yet', () => {
    expect(headlinePrice({ ...base, status: 'en_vente' }).kind).toBe('target');
  });

  it('falls back to the suggestion when no objective was ever set', () => {
    const headline = headlinePrice({ ...base, status: 'brouillon', targetMargin: null });

    expect(headline.kind).toBe('suggested');
    expect(headline.priceCents).toBe(39000);
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
