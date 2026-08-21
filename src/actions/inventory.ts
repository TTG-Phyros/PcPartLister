'use server';

import { and, eq, isNotNull, sql, type SQL } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertSession } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { buildItems, builds, catalogComponents, inventoryItems, lotItems } from '@/lib/db/schema';
import {
  echoValues,
  optionalDay,
  optionalText,
  optionalUrl,
  priceEurToCents,
} from '@/lib/forms/fields';
import {
  ITEM_CONDITIONS,
  ITEM_STATUSES,
  PURCHASE_PLATFORMS,
  type ItemStatus,
} from '@/lib/inventory/labels';
import { generatePlaceholderImage } from '@/lib/images/ensure';
import {
  PURCHASE_HANDOVERS,
  initialReceivedAt,
  initialStatus,
  requiresUnitsInHand,
} from '@/lib/inventory/status';
import { SHIPPING_CARRIERS } from '@/lib/inventory/tracking';
import { arrived, engagedByBuild, pendingArrival } from '@/lib/inventory/transitions';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';
import { specsFromFormData } from '@/lib/specs/fields';
import type { ActionState } from './auth';

const unitSchema = z.object({
  purchasePriceEur: priceEurToCents(
    'Le prix d’achat est obligatoire',
    'Prix d’achat invalide',
  ),
  purchaseDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date d’achat invalide'),
  platform: z.enum(PURCHASE_PLATFORMS),
  condition: z.enum(ITEM_CONDITIONS),
  listingUrl: optionalUrl('Lien de l’annonce invalide'),
  shippingCarrier: z
    .union([z.enum(SHIPPING_CARRIERS), z.literal('')])
    .optional()
    .transform((v) => (v ? v : null)),
  trackingNumber: z
    .string()
    .trim()
    .max(64, 'Numéro de suivi trop long')
    .optional()
    .transform((v) => (v ? v : null)),
  trackingUrl: optionalUrl('Lien de suivi invalide'),
  expectedArrival: optionalDay('Date de livraison prévue invalide'),
  serialNumber: optionalText,
  notes: optionalText,
});

function parseUnit(formData: FormData) {
  const parsed = unitSchema.safeParse({
    purchasePriceEur: formData.get('purchasePriceEur') ?? '',
    purchaseDate: formData.get('purchaseDate') ?? '',
    platform: formData.get('platform') ?? 'autre',
    condition: formData.get('condition') ?? 'bon',
    listingUrl: formData.get('listingUrl') ?? '',
    shippingCarrier: formData.get('shippingCarrier') ?? '',
    trackingNumber: formData.get('trackingNumber') ?? '',
    trackingUrl: formData.get('trackingUrl') ?? '',
    expectedArrival: formData.get('expectedArrival') ?? '',
    serialNumber: formData.get('serialNumber') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]!.message };
  }
  // The form field is in euros, the column is in cents.
  const { purchasePriceEur, ...rest } = parsed.data;
  return { ok: true as const, unit: { ...rest, purchasePriceCents: purchasePriceEur } };
}

/**
 * Reception date implied by a status set by hand. Putting a unit back on the
 * road forgets its arrival; `reserve` leaves the date alone, being the one
 * status that says nothing about where the unit is — set aside at the seller's,
 * or on the shelf and promised to a build; anything else means it is here, and
 * `coalesce` keeps the first arrival across later changes.
 *
 * The ordinary way in is `arrived()`. This is the correction path.
 */
function receivedAtFor(status: ItemStatus): { receivedAt?: SQL | null } {
  if (status === 'en_transit') return { receivedAt: null };
  if (status === 'reserve') return {};
  return { receivedAt: sql`coalesce(${inventoryItems.receivedAt}, current_date)` };
}

/**
 * Listing date, same idea in the other direction: a unit switched to `en_vente`
 * by hand is listed today, and leaving that status closes the listing.
 */
function listedAtFor(status: ItemStatus) {
  if (status !== 'en_vente') return null;
  return sql`coalesce(${inventoryItems.listedAt}, current_date)`;
}

