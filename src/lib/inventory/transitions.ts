import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { BuildStatus } from '@/lib/builds/types';
import type { Database } from '@/lib/db';
import { buildItems, inventoryItems, lotItems } from '@/lib/db/schema';
import type { LotStatus } from '@/lib/lots/types';
import type { SaleSubjectKind } from '@/lib/sales/labels';
import type { ItemStatus } from './labels';
import { UNIT_STATUS_FOR_BUILD, UNIT_STATUS_FOR_LOT } from './status';

/**
 * The SQL twin of `status.ts`: the update patches every action applies to move
 * a unit. Written once here so a configuration, a lot and a sale cannot drift
 * into three different ideas of what happens to the hardware they hold — which
 * is exactly what they had.
 *
 * Every patch is a function, never a shared constant: `updatedAt` must be the
 * moment of the write, not the moment the module was imported.
 */

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Either the pool or an open transaction: the guards read from both. */
type Runner = Database | Tx;

type UnitPatch = { status: SQL; listedAt: SQL; updatedAt: Date };

/** A unit is here when it has been received. The wall, as one expression. */
const notInHand = sql`${inventoryItems.receivedAt} is null`;

/**
 * SQL twin of `automatic()`. The wall stands in the database expression itself
 * rather than in a status read beforehand: two concurrent updates cannot slip a
 * unit past its arrival between the read and the write.
 */
function automatic(target: ItemStatus): SQL {
  return sql`(case when ${notInHand} then ${inventoryItems.status} else ${target} end)::item_status`;
}

/** SQL twin of `freed()`: the shelf, unless the unit is not here or is dead. */
function freedStatus(): SQL {
  return sql`(case
    when ${notInHand} then ${inventoryItems.status}
    when ${inventoryItems.status} = 'hs' then 'hs'
    else 'en_stock' end)::item_status`;
}

/**
 * The listing date belongs to the status and is written with it: stamped the
 * day a unit starts being announced, kept once it is sold — « en vente depuis »
 * is history worth having — and dropped when it comes back off the market. Read
 * off the status the unit actually lands on, so a unit still awaited under a
 * listed configuration is not dated as if it were in the shop window.
 */
function withListing(status: SQL): UnitPatch {
  return {
    status,
    listedAt: sql`(case (${status})
      when 'en_vente' then coalesce(${inventoryItems.listedAt}, current_date)
      when 'vendu' then ${inventoryItems.listedAt}
      else null end)`,
    updatedAt: new Date(),
  };
}

/** What a configuration does to the units it holds. */
export function engagedByBuild(build: BuildStatus): UnitPatch {
  return withListing(automatic(UNIT_STATUS_FOR_BUILD[build]));
}

/** What a lot does to the units it holds. */
export function engagedByLot(lot: LotStatus): UnitPatch {
  return withListing(automatic(UNIT_STATUS_FOR_LOT[lot]));
}

/** Freed from whatever held it: back on the shelf, or back to waiting. */
export function freedUnit(): UnitPatch {
  return withListing(freedStatus());
}

/**
 * Carried to a status by an event of its own — announced, sold, taken off sale.
 * Same wall as everywhere else: a unit that is not here stays where it is.
 */
export function movedTo(target: ItemStatus): UnitPatch {
  return withListing(automatic(target));
}

/**
 * The unit arrived — the parcel landed, or the hand-over happened. The only
 * patch in this file allowed to end the wait, and the only one that writes a
 * reception date. Always applied with `pendingArrival()` so it can never
 * re-date a unit that was already here.
 */
export function arrived() {
  return {
    status: 'en_stock' as const,
    receivedAt: sql`current_date`,
    updatedAt: new Date(),
  };
}

/** Restricts an arrival to the units actually waiting for one. */
export function pendingArrival(): SQL {
  return isNull(inventoryItems.receivedAt);
}

/* ─────────────────────────── Guards ─────────────────────────── */

/**
 * The units a configuration or a lot holds. A lone unit is its own subject and
 * holds nothing, hence the empty list.
 */
export async function heldUnitIds(
  runner: Runner,
  kind: SaleSubjectKind,
  id: string,
): Promise<string[]> {
  if (kind === 'build') {
    const rows = await runner
      .select({ id: buildItems.inventoryItemId })
      .from(buildItems)
      .where(and(eq(buildItems.buildId, id), sql`${buildItems.inventoryItemId} is not null`));
    return rows.map((row) => row.id).filter((value): value is string => value !== null);
  }
  if (kind === 'lot') {
    const rows = await runner
      .select({ id: lotItems.inventoryItemId })
      .from(lotItems)
      .where(eq(lotItems.lotId, id));
    return rows.map((row) => row.id);
  }
  return [];
}

/**
 * How many units of a configuration, of a lot, or of a lone unit have not
 * arrived yet. What stands between « je la mets en vente » and a part that is
 * not in the flat yet.
 */
export async function countAwaited(
  runner: Runner,
  kind: SaleSubjectKind,
  id: string,
): Promise<number> {
  const ids = kind === 'item' ? [id] : await heldUnitIds(runner, kind, id);
  if (ids.length === 0) return 0;

  const [row] = await runner
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryItems)
    .where(and(inArray(inventoryItems.id, ids), pendingArrival()));
  return row?.count ?? 0;
}
