import { sql, type SQL } from 'drizzle-orm';
import { inventoryItems } from '@/lib/db/schema';
import type { ItemStatus } from '@/lib/inventory/labels';
import type { BuildStatus } from './types';

/**
 * What a configuration does to the units it holds. Shared rather than private
 * to the build actions: buying a missing part engages the new unit the very
 * same way, and the two must never drift apart.
 */

/**
 * A unit placed in a configuration is no longer freely available. Its status
 * follows the configuration: reserved while the build is a draft, mounted once
 * assembled, sold once the build is sold.
 */
export const UNIT_STATUS_FOR_BUILD: Record<BuildStatus, ItemStatus> = {
  brouillon: 'reserve',
  montee: 'monte',
  en_vente: 'en_vente',
  vendue: 'vendu',
};

/**
 * A parcel does not land because a configuration claims it: a unit still
 * `en_transit` keeps that status instead of the one asked for.
 */
export function keepingTransit(otherwise: ItemStatus): SQL {
  return sql`(case when ${inventoryItems.status} = 'en_transit' then 'en_transit' else ${otherwise} end)::item_status`;
}

/**
 * What a unit becomes when a configuration takes it. Reserving leaves a parcel
 * on the road; the other statuses all mean the part is in hand, so they double
 * as its reception — `coalesce` keeps the first arrival date.
 */
export function engagedUnit(build: BuildStatus): { status: ItemStatus | SQL; receivedAt?: SQL } {
  const status = UNIT_STATUS_FOR_BUILD[build];
  if (status === 'reserve') return { status: keepingTransit('reserve') };
  return { status, receivedAt: sql`coalesce(${inventoryItems.receivedAt}, current_date)` };
}

/** Freed from a configuration: back on the shelf, or back to waiting for it. */
export const freedUnit = { status: keepingTransit('en_stock') };