const newModelSchema = z.object({
  category: z.enum(COMPONENT_CATEGORIES),
  brand: z.string().trim().min(1, 'La marque du nouveau modèle est obligatoire').max(80),
  model: z.string().trim().min(1, 'Le modèle est obligatoire').max(160),
  releaseYear: z
    .union([z.coerce.number().int().min(1990).max(2100), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  msrpEur: z
    .union([z.coerce.number().nonnegative(), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : Math.round(v * 100))),
});

/**
 * Creates a unit, optionally creating the catalog model it points at in the
 * same transaction: picking up a part whose model is unknown must stay a single
 * form, not a detour through the catalog.
 */
export async function createInventoryItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const unitParsed = parseUnit(formData);
  if (!unitParsed.ok) return { error: unitParsed.error, values: echoValues(formData) };
  const { unit } = unitParsed;

  const usesNewModel = formData.get('source') === 'new';
  let componentId = String(formData.get('catalogComponentId') ?? '');

  if (usesNewModel) {
    const identity = newModelSchema.safeParse({
      category: formData.get('category'),
      brand: formData.get('brand'),
      model: formData.get('model'),
      releaseYear: formData.get('releaseYear') ?? '',
      msrpEur: formData.get('msrpEur') ?? '',
    });
    if (!identity.success) {
      return { error: identity.error.issues[0]!.message, values: echoValues(formData) };
    }

    const specs = specsFromFormData(identity.data.category as ComponentCategory, (name) => {
      const values = formData.getAll(name);
      if (values.length === 0) return null;
      return values.length === 1 ? String(values[0]) : values.map(String);
    });
    if (!specs.ok) {
      return { error: specs.errors.join(' · '), values: echoValues(formData) };
    }

    const imagePath = await generatePlaceholderImage(
      identity.data.category,
      identity.data.brand,
      identity.data.model,
    );

    try {
      componentId = await db.transaction(async (tx) => {
        // An identical model may already exist: reuse it instead of failing on
        // the natural-key index.
        const [existing] = await tx
          .select({ id: catalogComponents.id })
          .from(catalogComponents)
          .where(
            sql`${catalogComponents.category} = ${identity.data.category}
                and lower(${catalogComponents.brand}) = ${identity.data.brand.toLowerCase()}
                and lower(${catalogComponents.model}) = ${identity.data.model.toLowerCase()}`,
          )
          .limit(1);
        if (existing) return existing.id;

        const [created] = await tx
          .insert(catalogComponents)
          .values({
            category: identity.data.category,
            brand: identity.data.brand,
            model: identity.data.model,
            specs: specs.specs,
            imagePath,
            msrpCents: identity.data.msrpEur,
            releaseYear: identity.data.releaseYear,
          })
          .returning({ id: catalogComponents.id });
        return created!.id;
      });
    } catch (error) {
      return {
        error: `Création du modèle impossible : ${error instanceof Error ? error.message : String(error)}`,
        values: echoValues(formData),
      };
    }
  }

  if (!componentId) {
    return { error: 'Sélectionnez un modèle du catalogue.', values: echoValues(formData) };
  }

  const [component] = await db
    .select({ id: catalogComponents.id, category: catalogComponents.category })
    .from(catalogComponents)
    .where(eq(catalogComponents.id, componentId))
    .limit(1);
  if (!component) {
    return { error: 'Modèle du catalogue introuvable.', values: echoValues(formData) };
  }

  // Bought to fill a named slot of a configuration, from the shopping list.
  const buildLineId = String(formData.get('buildLineId') ?? '');

  // Where the purchase is born: on the road if there is a parcel to follow,
  // otherwise wherever the hand-over says — set aside by default, on the shelf
  // when it was picked up on the spot.
  const handover = z.enum(PURCHASE_HANDOVERS).safeParse(formData.get('handover'));
  const status = initialStatus(unit, handover.success ? handover.data : 'reserve');

  // A configuration that claims to be assembled, announced or sold cannot take
  // in a part that has not arrived. Refused before anything is written, so the
  // form comes back filled rather than the purchase landing half-attached.
  if (buildLineId && status !== 'en_stock') {
    const [line] = await db
      .select({ buildStatus: builds.status })
      .from(buildItems)
      .innerJoin(builds, eq(builds.id, buildItems.buildId))
      .where(eq(buildItems.id, buildLineId))
      .limit(1);
    if (line && requiresUnitsInHand(line.buildStatus)) {
      return {
        error:
          'Cette configuration n’est plus un brouillon : une pièce pas encore arrivée ne peut pas y être rattachée. Enregistrez l’achat depuis le stock, puis placez-la dans la configuration une fois la pièce reçue.',
        values: echoValues(formData),
      };
    }
  }

  const { unitId, buildId } = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(inventoryItems)
      .values({
        catalogComponentId: componentId,
        ...unit,
        status,
        // Only a unit already in hand has a reception date, and it is the day it
        // was bought. The two others are still waiting, each for its own reason.
        receivedAt: initialReceivedAt(status, unit.purchaseDate),
      })
      .returning({ id: inventoryItems.id });
    const newUnitId = created!.id;

    if (!buildLineId) return { unitId: newUnitId, buildId: null };

    // The line may have been filled or dropped while the form was open, and the
    // model may have been switched for one of another category — which would
    // leave the slot holding something it is not typed for. Either way the
    // purchase stands on its own; only the attachment is abandoned.
    const [line] = await tx
      .select({
        id: buildItems.id,
        buildId: buildItems.buildId,
        slot: buildItems.slot,
        buildStatus: builds.status,
      })
      .from(buildItems)
      .innerJoin(builds, eq(builds.id, buildItems.buildId))
      .where(and(eq(buildItems.id, buildLineId), isNotNull(buildItems.catalogComponentId)))
      .limit(1);
    if (!line || line.slot !== component.category) {
      return { unitId: newUnitId, buildId: null };
    }

    // The line stops naming a model to find and starts holding the unit that
    // answers it; the estimate goes with it, the real price now applies.
    await tx
      .update(buildItems)
      .set({ inventoryItemId: newUnitId, catalogComponentId: null, estimatedPriceCents: null })
      .where(eq(buildItems.id, line.id));

    await tx
      .update(inventoryItems)
      .set(engagedByBuild(line.buildStatus))
      .where(eq(inventoryItems.id, newUnitId));

    return { unitId: newUnitId, buildId: line.buildId };
  });

  revalidatePath('/stock');
  revalidatePath('/');

  if (buildId) {
    revalidatePath('/configs');
    revalidatePath('/configs/a-acheter');
    revalidatePath(`/configs/${buildId}`);
    // Back to the errand list, one item shorter.
    redirect(`/configs/a-acheter?achete=${buildId}`);
  }

  // "Save and add another" keeps the phone workflow going at a flea market.
  if (formData.get('again') === '1') redirect('/stock/nouveau?ajoute=1');
  redirect(`/stock/${unitId}`);
}

