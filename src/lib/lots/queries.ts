import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { summarizeSpecs } from '@/lib/catalog/format';
import { db } from '@/lib/db';
import { buildItems, catalogComponents, inventoryItems, lotItems, lots } from '@/lib/db/schema';
import { imageUrl } from '@/lib/images/store';
import type { LotCandidate, LotDetail, LotLine, LotSummaryRow } from './types';

/** Cost of a lot: what its units cost to buy, nothing else. */
// Built inside the function on purpose: at module scope it would touch the
// lazily created database client while `next build` is collecting page data.
function lotCostSubquery() {
  return db
    .select({
      lotId: lots.id,
      costCents: sql<number>`coalesce(sum(${inventoryItems.purchasePriceCents}), 0)::int`.as(
        'cost_cents',
      ),
      lineCount: sql<number>`count(${lotItems.id})::int`.as('line_count'),
    })
    .from(lots)
    .leftJoin(lotItems, eq(lotItems.lotId, lots.id))
    .leftJoin(inventoryItems, eq(inventoryItems.id, lotItems.inventoryItemId))
    .groupBy(lots.id)
    .as('lot_cost');
}

export async function listLots(): Promise<LotSummaryRow[]> {
  const costQuery = lotCostSubquery();

  const rows = await db
    .select({
      id: lots.id,
      name: lots.name,
      status: lots.status,
      createdAt: lots.createdAt,
      listedAt: lots.listedAt,
      askingPriceCents: lots.askingPriceCents,
      costCents: costQuery.costCents,
      lineCount: costQuery.lineCount,
    })
    .from(lots)
    .leftJoin(costQuery, eq(costQuery.lotId, lots.id))
    .orderBy(desc(lots.createdAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    costCents: row.costCents ?? 0,
    lineCount: row.lineCount ?? 0,
  }));
}

export async function getLotDetail(id: string): Promise<LotDetail | null> {
  const [lot] = await db.select().from(lots).where(eq(lots.id, id)).limit(1);
  if (!lot) return null;

  const rows = await db
    .select({ line: lotItems, item: inventoryItems, component: catalogComponents })
    .from(lotItems)
    .innerJoin(inventoryItems, eq(inventoryItems.id, lotItems.inventoryItemId))
    .innerJoin(catalogComponents, eq(catalogComponents.id, inventoryItems.catalogComponentId))
    .where(eq(lotItems.lotId, id))
    .orderBy(asc(lotItems.position), asc(lotItems.createdAt));

  const lines: LotLine[] = rows.map(({ line, item, component }) => ({
    id: line.id,
    inventoryItemId: item.id,
    category: component.category,
    brand: component.brand,
    model: component.model,
    imagePath: component.imagePath,
    summary: summarizeSpecs(component.specs),
    priceCents: item.purchasePriceCents,
    condition: item.condition,
    purchaseDate: item.purchaseDate,
    position: line.position,
  }));

  return {
    id: lot.id,
    name: lot.name,
    status: lot.status,
    listedAt: lot.listedAt,
    askingPriceCents: lot.askingPriceCents,
    notes: lot.notes,
    createdAt: lot.createdAt.toISOString(),
    lines,
  };
}

/**
 * Units that can still join a lot: in stock, and engaged nowhere else. A part
 * held by a configuration or by another lot is deliberately absent — it is
 * already promised.
 */
export async function candidatesForLot(q?: string, limit = 40): Promise<LotCandidate[]> {
  const pattern = q?.trim() ? `%${q.trim()}%` : null;
  const textMatch = pattern
    ? or(
        ilike(catalogComponents.brand, pattern),
        ilike(catalogComponents.model, pattern),
        ilike(inventoryItems.serialNumber, pattern),
      )
    : undefined;

  const rows = await db
    .select({ item: inventoryItems, component: catalogComponents })
    .from(inventoryItems)
    .innerJoin(catalogComponents, eq(catalogComponents.id, inventoryItems.catalogComponentId))
    .leftJoin(buildItems, eq(buildItems.inventoryItemId, inventoryItems.id))
    .leftJoin(lotItems, eq(lotItems.inventoryItemId, inventoryItems.id))
    .where(
      and(
        eq(inventoryItems.status, 'en_stock'),
        isNull(buildItems.id),
        isNull(lotItems.id),
        textMatch,
      ),
    )
    .orderBy(desc(inventoryItems.purchaseDate))
    .limit(limit);

  return rows.map(({ item, component }) => ({
    id: item.id,
    category: component.category,
    brand: component.brand,
    model: component.model,
    imageUrl: imageUrl(component.imagePath),
    summary: summarizeSpecs(component.specs),
    priceCents: item.purchasePriceCents,
    condition: item.condition,
    purchaseDate: item.purchaseDate,
  }));
}

/** The lot a unit belongs to, so its own page can point at it. */
export async function getLotOfItem(
  inventoryItemId: string,
): Promise<{ id: string; name: string; status: LotDetail['status'] } | null> {
  const [row] = await db
    .select({ id: lots.id, name: lots.name, status: lots.status })
    .from(lotItems)
    .innerJoin(lots, eq(lots.id, lotItems.lotId))
    .where(eq(lotItems.inventoryItemId, inventoryItemId))
    .limit(1);
  return row ?? null;
}
