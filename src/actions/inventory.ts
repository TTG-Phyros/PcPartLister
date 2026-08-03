'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertSession } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { buildItems, catalogComponents, inventoryItems } from '@/lib/db/schema';
import {
  ITEM_CONDITIONS,
  ITEM_STATUSES,
  PURCHASE_PLATFORMS,
} from '@/lib/inventory/labels';
import { generatePlaceholderImage } from '@/lib/images/ensure';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';
import { specsFromFormData } from '@/lib/specs/fields';
import type { ActionState } from './auth';

/** Every text field of the form, so a rejected submission can be re-rendered. */
function echoValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    const existing = values[key];
    if (existing === undefined) values[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else values[key] = [existing, value];
  }
  return values;
}

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null));

const unitSchema = z.object({
  // Accepts "129,90" as well as "129.90": a phone keypad often produces a comma.
  purchasePriceEur: z
    .string()
    .trim()
    .min(1, 'Le prix d’achat est obligatoire')
    .transform((v) => v.replace(',', '.'))
    .pipe(z.coerce.number().nonnegative('Le prix d’achat ne peut pas être négatif'))
    .transform((v) => Math.round(v * 100)),
  purchaseDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date d’achat invalide'),
  platform: z.enum(PURCHASE_PLATFORMS),
  condition: z.enum(ITEM_CONDITIONS),
  status: z.enum(ITEM_STATUSES),
  listingUrl: z
    .union([z.string().trim().url('Lien de l’annonce invalide'), z.literal('')])
    .optional()
    .transform((v) => (v ? v : null)),
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
    .select({ id: catalogComponents.id })
    .from(catalogComponents)
    .where(eq(catalogComponents.id, componentId))
    .limit(1);
  if (!component) {
    return { error: 'Modèle du catalogue introuvable.', values: echoValues(formData) };
  }

  const [created] = await db
    .insert(inventoryItems)
    .values({ catalogComponentId: componentId, ...unit })
    .returning({ id: inventoryItems.id });

  revalidatePath('/stock');
  revalidatePath('/');

  // "Save and add another" keeps the phone workflow going at a flea market.
  if (formData.get('again') === '1') redirect('/stock/nouveau?ajoute=1');
  redirect(`/stock/${created!.id}`);
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
    .set({ ...parsed.unit, updatedAt: new Date() })
    .where(eq(inventoryItems.id, id))
    .returning({ id: inventoryItems.id });
  if (updated.length === 0) return { error: 'Unité introuvable.' };

  revalidatePath('/stock');
  revalidatePath(`/stock/${id}`);
  revalidatePath('/');
  return { success: 'Unité mise à jour.' };
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
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(inventoryItems.id, parsed.data.id));

  revalidatePath('/stock');
  revalidatePath(`/stock/${parsed.data.id}`);
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

  // build_items references inventory with ON DELETE RESTRICT; explain rather
  // than let the database raise.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(buildItems)
    .where(eq(buildItems.inventoryItemId, id));
  if (count > 0) {
    return { error: 'Cette unité est utilisée dans une configuration : retirez-la d’abord.' };
  }

  await db.delete(inventoryItems).where(eq(inventoryItems.id, id));

  revalidatePath('/stock');
  revalidatePath('/');
  redirect('/stock');
}