export async function updateInventoryItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Unité introuvable.' };

  const parsed = parseUnit(formData);
  if (!parsed.ok) return { error: parsed.error, values: echoValues(formData) };

  // Editing keeps the status field: it is the escape hatch for everything the
  // automatic transitions deliberately refuse to do — a part found dead, a
  // parcel that turned out never to have shipped.
  const status = z.enum(ITEM_STATUSES).safeParse(formData.get('status'));
  if (!status.success) return { error: 'Statut invalide.', values: echoValues(formData) };

  const updated = await db
    .update(inventoryItems)
    .set({
      ...parsed.unit,
      status: status.data,
      ...receivedAtFor(status.data),
      listedAt: listedAtFor(status.data),
      updatedAt: new Date(),
    })
    .where(eq(inventoryItems.id, id))
    .returning({ id: inventoryItems.id });
  if (updated.length === 0) return { error: 'Unité introuvable.' };

  revalidatePath('/stock');
  revalidatePath(`/stock/${id}`);
  revalidatePath('/ventes');
  revalidatePath('/');
  return { success: 'Unité mise à jour.' };
}

const changeModelSchema = z.object({
  id: z.string().uuid(),
  catalogComponentId: z.string().uuid('Sélectionnez un modèle du catalogue.'),
});

/**
 * Re-points a unit at another catalog model: a part entered under the wrong
 * reference is corrected here rather than by deleting and re-creating it, which
 * would lose its purchase history.
 */
