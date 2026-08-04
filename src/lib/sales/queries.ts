import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  buildItems,
  builds,
  catalogComponents,
  inventoryItems,
  lotItems,
  lots,
  sales,
} from '@/lib/db/schema';
import type { PurchasePlatform } from '@/lib/inventory/labels';
import { CATEGORY_LABELS } from '@/lib/specs';
import type { SaleShippingMethod, SaleSubject, SaleSubjectKind } from './labels';
import { computeMargin, computeSalesStats, type Margin, type SalesStats } from './pricing';

export type SaleRow = {
  id: string;
  subject: SaleSubject;
  saleDate: string;
  platform: PurchasePlatform;
  shippingMethod: SaleShippingMethod;
  trackingNumber: string | null;
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
      lineCount: sql<number>`count(${buildItems.id})::int`.as('line_count'),
    })
    .from(builds)
    .leftJoin(buildItems, eq(buildItems.buildId, builds.id))
    .leftJoin(inventoryItems, eq(inventoryItems.id, buildItems.inventoryItemId))
    .groupBy(builds.id)
    .as('build_cost');
}

/** Cost of every lot: the purchase price of the units it holds. */
function lotCostSubquery() {
  return db
    .select({
      lotId: lots.id,
      costCents: sql<number>`coalesce(sum(${inventoryItems.purchasePriceCents}), 0)::int`.as(
        'lot_cost_cents',
      ),
      lineCount: sql<number>`count(${lotItems.id})::int`.as('lot_line_count'),
    })
    .from(lots)
    .leftJoin(lotItems, eq(lotItems.lotId, lots.id))
    .leftJoin(inventoryItems, eq(inventoryItems.id, lotItems.inventoryItemId))
    .groupBy(lots.id)
    .as('lot_cost');
}

export async function listSales(): Promise<SaleRow[]> {
  const buildCostQuery = buildCostSubquery();
  const lotCostQuery = lotCostSubquery();

  // The three subjects are joined in: a sale points at exactly one of them, the
  // other sides of the join stay null.
  const rows = await db
    .select({
      sale: sales,
      buildName: builds.name,
      consumablesCents: builds.consumablesCents,
      componentsCents: buildCostQuery.componentsCents,
      lotName: lots.name,
      lotCostCents: lotCostQuery.costCents,
      lotLineCount: lotCostQuery.lineCount,
      unitPriceCents: inventoryItems.purchasePriceCents,
      brand: catalogComponents.brand,
      model: catalogComponents.model,
    })
    .from(sales)
    .leftJoin(builds, eq(builds.id, sales.buildId))
    .leftJoin(buildCostQuery, eq(buildCostQuery.buildId, sales.buildId))
    .leftJoin(lots, eq(lots.id, sales.lotId))
    .leftJoin(lotCostQuery, eq(lotCostQuery.lotId, sales.lotId))
    .leftJoin(inventoryItems, eq(inventoryItems.id, sales.inventoryItemId))
    .leftJoin(catalogComponents, eq(catalogComponents.id, inventoryItems.catalogComponentId))
    .orderBy(desc(sales.saleDate), desc(sales.createdAt));

  return rows.map((row) => {
    const { sale } = row;

    // A configuration costs its parts plus its consumables; a lot costs the sum
    // of its units; a lone unit costs exactly what it was bought for.
    let subject: SaleSubject;
    let componentsCents: number;
    let consumablesCents = 0;

    if (sale.buildId !== null) {
      subject = { kind: 'build', id: sale.buildId, name: row.buildName ?? 'Configuration' };
      componentsCents = row.componentsCents ?? 0;
      consumablesCents = row.consumablesCents ?? 0;
    } else if (sale.lotId !== null) {
      subject = { kind: 'lot', id: sale.lotId, name: row.lotName ?? 'Lot' };
      componentsCents = row.lotCostCents ?? 0;
    } else {
      subject = {
        kind: 'item',
        id: sale.inventoryItemId!,
        name: [row.brand, row.model].filter(Boolean).join(' ') || 'Composant',
      };
      componentsCents = row.unitPriceCents ?? 0;
    }

    return {
      id: sale.id,
      subject,
      saleDate: sale.saleDate,
      platform: sale.platform,
      shippingMethod: sale.shippingMethod,
      trackingNumber: sale.trackingNumber,
      buyerNotes: sale.buyerNotes,
      componentsCents,
      consumablesCents,
      margin: computeMargin({
        salePriceCents: sale.salePriceCents,
        shippingCostCents: sale.shippingCostCents,
        platformFeeCents: sale.platformFeeCents,
        costCents: componentsCents + consumablesCents,
      }),
    };
  });
}

export async function getSalesStats(): Promise<SalesStats> {
  const rows = await listSales();
  return computeSalesStats(rows);
}

export type SaleRecord = {
  id: string;
  salePriceCents: number;
  saleDate: string;
  platform: PurchasePlatform;
  shippingMethod: SaleShippingMethod;
  shippingCostCents: number;
  platformFeeCents: number;
  trackingNumber: string | null;
  buyerNotes: string | null;
};

