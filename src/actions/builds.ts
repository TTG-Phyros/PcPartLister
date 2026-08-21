'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertSession } from '@/lib/auth/guard';
import { BUILD_STATUSES, type BuildStatus } from '@/lib/builds/types';
import { db } from '@/lib/db';
import { buildItems, builds, catalogComponents, inventoryItems, lotItems } from '@/lib/db/schema';
import { awaitedBlockMessage, requiresUnitsInHand } from '@/lib/inventory/status';
import {
  countAwaited,
  engagedByBuild,
  freedUnit,
  heldUnitIds,
} from '@/lib/inventory/transitions';
import { COMPONENT_CATEGORIES, MULTI_SLOT_CATEGORIES, type ComponentCategory } from '@/lib/specs';
import type { ActionState } from './auth';

const MULTI = new Set<ComponentCategory>(MULTI_SLOT_CATEGORIES);

function priceToCents(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

async function currentStatus(buildId: string): Promise<BuildStatus | null> {
  const [row] = await db
    .select({ status: builds.status })
    .from(builds)
    .where(eq(builds.id, buildId))
    .limit(1);
  return row?.status ?? null;
}

function revalidateBuild(buildId: string) {
  revalidatePath('/configs');
  revalidatePath('/configs/a-acheter');
  revalidatePath(`/configs/${buildId}`);
  revalidatePath('/stock');
  revalidatePath('/ventes');
  revalidatePath('/');
}

/* ─────────────────────────── Build lifecycle ─────────────────────────── */

export async function createBuildAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Donnez un nom à la configuration.' };

  const [created] = await db
    .insert(builds)
    .values({ name: name.slice(0, 120) })
    .returning({ id: builds.id });

  revalidatePath('/configs');
  redirect(`/configs/${created!.id}`);
}

const metaSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(120),
  notes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v ? v : null)),
});

/**
 * Editing the objective is deliberately part of the ordinary meta form: it is a
 * working figure, available at every stage, and it moves neither the status nor
 * the listing. Blanking the field drops the objective.
 */
export async function updateBuildMetaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const parsed = metaSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  // Told apart from an empty field on purpose: `priceToCents` answers NULL for
  // both, and silently wiping an objective over a typo would be a poor trade.
  const rawTarget = String(formData.get('targetPriceEur') ?? '').trim();
  const targetPriceCents = priceToCents(rawTarget);
  if (rawTarget && targetPriceCents === null) {
    return { error: 'Prix objectif invalide : indiquez un montant positif, ou laissez vide.' };
  }

  await db
    .update(builds)
    .set({
      name: parsed.data.name,
      notes: parsed.data.notes,
      consumablesCents: priceToCents(formData.get('consumablesEur')) ?? 0,
      targetPriceCents,
      updatedAt: new Date(),
    })
    .where(eq(builds.id, parsed.data.id));

  revalidateBuild(parsed.data.id);
  return { success: 'Configuration mise à jour.' };
}

export async function setBuildStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '') as BuildStatus;
  if (!id || !BUILD_STATUSES.includes(status)) {
    return { error: 'Statut invalide.' };
  }

  // Assembled, announced, sold: all three claim hardware in hand. A part still
  // on the road, or not collected yet, cannot be dragged along — so the
  // configuration waits instead. Marking it received is one tap away on the
  // unit, or on its batch when a whole parcel is late.
  if (requiresUnitsInHand(status)) {
    const awaited = await countAwaited(db, 'build', id);
    if (awaited > 0) return { error: awaitedBlockMessage(awaited) };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(builds)
      .set({
        status,
        // Stamp the day it went on sale; other transitions leave the date alone,
        // it is only read while the configuration is `en_vente`.
        ...(status === 'en_vente'
          ? { listedAt: sql`coalesce(${builds.listedAt}, current_date)` }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(builds.id, id));

    // Carry the whole configuration's units to the matching stock status.
    const ids = await heldUnitIds(tx, 'build', id);
    if (ids.length > 0) {
      await tx
        .update(inventoryItems)
        .set(engagedByBuild(status))
        .where(inArray(inventoryItems.id, ids));
    }
  });

  revalidateBuild(id);
  return { success: 'Statut mis à jour.' };
}

export async function deleteBuildAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Configuration introuvable.' };

  await db.transaction(async (tx) => {
    // Free the units before the cascade removes the lines that point at them.
    const ids = await heldUnitIds(tx, 'build', id);
    if (ids.length > 0) {
      await tx
        .update(inventoryItems)
        .set(freedUnit())
        .where(inArray(inventoryItems.id, ids));
    }

    await tx.delete(builds).where(eq(builds.id, id));
  });

  revalidatePath('/configs');
  revalidatePath('/stock');
  redirect('/configs');
}

/* ─────────────────────────── Lines ─────────────────────────── */

