import type { BatchHeader } from './types';

/**
 * A list of units seen as a list of arrivals: either a unit that came in on its
 * own, or the several that shared a parcel.
 */
export type BatchEntry<T> =
  | { kind: 'item'; key: string; row: T }
  | { kind: 'batch'; key: string; batch: BatchHeader; rows: T[] };

/**
 * Folds the units of a same batch into one entry, in place of the first of
 * them. Order is otherwise preserved: the caller has already sorted its rows,
 * and grouping must not silently re-rank them.
 *
 * A unit whose batch is unknown — outside the window the caller fetched — stays
 * on its own rather than disappearing into a group that cannot be described.
 */
export function groupByBatch<T>(
  rows: T[],
  batches: Map<string, BatchHeader>,
  accessors: { batchId: (row: T) => string | null; key: (row: T) => string },
): Array<BatchEntry<T>> {
  const entries: Array<BatchEntry<T>> = [];
  const openGroups = new Map<string, Extract<BatchEntry<T>, { kind: 'batch' }>>();

  for (const row of rows) {
    const batchId = accessors.batchId(row);
    const batch = batchId === null ? undefined : batches.get(batchId);

    if (batchId === null || batch === undefined) {
      entries.push({ kind: 'item', key: accessors.key(row), row });
      continue;
    }

    const open = openGroups.get(batchId);
    if (open) {
      open.rows.push(row);
      continue;
    }

    // Pushed now and filled as the following rows arrive: the entry keeps the
    // position of the batch's first unit.
    const created = { kind: 'batch' as const, key: batchId, batch, rows: [row] };
    openGroups.set(batchId, created);
    entries.push(created);
  }

  return entries;
}