export async function changeInventoryModelAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const parsed = changeModelSchema.safeParse({
    id: formData.get('id') ?? '',
    catalogComponentId: formData.get('catalogComponentId') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const { id, catalogComponentId } = parsed.data;

  const [item] = await db
    .select({ componentId: inventoryItems.catalogComponentId })
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1);
  if (!item) return { error: 'Unité introuvable.' };
  if (item.componentId === catalogComponentId) {
    return { error: 'C’est déjà le modèle de cette unité.' };
  }

  const [target] = await db
    .select({ category: catalogComponents.category })
    .from(catalogComponents)
    .where(eq(catalogComponents.id, catalogComponentId))
    .limit(1);
  if (!target) return { error: 'Modèle du catalogue introuvable.' };

  // A unit engaged in a configuration occupies a slot typed by its category:
  // switching to another category would leave that slot inconsistent.
  const [engaged] = await db
    .select({ buildId: buildItems.buildId, slot: buildItems.slot })
    .from(buildItems)
    .where(eq(buildItems.inventoryItemId, id))
    .limit(1);
  if (engaged && engaged.slot !== target.category) {
    return {
      error:
        'Cette unité est utilisée dans une configuration : le nouveau modèle doit être de la même catégorie, ou retirez-la de la configuration d’abord.',
    };
  }

  await db
    .update(inventoryItems)
    .set({ catalogComponentId, updatedAt: new Date() })
    .where(eq(inventoryItems.id, id));

  revalidatePath('/stock');
  revalidatePath(`/stock/${id}`);
  revalidatePath('/');
  if (engaged) {
    revalidatePath('/configs');
    revalidatePath(`/configs/${engaged.buildId}`);
  }
  return { success: 'Modèle mis à jour.' };
}

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(ITEM_STATUSES),
});

/**
 * The unit arrived — the parcel landed, or the hand-over happened. The one way
 * out of waiting, and it is always asked for: no configuration, no listing and
 * no sale ends a wait on its own.
 */
export async function markItemReceivedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Unité introuvable.' };

  const received = await db
    .update(inventoryItems)
    .set(arrived())
    .where(and(eq(inventoryItems.id, id), pendingArrival()))
    .returning({ id: inventoryItems.id });

  revalidatePath('/stock');
  revalidatePath(`/stock/${id}`);
  revalidatePath('/');
  if (received.length === 0) return { error: 'Cette unité était déjà arrivée.' };
  return { success: 'Unité reçue : elle est en stock.' };
}

/**
 * One-tap status change from the list, and the edit form's status field. Left
 * deliberately free: it is the hand correction of last resort, the place where
 * a unit is written off or a purchase entered after the fact. The automatic
 * transitions are the ones that must never surprise anyone.
 */
export async function setInventoryStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const parsed = statusSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  });
  if (!parsed.success) return { error: 'Statut invalide.' };

  await db
    .update(inventoryItems)
    .set({
      status: parsed.data.status,
      ...receivedAtFor(parsed.data.status),
      listedAt: listedAtFor(parsed.data.status),
      updatedAt: new Date(),
    })
    .where(eq(inventoryItems.id, parsed.data.id));

  revalidatePath('/stock');
  revalidatePath(`/stock/${parsed.data.id}`);
  revalidatePath('/ventes');
  revalidatePath('/');
  return { success: 'Statut mis à jour.' };
}

export async function deleteInventoryItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Unité introuvable.' };

  // build_items and lot_items reference inventory with ON DELETE RESTRICT;
  // explain rather than let the database raise.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(buildItems)
    .where(eq(buildItems.inventoryItemId, id));
  if (count > 0) {
    return { error: 'Cette unité est utilisée dans une configuration : retirez-la d’abord.' };
  }

  const [{ lotCount }] = await db
    .select({ lotCount: sql<number>`count(*)::int` })
    .from(lotItems)
    .where(eq(lotItems.inventoryItemId, id));
  if (lotCount > 0) {
    return { error: 'Cette unité fait partie d’un lot : retirez-la du lot d’abord.' };
  }

  await db.delete(inventoryItems).where(eq(inventoryItems.id, id));

  revalidatePath('/stock');
  revalidatePath('/');
  redirect('/stock');
}
