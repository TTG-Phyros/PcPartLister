import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { summarizeSpecs } from '@/lib/catalog/format';
import { db } from '@/lib/db';
import { buildItems, builds, catalogComponents, inventoryItems } from '@/lib/db/schema';
import { imageUrl } from '@/lib/images/store';
import { AVAILABLE_STATUSES } from '@/lib/inventory/labels';
import { requiresUnitsInHand } from '@/lib/inventory/status';
import type { ComponentCategory } from '@/lib/specs';
import type { BuildDetail, BuildLine, BuildStatus, BuildSummaryRow, Candidate } from './types';

export async function listBuilds(): Promise<BuildSummaryRow[]> {
  const rows = await db
    .select({
      id: builds.id,
      name: builds.name,
      status: builds.status,
      createdAt: builds.createdAt,
      consumablesCents: builds.consumablesCents,
      lineCount: sql<number>`count(${buildItems.id})::int`,
      stockCount: sql<number>`count(${buildItems.inventoryItemId})::int`,
      toBuyCount: sql<number>`count(${buildItems.catalogComponentId})::int`,
      componentsCents: sql<number>`coalesce(sum(
        coalesce(
          ${buildItems.customPriceCents},
          ${inventoryItems.purchasePriceCents},
          ${buildItems.estimatedPriceCents},
          0
        )
      ), 0)::int`,
    })
    .from(builds)
    .leftJoin(buildItems, eq(buildItems.buildId, builds.id))
    .leftJoin(inventoryItems, eq(inventoryItems.id, buildItems.inventoryItemId))
    .groupBy(builds.id)
    .orderBy(desc(builds.createdAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Just the name, to talk about a configuration without loading its lines. */
export async function getBuildName(id: string): Promise<string | null> {
  const [row] = await db
    .select({ name: builds.name })
    .from(builds)
    .where(eq(builds.id, id))
    .limit(1);
  return row?.name ?? null;
}

export async function getBuildDetail(id: string): Promise<BuildDetail | null> {
  const [build] = await db.select().from(builds).where(eq(builds.id, id)).limit(1);
  if (!build) return null;

  // The model is reached either directly (a part to buy) or through the owned
  // unit, hence the coalesce on the join.
  const rows = await db
    .select({
      item: buildItems,
      inventory: inventoryItems,
      component: catalogComponents,
    })
    .from(buildItems)
    .leftJoin(inventoryItems, eq(inventoryItems.id, buildItems.inventoryItemId))
    .innerJoin(
      catalogComponents,
      or(
        eq(catalogComponents.id, buildItems.catalogComponentId),
        eq(catalogComponents.id, inventoryItems.catalogComponentId),
      )!,
    )
    .where(eq(buildItems.buildId, id))
    .orderBy(asc(buildItems.position), asc(buildItems.createdAt));

  const lines: BuildLine[] = rows.map(({ item, inventory, component }) => ({
    id: item.id,
    slot: item.slot,
    source: inventory ? 'stock' : 'a_acheter',
    inventoryItemId: inventory?.id ?? null,
    catalogComponentId: component.id,
    brand: component.brand,
    model: component.model,
    imageUrl: imageUrl(component.imagePath),
    summary: summarizeSpecs(component.specs),
    specs: component.specs,
    priceCents: inventory
      ? (item.customPriceCents ?? inventory.purchasePriceCents)
      : item.estimatedPriceCents,
    originalPriceCents:
      inventory && item.customPriceCents !== null ? inventory.purchasePriceCents : null,
    condition: inventory?.condition ?? null,
    position: item.position,
  }));

  return {
    id: build.id,
    name: build.name,
    status: build.status,
    consumablesCents: build.consumablesCents,
    targetPriceCents: build.targetPriceCents,
    listedAt: build.listedAt,
    askingPriceCents: build.askingPriceCents,
    notes: build.notes,
    createdAt: build.createdAt.toISOString(),
    lines,
  };
}

/**
 * Parts offered for a slot: owned units first, then catalog models to buy.
 * Specs travel with each candidate so the browser can grade compatibility
 * without asking the server again on every change.
 */
export async function candidatesForSlot(
  slot: ComponentCategory,
  options: { q?: string; limit?: number; buildStatus?: BuildStatus } = {},
): Promise<{ stock: Candidate[]; catalog: Candidate[] }> {
  const limit = options.limit ?? 60;
  const pattern = options.q?.trim() ? `%${options.q.trim()}%` : null;

  const textMatch = (): SQL | undefined => {
    if (!pattern) return undefined;
    return or(
      ilike(catalogComponents.brand, pattern),
      ilike(catalogComponents.model, pattern),
      sql`${catalogComponents.specs}->>'chipset' ilike ${pattern}`,
    );
  };

  // A configuration that already claims to be assembled, announced or sold
  // cannot take in a part that has not arrived — the action refuses it, so the
  // picker does not offer it either.
  const inHandOnly =
    options.buildStatus && requiresUnitsInHand(options.buildStatus)
      ? isNotNull(inventoryItems.receivedAt)
      : undefined;

  // Every unit still on hand and free: on the shelf, reserved, assembled or on
  // its way, all of it can go into a configuration. Only what is promised to a
  // buyer stays out, and anything already placed in a build is taken.
  const stockRows = await db
    .select({ item: inventoryItems, component: catalogComponents })
    .from(inventoryItems)
    .innerJoin(catalogComponents, eq(catalogComponents.id, inventoryItems.catalogComponentId))
    .leftJoin(buildItems, eq(buildItems.inventoryItemId, inventoryItems.id))
    .where(
      and(
        eq(catalogComponents.category, slot),
        inArray(inventoryItems.status, AVAILABLE_STATUSES),
        inHandOnly,
        isNull(buildItems.id),
        textMatch(),
      ),
    )
    // Units ready to use first, the ones still travelling last: all usable, not
    // all right away.
    .orderBy(
      sql`case ${inventoryItems.status} when 'en_stock' then 0 when 'en_transit' then 2 else 1 end`,
      asc(catalogComponents.brand),
      asc(catalogComponents.model),
    )
    .limit(limit);

  const catalogRows = await db
    .select()
    .from(catalogComponents)
    .where(and(eq(catalogComponents.category, slot), textMatch()))
    .orderBy(asc(catalogComponents.brand), asc(catalogComponents.model))
    .limit(limit);

  return {
    stock: stockRows.map(({ item, component }) => ({
      key: `inv:${item.id}`,
      source: 'stock' as const,
      inventoryItemId: item.id,
      catalogComponentId: component.id,
      brand: component.brand,
      model: component.model,
      imageUrl: imageUrl(component.imagePath),
      summary: summarizeSpecs(component.specs),
      specs: component.specs,
      priceCents: item.purchasePriceCents,
      condition: item.condition,
      status: item.status,
      purchaseDate: item.purchaseDate,
    })),
    catalog: catalogRows.map((component) => ({
      key: `cat:${component.id}`,
      source: 'catalogue' as const,
      inventoryItemId: null,
      catalogComponentId: component.id,
      brand: component.brand,
      model: component.model,
      imageUrl: imageUrl(component.imagePath),
      summary: summarizeSpecs(component.specs),
      specs: component.specs,
      priceCents: component.msrpCents,
      condition: null,
      status: null,
      purchaseDate: null,
    })),
  };
}
