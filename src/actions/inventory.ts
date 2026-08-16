'use server';

import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertSession } from '@/lib/auth/guard';
import { engagedUnit } from '@/lib/builds/engagement';
import { db } from '@/lib/db';
import { buildItems, builds, catalogComponents, inventoryItems, lotItems } from '@/lib/db/schema';
import {
  ITEM_CONDITIONS,
  ITEM_STATUSES,
  PURCHASE_PLATFORMS,
} from '@/lib/inventory/labels';
import { SHIPPING_CARRIERS } from '@/lib/inventory/tracking';
import {
  echoValues,
  optionalDay,
  optionalText,
  optionalUrl,
  priceEurToCents,
} from '@/lib/forms/fields';
import { generatePlaceholderImage } from '@/lib/images/ensure';
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
  status: z.enum(ITEM_STATUSES),
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
    status: formData.get('status') ?? 'en_stock',
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
 * Reception date derived from the status: a unit leaves `en_transit` exactly
 * when the parcel lands, and nothing should have to be ticked by hand for that.
 * `coalesce` keeps the first arrival date across later status changes.
 */
function receivedAtFor(status: (typeof ITEM_STATUSES)[number]) {
  if (status === 'en_transit') return null;
  return sql`coalesce(${inventoryItems.receivedAt}, current_date)`;
}

/**
 * Listing date, same idea in the other direction: a unit switched to `en_vente`
 * by hand is listed today, and leaving that status closes the listing.
 */
function listedAtFor(status: (typeof ITEM_STATUSES)[number]) {
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

  const { unitId, buildId } = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(inventoryItems)
      .values({
        catalogComponentId: componentId,
        ...unit,
        // A unit entered as already in stock was received the day it was bought.
        receivedAt: unit.status === 'en_transit' ? null : unit.purchaseDate,
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
      .set({ ...engagedUnit(line.buildStatus), updatedAt: new Date() })
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

  const updated = await db
    .update(inventoryItems)
    .set({
      ...parsed.unit,
      receivedAt: receivedAtFor(parsed.unit.status),
      listedAt: listedAtFor(parsed.unit.status),
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

/** One-tap status change from the list. */
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
      receivedAt: receivedAtFor(parsed.data.status),
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
