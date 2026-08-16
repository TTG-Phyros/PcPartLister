import { asc, eq, inArray, sql } from 'drizzle-orm';
import { summarizeSpecs } from '@/lib/catalog/format';
import { db } from '@/lib/db';
import { catalogComponents, inventoryItems, purchaseBatches } from '@/lib/db/schema';
import type { BatchHeader, BatchLine, BatchMembership, PurchaseBatchDetail } from './types';

/**
 * The batches referenced by a page of units, in one round trip. Keyed by id so
 * a list can fold its rows without asking anything more of the database.
 */
export async function getBatchHeaders(ids: string[]): Promise<Map<string, BatchHeader>> {
  const distinct = [...new Set(ids)];
  if (distinct.length === 0) return new Map();

  const rows = await db
    .select({
      id: purchaseBatches.id,
      label: purchaseBatches.label,
      totalPriceCents: purchaseBatches.totalPriceCents,
      purchaseDate: purchaseBatches.purchaseDate,
      platform: purchaseBatches.platform,
      shippingCarrier: purchaseBatches.shippingCarrier,
      trackingNumber: purchaseBatches.trackingNumber,
      trackingUrl: purchaseBatches.trackingUrl,
      expectedArrival: purchaseBatches.expectedArrival,
      // The batch's real size, which a filtered list may only be showing part of.
      itemCount: sql<number>`count(${inventoryItems.id})::int`,
    })
    .from(purchaseBatches)
    .leftJoin(inventoryItems, eq(inventoryItems.purchaseBatchId, purchaseBatches.id))
    .where(inArray(purchaseBatches.id, distinct))
    .groupBy(purchaseBatches.id);

  return new Map(rows.map((row) => [row.id, row]));
}

export async function getPurchaseBatchDetail(id: string): Promise<PurchaseBatchDetail | null> {
  const [batch] = await db
    .select()
    .from(purchaseBatches)
    .where(eq(purchaseBatches.id, id))
    .limit(1);
  if (!batch) return null;

  const rows = await db
    .select({ item: inventoryItems, component: catalogComponents })
    .from(inventoryItems)
    .innerJoin(catalogComponents, eq(catalogComponents.id, inventoryItems.catalogComponentId))
    .where(eq(inventoryItems.purchaseBatchId, id))
    .orderBy(asc(inventoryItems.createdAt));

  const lines: BatchLine[] = rows.map(({ item, component }) => ({
    inventoryItemId: item.id,
    category: component.category,
    brand: component.brand,
    model: component.model,
    imagePath: component.imagePath,
    summary: summarizeSpecs(component.specs),
    priceCents: item.purchasePriceCents,
    condition: item.condition,
    status: item.status,
    receivedAt: item.receivedAt,
  }));

  return {
    id: batch.id,
    label: batch.label,
    totalPriceCents: batch.totalPriceCents,
    purchaseDate: batch.purchaseDate,
    platform: batch.platform,
    listingUrl: batch.listingUrl,
    shippingCarrier: batch.shippingCarrier,
    trackingNumber: batch.trackingNumber,
    trackingUrl: batch.trackingUrl,
    expectedArrival: batch.expectedArrival,
    notes: batch.notes,
    createdAt: batch.createdAt.toISOString(),
    lines,
    splitTotalCents: lines.reduce((sum, line) => sum + line.priceCents, 0),
  };
}

/** The batch a unit came in with, so its own page can point back at it. */
export async function getBatchOfItem(inventoryItemId: string): Promise<BatchMembership | null> {
  const [row] = await db
    .select({
      id: purchaseBatches.id,
      label: purchaseBatches.label,
      totalPriceCents: purchaseBatches.totalPriceCents,
      shippingCarrier: purchaseBatches.shippingCarrier,
      trackingNumber: purchaseBatches.trackingNumber,
      trackingUrl: purchaseBatches.trackingUrl,
      expectedArrival: purchaseBatches.expectedArrival,
    })
    .from(inventoryItems)
    .innerJoin(purchaseBatches, eq(purchaseBatches.id, inventoryItems.purchaseBatchId))
    .where(eq(inventoryItems.id, inventoryItemId))
    .limit(1);
  if (!row) return null;

  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryItems)
    .where(eq(inventoryItems.purchaseBatchId, row.id));

  return { ...row, itemCount: counted?.count ?? 0 };
}
