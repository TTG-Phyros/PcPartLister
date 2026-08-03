import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buildItems, builds, inventoryItems, sales } from '@/lib/db/schema';
import type { PurchasePlatform } from '@/lib/inventory/labels';
import { computeMargin, computeSalesStats, type Margin, type SalesStats } from './pricing';

export type SaleRow = {
  id: string;
  buildId: string;
  buildName: string;
  saleDate: string;
  platform: PurchasePlatform;
  buyerNotes: string | null;
  margin: Margin;
  /** Split of the cost, for the detail line. */
  componentsCents: number;
  consumablesCents: number;
};

/**
 * Cost of every build in one pass: owned units at what they cost, parts still
 * to buy at their estimate. Shared by the sales list and the single-sale view.
 */
// Built inside the function on purpose: at module scope it would touch the
// lazily created database client while `next build` is collecting page data.
function buildCostSubquery() {
  return db
    .select({
      buildId: builds.id,
      componentsCents: sql<number>`coalesce(sum(
        coalesce(${inventoryItems.purchasePriceCents}, ${buildItems.estimatedPriceCents}, 0)
      ), 0)::int`.as('components_cents'),
    })
    .from(builds)
    .leftJoin(buildItems, eq(buildItems.buildId, builds.id))
    .leftJoin(inventoryItems, eq(inventoryItems.id, buildItems.inventoryItemId))
    .groupBy(builds.id)
    .as('build_cost');
}

export async function listSales(): Promise<SaleRow[]> {
  const buildCostQuery = buildCostSubquery();

  const rows = await db
    .select({
      sale: sales,
      buildName: builds.name,
      consumablesCents: builds.consumablesCents,
      componentsCents: buildCostQuery.componentsCents,
    })
    .from(sales)
    .innerJoin(builds, eq(builds.id, sales.buildId))
    .leftJoin(buildCostQuery, eq(buildCostQuery.buildId, sales.buildId))
    .orderBy(desc(sales.saleDate), desc(sales.createdAt));

  return rows.map(({ sale, buildName, consumablesCents, componentsCents }) => {
    const components = componentsCents ?? 0;
    return {
      id: sale.id,
      buildId: sale.buildId,
      buildName,
      saleDate: sale.saleDate,
      platform: sale.platform,
      buyerNotes: sale.buyerNotes,
      componentsCents: components,
      consumablesCents,
      margin: computeMargin({
        salePriceCents: sale.salePriceCents,
        shippingCostCents: sale.shippingCostCents,
        platformFeeCents: sale.platformFeeCents,
        costCents: components + consumablesCents,
      }),
    };
  });
}

export async function getSalesStats(): Promise<SalesStats> {
  const rows = await listSales();
  return computeSalesStats(rows);
}

export type SaleForBuild = {
  id: string;
  salePriceCents: number;
  saleDate: string;
  platform: PurchasePlatform;
  shippingCostCents: number;
  platformFeeCents: number;
  buyerNotes: string | null;
};

export async function getSaleForBuild(buildId: string): Promise<SaleForBuild | null> {
  const [row] = await db.select().from(sales).where(eq(sales.buildId, buildId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    salePriceCents: row.salePriceCents,
    saleDate: row.saleDate,
    platform: row.platform,
    shippingCostCents: row.shippingCostCents,
    platformFeeCents: row.platformFeeCents,
    buyerNotes: row.buyerNotes,
  };
}
