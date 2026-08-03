import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  buildItems,
  catalogComponents,
  inventoryItems,
  type CatalogComponent,
  type InventoryItem,
} from '@/lib/db/schema';
import type { ComponentCategory } from '@/lib/specs';
import type { ItemCondition, ItemStatus } from './labels';

/** An owned unit joined with the model it inherits its specs and picture from. */
export type InventoryRow = { item: InventoryItem; component: CatalogComponent };

export type InventoryFilters = {
  q?: string;
  category?: ComponentCategory;
  status?: ItemStatus;
  condition?: ItemCondition;
  socket?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  /** Only units in stock since more than N days. */
  dormantDays?: number;
  /** Only parcels on their way. */
  inTransit?: boolean;
  limit?: number;
  offset?: number;
};

function buildWhere(filters: InventoryFilters): SQL | undefined {
  const clauses: SQL[] = [];

  if (filters.q) {
    const pattern = `%${filters.q.trim()}%`;
    const match = or(
      ilike(catalogComponents.brand, pattern),
      ilike(catalogComponents.model, pattern),
      ilike(inventoryItems.serialNumber, pattern),
      ilike(inventoryItems.notes, pattern),
    );
    if (match) clauses.push(match);
  }

  if (filters.category) clauses.push(eq(catalogComponents.category, filters.category));
  if (filters.status) clauses.push(eq(inventoryItems.status, filters.status));
  if (filters.condition) clauses.push(eq(inventoryItems.condition, filters.condition));

  if (filters.socket) {
    const socket = filters.socket;
    const match = or(
      sql`${catalogComponents.specs}->>'socket' = ${socket}`,
      sql`${catalogComponents.specs}->'supportedSockets' @> ${JSON.stringify([socket])}::jsonb`,
    );
    if (match) clauses.push(match);
  }

  if (filters.minPriceCents !== undefined) {
    clauses.push(gte(inventoryItems.purchasePriceCents, filters.minPriceCents));
  }
  if (filters.maxPriceCents !== undefined) {
    clauses.push(lte(inventoryItems.purchasePriceCents, filters.maxPriceCents));
  }

  if (filters.dormantDays !== undefined) {
    clauses.push(eq(inventoryItems.status, 'en_stock'));
    // Interval built from an integer parameter: no date value is interpolated.
    clauses.push(
      sql`${inventoryItems.purchaseDate} < current_date - make_interval(days => ${filters.dormantDays}::int)`,
    );
  }

  if (filters.inTransit) clauses.push(eq(inventoryItems.status, 'en_transit'));

  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

export async function searchInventory(filters: InventoryFilters): Promise<InventoryRow[]> {
  const rows = await db
    .select({ item: inventoryItems, component: catalogComponents })
    .from(inventoryItems)
    .innerJoin(catalogComponents, eq(catalogComponents.id, inventoryItems.catalogComponentId))
    .where(buildWhere(filters))
    .orderBy(desc(inventoryItems.purchaseDate), desc(inventoryItems.createdAt))
    .limit(filters.limit ?? 200)
    .offset(filters.offset ?? 0);
  return rows;
}

export async function countInventory(filters: InventoryFilters): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryItems)
    .innerJoin(catalogComponents, eq(catalogComponents.id, inventoryItems.catalogComponentId))
    .where(buildWhere(filters));
  return rows[0]?.count ?? 0;
}