export async function addBuildItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const buildId = String(formData.get('buildId') ?? '');
  const slot = String(formData.get('slot') ?? '') as ComponentCategory;
  const inventoryItemId = String(formData.get('inventoryItemId') ?? '') || null;
  const catalogComponentId = String(formData.get('catalogComponentId') ?? '') || null;

  if (!buildId || !COMPONENT_CATEGORIES.includes(slot)) return { error: 'Emplacement invalide.' };
  if (!inventoryItemId && !catalogComponentId) return { error: 'Aucun composant sélectionné.' };

  const status = await currentStatus(buildId);
  if (!status) return { error: 'Configuration introuvable.' };
  if (status === 'vendue') {
    return { error: 'Cette configuration est vendue : sa composition ne bouge plus.' };
  }

  // A unit promised to a lot cannot also be promised to a configuration, or the
  // same part would be sold twice.
  if (inventoryItemId) {
    const [inLot] = await db
      .select({ id: lotItems.id })
      .from(lotItems)
      .where(eq(lotItems.inventoryItemId, inventoryItemId))
      .limit(1);
    if (inLot) return { error: 'Cette unité fait partie d’un lot : retirez-la du lot d’abord.' };

    // Symmetric with the status change above: a configuration that says it is
    // assembled or announced cannot take in a part that has not arrived. A
    // draft can — planning around a purchase in progress is the point.
    if (requiresUnitsInHand(status)) {
      const awaited = await countAwaited(db, 'item', inventoryItemId);
      if (awaited > 0) {
        return {
          error:
            'Cette unité n’est pas encore arrivée : marquez-la comme reçue avant de la placer dans une configuration montée ou en vente.',
        };
      }
    }
  }

  try {
    await db.transaction(async (tx) => {
      // Single-part slots replace: free whatever was there first.
      if (!MULTI.has(slot)) {
        const existing = await tx
          .select({ id: buildItems.id, unitId: buildItems.inventoryItemId })
          .from(buildItems)
          .where(and(eq(buildItems.buildId, buildId), eq(buildItems.slot, slot)));

        const unitIds = existing
          .map((row) => row.unitId)
          .filter((value): value is string => value !== null);
        if (unitIds.length > 0) {
          await tx
            .update(inventoryItems)
            .set(freedUnit())
            .where(inArray(inventoryItems.id, unitIds));
        }
        if (existing.length > 0) {
          await tx.delete(buildItems).where(
            inArray(
              buildItems.id,
              existing.map((row) => row.id),
            ),
          );
        }
      }

      let estimatedPriceCents: number | null = null;
      if (catalogComponentId) {
        estimatedPriceCents = priceToCents(formData.get('estimatedPriceEur'));
        if (estimatedPriceCents === null) {
          // Default the estimate to the indicative new price of the model.
          const [component] = await tx
            .select({ msrpCents: catalogComponents.msrpCents })
            .from(catalogComponents)
            .where(eq(catalogComponents.id, catalogComponentId))
            .limit(1);
          estimatedPriceCents = component?.msrpCents ?? null;
        }
      }

      const [{ nextPosition }] = await tx
        .select({ nextPosition: sql<number>`coalesce(max(${buildItems.position}), -1) + 1` })
        .from(buildItems)
        .where(eq(buildItems.buildId, buildId));

      await tx.insert(buildItems).values({
        buildId,
        slot,
        inventoryItemId,
        catalogComponentId,
        estimatedPriceCents,
        position: nextPosition,
      });

      if (inventoryItemId) {
        await tx
          .update(inventoryItems)
          .set(engagedByBuild(status))
          .where(eq(inventoryItems.id, inventoryItemId));
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('build_items_inventory_idx')) {
      return { error: 'Cette unité est déjà utilisée dans une autre configuration.' };
    }
    return { error: `Ajout impossible : ${message}` };
  }

  revalidateBuild(buildId);
  return { success: 'Composant ajouté.' };
}

export async function removeBuildItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const lineId = String(formData.get('lineId') ?? '');
  if (!lineId) return { error: 'Ligne introuvable.' };

  // A sold configuration is history: pulling a part out of it would put back on
  // the shelf something a buyer already went home with.
  const [line] = await db
    .select({ buildStatus: builds.status })
    .from(buildItems)
    .innerJoin(builds, eq(builds.id, buildItems.buildId))
    .where(eq(buildItems.id, lineId))
    .limit(1);
  if (!line) return { error: 'Ligne introuvable.' };
  if (line.buildStatus === 'vendue') {
    return { error: 'Cette configuration est vendue : sa composition ne bouge plus.' };
  }

  const [removed] = await db
    .delete(buildItems)
    .where(eq(buildItems.id, lineId))
    .returning({ buildId: buildItems.buildId, unitId: buildItems.inventoryItemId });
  if (!removed) return { error: 'Ligne introuvable.' };

  if (removed.unitId) {
    await db
      .update(inventoryItems)
      .set(freedUnit())
      .where(eq(inventoryItems.id, removed.unitId));
  }

  revalidateBuild(removed.buildId);
  return { success: 'Composant retiré.' };
}

/**
 * What one line costs the configuration. The same field means two things
 * depending on the line: the estimate of a part still to buy, or the adjusted
 * cost of an owned unit — a part received as a gift, or one whose real price
 * differs from the one recorded in stock. Blanking it goes back to the default:
 * no estimate, or the unit's actual purchase price.
 *
 * The unit's own price is never touched: what it was bought for is history, and
 * the adjustment belongs to this configuration alone.
 */
export async function updateLinePriceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const lineId = String(formData.get('lineId') ?? '');
  if (!lineId) return { error: 'Ligne introuvable.' };

  const [line] = await db
    .select({ unitId: buildItems.inventoryItemId })
    .from(buildItems)
    .where(eq(buildItems.id, lineId))
    .limit(1);
  if (!line) return { error: 'Ligne introuvable.' };

  const priceCents = priceToCents(formData.get('priceEur'));

  const [updated] = await db
    .update(buildItems)
    .set(line.unitId ? { customPriceCents: priceCents } : { estimatedPriceCents: priceCents })
    .where(eq(buildItems.id, lineId))
    .returning({ buildId: buildItems.buildId });
  if (!updated) return { error: 'Ligne introuvable.' };

  revalidateBuild(updated.buildId);
  if (!line.unitId) return { success: 'Estimation mise à jour.' };
  return {
    success: priceCents === null ? 'Prix d’achat rétabli.' : 'Coût réel mis à jour.',
  };
}