/** The column a sale hangs from, one per kind of subject. */
export function saleSubjectColumn(kind: SaleSubjectKind) {
  if (kind === 'build') return sales.buildId;
  if (kind === 'lot') return sales.lotId;
  return sales.inventoryItemId;
}

/** The concluded sale of one subject, if there is one. */
export async function getSaleFor(
  kind: SaleSubjectKind,
  id: string,
): Promise<SaleRecord | null> {
  const [row] = await db
    .select()
    .from(sales)
    .where(eq(saleSubjectColumn(kind), id))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    salePriceCents: row.salePriceCents,
    saleDate: row.saleDate,
    platform: row.platform,
    shippingMethod: row.shippingMethod,
    shippingCostCents: row.shippingCostCents,
    platformFeeCents: row.platformFeeCents,
    trackingNumber: row.trackingNumber,
    buyerNotes: row.buyerNotes,
  };
}

/* ─────────────────────────── Listings ─────────────────────────── */

/** Something offered for sale, waiting for a buyer. */
export type ListingRow = {
  subject: SaleSubject;
  /** Day it was put up for sale; null on a listing set by hand from the list. */
  listedAt: string | null;
  askingPriceCents: number | null;
  /** What it cost to own, the floor the sale has to beat. */
  costCents: number;
  /** Second line of the card: the parts count, or the category and brand. */
  detail: string;
  imagePath: string | null;
};

export type ListingsSummary = {
  count: number;
  /** Cost tied up in everything currently listed. */
  costCents: number;
  /** Sum of the asking prices, blanks counted as zero. */
  askingCents: number;
};

/**
 * Everything currently for sale, configurations and lone components together,
 * most recently listed first. A listing without a date lands at the end rather
 * than being hidden.
 */
export async function listListings(): Promise<ListingRow[]> {
  const buildCostQuery = buildCostSubquery();
  const lotCostQuery = lotCostSubquery();

  const lotRows = await db
    .select({
      id: lots.id,
      name: lots.name,
      listedAt: lots.listedAt,
      askingPriceCents: lots.askingPriceCents,
      costCents: lotCostQuery.costCents,
      lineCount: lotCostQuery.lineCount,
    })
    .from(lots)
    .leftJoin(lotCostQuery, eq(lotCostQuery.lotId, lots.id))
    .where(eq(lots.status, 'en_vente'));

  const buildRows = await db
    .select({
      id: builds.id,
      name: builds.name,
      listedAt: builds.listedAt,
      askingPriceCents: builds.askingPriceCents,
      consumablesCents: builds.consumablesCents,
      componentsCents: buildCostQuery.componentsCents,
      lineCount: buildCostQuery.lineCount,
    })
    .from(builds)
    .leftJoin(buildCostQuery, eq(buildCostQuery.buildId, builds.id))
    .where(eq(builds.status, 'en_vente'));

  const itemRows = await db
    .select({ item: inventoryItems, component: catalogComponents })
    .from(inventoryItems)
    .innerJoin(catalogComponents, eq(catalogComponents.id, inventoryItems.catalogComponentId))
    .where(eq(inventoryItems.status, 'en_vente'));

  const rows: ListingRow[] = [
    ...buildRows.map((row) => {
      const count = row.lineCount ?? 0;
      return {
        subject: { kind: 'build' as const, id: row.id, name: row.name },
        listedAt: row.listedAt,
        askingPriceCents: row.askingPriceCents,
        costCents: (row.componentsCents ?? 0) + row.consumablesCents,
        detail: `Configuration · ${count} composant${count > 1 ? 's' : ''}`,
        imagePath: null,
      };
    }),
    ...lotRows.map((row) => {
      const count = row.lineCount ?? 0;
      return {
        subject: { kind: 'lot' as const, id: row.id, name: row.name },
        listedAt: row.listedAt,
        askingPriceCents: row.askingPriceCents,
        costCents: row.costCents ?? 0,
        detail: `Lot · ${count} unité${count > 1 ? 's' : ''}`,
        imagePath: null,
      };
    }),
    ...itemRows.map(({ item, component }) => ({
      subject: {
        kind: 'item' as const,
        id: item.id,
        name: `${component.brand} ${component.model}`,
      },
      listedAt: item.listedAt,
      askingPriceCents: item.askingPriceCents,
      costCents: item.purchasePriceCents,
      detail: `${CATEGORY_LABELS[component.category]} · ${component.brand}`,
      imagePath: component.imagePath,
    })),
  ];

  return rows.sort((a, b) => (b.listedAt ?? '').localeCompare(a.listedAt ?? ''));
}

export function summarizeListings(rows: ListingRow[]): ListingsSummary {
  return {
    count: rows.length,
    costCents: rows.reduce((sum, row) => sum + row.costCents, 0),
    askingCents: rows.reduce((sum, row) => sum + (row.askingPriceCents ?? 0), 0),
  };
}