export async function getInventoryItem(id: string): Promise<InventoryRow | null> {
  const rows = await db
    .select({ item: inventoryItems, component: catalogComponents })
    .from(inventoryItems)
    .innerJoin(catalogComponents, eq(catalogComponents.id, inventoryItems.catalogComponentId))
    .where(eq(inventoryItems.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Whether a unit is placed in a configuration, which pins it to its slot. */
export async function isInventoryItemInBuild(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: buildItems.id })
    .from(buildItems)
    .where(eq(buildItems.inventoryItemId, id))
    .limit(1);
  return rows.length > 0;
}

/* ─────────────────────────── Summary ─────────────────────────── */

export type InventorySummary = {
  /** Units still owned and not sold. */
  ownedCount: number;
  inStockCount: number;
  /** Purchase-price value of everything not sold yet. */
  ownedValueCents: number;
  inStockValueCents: number;
  soldCount: number;
  deadCount: number;
  byCategory: Array<{ category: ComponentCategory; count: number; valueCents: number }>;
  dormantCount: number;
  dormantValueCents: number;
  /** Parcels paid for but not delivered yet. */
  inTransitCount: number;
  inTransitValueCents: number;
  /** Among those, the ones past their announced delivery date. */
  lateParcelCount: number;
};

export async function getInventorySummary(dormantDays: number): Promise<InventorySummary> {
  const [totals] = await db
    .select({
      ownedCount: sql<number>`count(*) filter (where ${inventoryItems.status} <> 'vendu')::int`,
      inStockCount: sql<number>`count(*) filter (where ${inventoryItems.status} = 'en_stock')::int`,
      ownedValueCents: sql<number>`coalesce(sum(${inventoryItems.purchasePriceCents}) filter (where ${inventoryItems.status} <> 'vendu'), 0)::int`,
      inStockValueCents: sql<number>`coalesce(sum(${inventoryItems.purchasePriceCents}) filter (where ${inventoryItems.status} = 'en_stock'), 0)::int`,
      soldCount: sql<number>`count(*) filter (where ${inventoryItems.status} = 'vendu')::int`,
      deadCount: sql<number>`count(*) filter (where ${inventoryItems.status} = 'hs')::int`,
      inTransitCount: sql<number>`count(*) filter (where ${inventoryItems.status} = 'en_transit')::int`,
      inTransitValueCents: sql<number>`coalesce(sum(${inventoryItems.purchasePriceCents}) filter (where ${inventoryItems.status} = 'en_transit'), 0)::int`,
      lateParcelCount: sql<number>`count(*) filter (where ${inventoryItems.status} = 'en_transit' and ${inventoryItems.expectedArrival} < current_date)::int`,
    })
    .from(inventoryItems);

  const byCategory = await db
    .select({
      category: catalogComponents.category,
      count: sql<number>`count(*)::int`,
      valueCents: sql<number>`coalesce(sum(${inventoryItems.purchasePriceCents}), 0)::int`,
    })
    .from(inventoryItems)
    .innerJoin(catalogComponents, eq(catalogComponents.id, inventoryItems.catalogComponentId))
    .where(sql`${inventoryItems.status} <> 'vendu'`)
    .groupBy(catalogComponents.category)
    .orderBy(asc(catalogComponents.category));

  const [dormant] = await db
    .select({
      count: sql<number>`count(*)::int`,
      valueCents: sql<number>`coalesce(sum(${inventoryItems.purchasePriceCents}), 0)::int`,
    })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.status, 'en_stock'),
        sql`${inventoryItems.purchaseDate} < current_date - make_interval(days => ${dormantDays}::int)`,
      ),
    );

  return {
    ownedCount: totals?.ownedCount ?? 0,
    inStockCount: totals?.inStockCount ?? 0,
    ownedValueCents: totals?.ownedValueCents ?? 0,
    inStockValueCents: totals?.inStockValueCents ?? 0,
    soldCount: totals?.soldCount ?? 0,
    deadCount: totals?.deadCount ?? 0,
    byCategory: byCategory as InventorySummary['byCategory'],
    dormantCount: dormant?.count ?? 0,
    dormantValueCents: dormant?.valueCents ?? 0,
    inTransitCount: totals?.inTransitCount ?? 0,
    inTransitValueCents: totals?.inTransitValueCents ?? 0,
    lateParcelCount: totals?.lateParcelCount ?? 0,
  };
}

/**
 * Parcels on their way, soonest first. A unit without an announced date lands
 * at the end rather than being hidden.
 */
export async function listIncomingParcels(limit = 10): Promise<InventoryRow[]> {
  return db
    .select({ item: inventoryItems, component: catalogComponents })
    .from(inventoryItems)
    .innerJoin(catalogComponents, eq(catalogComponents.id, inventoryItems.catalogComponentId))
    .where(eq(inventoryItems.status, 'en_transit'))
    .orderBy(sql`${inventoryItems.expectedArrival} asc nulls last`, asc(inventoryItems.purchaseDate))
    .limit(limit);
}

/** Sockets actually present in stock, for the filter dropdown. */
export async function listInventorySockets(): Promise<string[]> {
  const rows = await db.execute<{ socket: string }>(
    sql`select distinct value as socket from (
          select ${catalogComponents.specs}->>'socket' as value
            from ${inventoryItems}
            join ${catalogComponents} on ${catalogComponents.id} = ${inventoryItems.catalogComponentId}
          union all
          select jsonb_array_elements_text(${catalogComponents.specs}->'supportedSockets')
            from ${inventoryItems}
            join ${catalogComponents} on ${catalogComponents.id} = ${inventoryItems.catalogComponentId}
            where jsonb_typeof(${catalogComponents.specs}->'supportedSockets') = 'array'
        ) s
        where value is not null and value <> ''
        order by socket`,
  );
  return rows.map((r) => r.socket);
}

/** Units of one specific model currently in stock. */
export async function countInStockForComponent(componentId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.catalogComponentId, componentId),
        eq(inventoryItems.status, 'en_stock'),
      ),
    );
  return rows[0]?.count ?? 0;
}

/** How many units of each catalog model are currently in stock. */
export async function countInStockByComponent(): Promise<Record<string, number>> {
  const rows = await db
    .select({
      componentId: inventoryItems.catalogComponentId,
      count: sql<number>`count(*)::int`,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.status, 'en_stock'))
    .groupBy(inventoryItems.catalogComponentId);
  return Object.fromEntries(rows.map((r) => [r.componentId, r.count]));
}
