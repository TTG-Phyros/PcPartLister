import { describe, expect, it } from 'vitest';
import { groupByBatch } from './group';
import type { BatchHeader } from './types';

type Row = { id: string; batchId: string | null };

const accessors = {
  batchId: (row: Row) => row.batchId,
  key: (row: Row) => row.id,
};

function header(id: string, itemCount = 2): BatchHeader {
  return {
    id,
    label: `Arrivage ${id}`,
    totalPriceCents: 10_000,
    purchaseDate: '2026-08-16',
    platform: 'vinted',
    shippingCarrier: null,
    trackingNumber: null,
    trackingUrl: null,
    expectedArrival: null,
    itemCount,
  };
}

describe('groupByBatch', () => {
  it('leaves lone units alone', () => {
    const rows: Row[] = [
      { id: 'a', batchId: null },
      { id: 'b', batchId: null },
    ];
    const entries = groupByBatch(rows, new Map(), accessors);

    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.kind === 'item')).toBe(true);
  });

  it('folds the units of one batch into a single entry', () => {
    const rows: Row[] = [
      { id: 'a', batchId: 'lot' },
      { id: 'b', batchId: 'lot' },
      { id: 'c', batchId: 'lot' },
    ];
    const entries = groupByBatch(rows, new Map([['lot', header('lot', 3)]]), accessors);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe('batch');
    expect(entries[0]!.kind === 'batch' ? entries[0]!.rows.map((r) => r.id) : []).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('keeps the batch at the position of its first unit', () => {
    const rows: Row[] = [
      { id: 'solo1', batchId: null },
      { id: 'a', batchId: 'lot' },
      { id: 'solo2', batchId: null },
      { id: 'b', batchId: 'lot' },
    ];
    const entries = groupByBatch(rows, new Map([['lot', header('lot')]]), accessors);

    expect(entries.map((entry) => entry.key)).toEqual(['solo1', 'lot', 'solo2']);
    expect(entries[1]!.kind === 'batch' ? entries[1]!.rows.map((r) => r.id) : []).toEqual([
      'a',
      'b',
    ]);
  });

  it('keeps two batches apart', () => {
    const rows: Row[] = [
      { id: 'a', batchId: 'x' },
      { id: 'b', batchId: 'y' },
      { id: 'c', batchId: 'x' },
    ];
    const batches = new Map([
      ['x', header('x')],
      ['y', header('y')],
    ]);
    const entries = groupByBatch(rows, batches, accessors);

    expect(entries.map((entry) => entry.key)).toEqual(['x', 'y']);
  });

  it('shows a unit on its own when its batch was not fetched', () => {
    const rows: Row[] = [{ id: 'a', batchId: 'unknown' }];
    const entries = groupByBatch(rows, new Map(), accessors);

    expect(entries).toEqual([{ kind: 'item', key: 'a', row: rows[0] }]);
  });

  it('reports only the units it was given, not the whole batch', () => {
    // A filter may well leave a single unit of a five-unit batch on screen.
    const rows: Row[] = [{ id: 'a', batchId: 'lot' }];
    const entries = groupByBatch(rows, new Map([['lot', header('lot', 5)]]), accessors);

    expect(entries[0]!.kind === 'batch' ? entries[0]!.rows : []).toHaveLength(1);
    expect(entries[0]!.kind === 'batch' ? entries[0]!.batch.itemCount : 0).toBe(5);
  });

  it('handles an empty list', () => {
    expect(groupByBatch([], new Map(), accessors)).toEqual([]);
  });
});
