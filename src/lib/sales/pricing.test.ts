import { describe, expect, it } from 'vitest';
import { computeMargin, computeSalesStats, platformFeeFromPct } from './pricing';

describe('computeMargin', () => {
  it('deducts shipping and commission before comparing to the cost', () => {
    // Sold 500 €, 12 € of shipping and 25 € of commission, built for 300 €.
    const margin = computeMargin({
      salePriceCents: 50000,
      shippingCostCents: 1200,
      platformFeeCents: 2500,
      costCents: 30000,
    });

    expect(margin.netRevenueCents).toBe(46300);
    expect(margin.marginCents).toBe(16300);
    expect(margin.marginPct).toBeCloseTo(32.6, 5);
  });

  it('matches the suggested price: 25 % objective gives 25 % margin with no fees', () => {
    const margin = computeMargin({
      salePriceCents: 40000,
      shippingCostCents: 0,
      platformFeeCents: 0,
      costCents: 30000,
    });

    expect(margin.marginCents).toBe(10000);
    expect(margin.marginPct).toBeCloseTo(25, 5);
  });

  it('reports a negative margin on a sale below cost rather than clamping it', () => {
    const margin = computeMargin({
      salePriceCents: 25000,
      shippingCostCents: 1500,
      platformFeeCents: 0,
      costCents: 30000,
    });

    expect(margin.marginCents).toBe(-6500);
    expect(margin.marginPct).toBeLessThan(0);
  });

  it('avoids dividing by zero on a giveaway', () => {
    const margin = computeMargin({
      salePriceCents: 0,
      shippingCostCents: 0,
      platformFeeCents: 0,
      costCents: 10000,
    });

    expect(margin.marginCents).toBe(-10000);
    expect(margin.marginPct).toBe(0);
  });
});

describe('platformFeeFromPct', () => {
  it('computes the commission and rounds to the cent', () => {
    expect(platformFeeFromPct(49990, 5)).toBe(2500);
  });

  it('clamps an out-of-range percentage', () => {
    expect(platformFeeFromPct(10000, -5)).toBe(0);
    expect(platformFeeFromPct(10000, 150)).toBe(10000);
  });
});

describe('computeSalesStats', () => {
  const sale = (
    id: string,
    name: string,
    salePriceCents: number,
    costCents: number,
    kind: 'build' | 'item' = 'build',
  ) => ({
    id,
    subject: { kind, id, name },
    margin: computeMargin({
      salePriceCents,
      shippingCostCents: 0,
      platformFeeCents: 0,
      costCents,
    }),
  });

  it('returns neutral figures with no sale at all', () => {
    const stats = computeSalesStats([]);
    expect(stats).toMatchObject({ count: 0, totalMarginCents: 0, best: null, worst: null });
  });

  it('accumulates revenue and margin, and names the best and worst sale', () => {
    const stats = computeSalesStats([
      sale('1', 'Config A', 50000, 30000), // +200 €
      sale('2', 'Config B', 40000, 38000), // +20 €
      sale('3', 'Config C', 60000, 30000), // +300 €
    ]);

    expect(stats.count).toBe(3);
    expect(stats.totalRevenueCents).toBe(150000);
    expect(stats.totalMarginCents).toBe(52000);
    expect(stats.averageMarginCents).toBe(17333);
    expect(stats.best?.name).toBe('Config C');
    expect(stats.worst?.name).toBe('Config B');
  });

  it('picks the loss as the worst sale', () => {
    const stats = computeSalesStats([
      sale('1', 'Config A', 50000, 30000),
      sale('2', 'Config B', 20000, 30000),
    ]);

    expect(stats.worst?.name).toBe('Config B');
    expect(stats.worst?.marginCents).toBe(-10000);
    expect(stats.totalMarginCents).toBe(10000);
  });

  it('counts a lone component sold on its own like a configuration', () => {
    const stats = computeSalesStats([
      sale('1', 'Config A', 50000, 30000), // +200 €
      sale('2', 'RTX 3060', 25000, 15000, 'item'), // +100 €
    ]);

    expect(stats.count).toBe(2);
    expect(stats.totalRevenueCents).toBe(75000);
    expect(stats.totalMarginCents).toBe(30000);
    expect(stats.worst?.name).toBe('RTX 3060');
  });

  it('averages the per-sale percentages rather than the ratio of the totals', () => {
    // 50 % then 10 %: the average of the rates is 30 %, the ratio of totals is not.
    const stats = computeSalesStats([sale('1', 'A', 20000, 10000), sale('2', 'B', 100000, 90000)]);
    expect(stats.averageMarginPct).toBeCloseTo(30, 5);
  });

  it('treats a single sale as both the best and the worst', () => {
    const stats = computeSalesStats([sale('1', 'Solo', 50000, 30000)]);
    expect(stats.best?.id).toBe('1');
    expect(stats.worst?.id).toBe('1');
  });
});
