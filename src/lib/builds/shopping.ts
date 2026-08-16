import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { summarizeSpecs } from '@/lib/catalog/format';
import { db } from '@/lib/db';
import {
  buildItems,
  builds,
  catalogComponents,
  inventoryItems,
  lotItems,
} from '@/lib/db/schema';
import { AVAILABLE_STATUSES } from '@/lib/inventory/labels';
import { SLOT_ORDER, type BuildStatus } from '@/lib/builds/types';
import type { ComponentCategory } from '@/lib/specs';

/**
 * The shopping list: every model a configuration asks for and that no unit
 * covers yet.
 *
 * There is nothing to compute from scratch here — a build line already says it
 * either holds an owned unit or names a catalog model still to be bought. This
 * module only reads the second kind, folds the same model requested twice into
 * one line, and says which configurations are waiting on it.
 */

/** One configuration waiting on the model. */
export type ShoppingNeed = {
  /** The build line to fill — what the purchase form will replace. */
  lineId: string;
  buildId: string;
  buildName: string;
  buildStatus: BuildStatus;
  slot: ComponentCategory;
  quantity: number;
  estimatedPriceCents: number | null;
};

export type ShoppingRow = {
  catalogComponentId: string;
  category: ComponentCategory;
  brand: string;
  model: string;
  imagePath: string | null;
  summary: string[];
  msrpCents: number | null;
  /** Units to buy, all configurations taken together. */
  quantity: number;
  /** What the purchase should cost, from the line estimates. */
  estimatedTotalCents: number;
  /**
   * Free units of this model already owned. Normally zero — a non-zero count
   * means the part was bought since the line was drafted and only needs to be
   * attached, not ordered again.
   */
  availableStock: number;
  needs: ShoppingNeed[];
};

export type ShoppingList = {
  rows: ShoppingRow[];
  /** Distinct models to source. */
  modelCount: number;
  /** Units to buy, quantities included. */
  unitCount: number;
  estimatedTotalCents: number;
  /** Configurations held up by at least one missing part. */
  buildCount: number;
};

const slotRank = new Map(SLOT_ORDER.map((slot, index) => [slot, index]));

/**
 * A configuration only asks for parts while it can still be completed. A sold
 * one is a record of what was: its unfilled lines are history, not errands.
 */
const OPEN_BUILD = ne(builds.status, 'vendue');

export async function getShoppingList(): Promise<ShoppingList> {
  const lines = await db
    .select({
      lineId: buildItems.id,
      buildId: builds.id,
      buildName: builds.name,
      buildStatus: builds.status,
      slot: buildItems.slot,
      quantity: buildItems.quantity,
      estimatedPriceCents: buildItems.estimatedPriceCents,
      component: catalogComponents,
    })
    .from(buildItems)
    .innerJoin(builds, eq(builds.id, buildItems.buildId))
    .innerJoin(catalogComponents, eq(catalogComponents.id, buildItems.catalogComponentId))
    .where(and(isNotNull(buildItems.catalogComponentId), OPEN_BUILD))
    .orderBy(asc(builds.createdAt), asc(buildItems.position));

  if (lines.length === 0) {
    return { rows: [], modelCount: 0, unitCount: 0, estimatedTotalCents: 0, buildCount: 0 };
  }

  // Units of those very models sitting free in the stock. Same availability
  // rule as the configurator offers, so the count never promises a unit the
  // slot picker would refuse.
  const stock = await countAvailableStock([...new Set(lines.map((l) => l.component.id))]);

  const byModel = new Map<string, ShoppingRow>();
  for (const line of lines) {
    const { component } = line;
    // The estimate carried by the line, or failing that the model's indicative
    // new price: a shopping list with no total is not a plan.
    const unitPriceCents = line.estimatedPriceCents ?? component.msrpCents ?? 0;

    let row = byModel.get(component.id);
    if (!row) {
      row = {
        catalogComponentId: component.id,
        category: component.category,
        brand: component.brand,
        model: component.model,
        imagePath: component.imagePath,
        summary: summarizeSpecs(component.specs),
        msrpCents: component.msrpCents,
        quantity: 0,
        estimatedTotalCents: 0,
        availableStock: stock.get(component.id) ?? 0,
        needs: [],
      };
      byModel.set(component.id, row);
    }

    row.quantity += line.quantity;
    row.estimatedTotalCents += unitPriceCents * line.quantity;
    row.needs.push({
      lineId: line.lineId,
      buildId: line.buildId,
      buildName: line.buildName,
      buildStatus: line.buildStatus,
      slot: line.slot,
      quantity: line.quantity,
      estimatedPriceCents: line.estimatedPriceCents,
    });
  }

  // Sorted the way a build is read — processor first, odds and ends last — so
  // the list matches the order the parts are thought about.
  const rows = [...byModel.values()].sort(
    (a, b) =>
      (slotRank.get(a.category) ?? 99) - (slotRank.get(b.category) ?? 99) ||
      a.brand.localeCompare(b.brand, 'fr') ||
      a.model.localeCompare(b.model, 'fr'),
  );

  return {
    rows,
    modelCount: rows.length,
    unitCount: rows.reduce((sum, row) => sum + row.quantity, 0),
    estimatedTotalCents: rows.reduce((sum, row) => sum + row.estimatedTotalCents, 0),
    buildCount: new Set(lines.map((line) => line.buildId)).size,
  };
}

/** How many owned units of each model are free to be engaged right now. */
async function countAvailableStock(componentIds: string[]): Promise<Map<string, number>> {
  if (componentIds.length === 0) return new Map();

  const rows = await db
    .select({
      componentId: inventoryItems.catalogComponentId,
      count: sql<number>`count(*)::int`,
    })
    .from(inventoryItems)
    .leftJoin(buildItems, eq(buildItems.inventoryItemId, inventoryItems.id))
    .leftJoin(lotItems, eq(lotItems.inventoryItemId, inventoryItems.id))
    .where(
      and(
        inArray(inventoryItems.catalogComponentId, componentIds),
        inArray(inventoryItems.status, AVAILABLE_STATUSES),
        // Already promised to a configuration or to a lot: not free.
        isNull(buildItems.id),
        isNull(lotItems.id),
      ),
    )
    .groupBy(inventoryItems.catalogComponentId);

  return new Map(rows.map((row) => [row.componentId, row.count]));
}

/** Units left to buy across every open configuration, for the tab badge. */
export async function countPartsToBuy(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`coalesce(sum(${buildItems.quantity}), 0)::int` })
    .from(buildItems)
    .innerJoin(builds, eq(builds.id, buildItems.buildId))
    .where(and(isNotNull(buildItems.catalogComponentId), OPEN_BUILD));

  return row?.count ?? 0;
}
