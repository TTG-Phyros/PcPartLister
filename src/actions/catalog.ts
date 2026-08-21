'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertSession } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { catalogComponents, inventoryItems } from '@/lib/db/schema';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  deleteImage,
  imageUrl,
  saveImage,
  uploadPath,
} from '@/lib/images/store';
import { generatePlaceholderImage } from '@/lib/images/ensure';
import { summarizeSpecs } from '@/lib/catalog/format';
import { findOrCreateCatalogComponent } from '@/lib/catalog/upsert';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';
import { specsFromFormData } from '@/lib/specs/fields';
import type { CatalogSearchHit } from '@/app/api/catalog/search/route';
import type { ActionState } from './auth';

const identitySchema = z.object({
  category: z.enum(COMPONENT_CATEGORIES),
  brand: z.string().trim().min(1, 'La marque est obligatoire').max(80),
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

/** Reads the identity fields plus the category-specific specs, or reports errors. */
function parseForm(formData: FormData) {
  const identity = identitySchema.safeParse({
    category: formData.get('category'),
    brand: formData.get('brand'),
    model: formData.get('model'),
    releaseYear: formData.get('releaseYear') ?? '',
    msrpEur: formData.get('msrpEur') ?? '',
  });
  if (!identity.success) {
    return { ok: false as const, error: identity.error.issues[0]!.message };
  }

  const specs = specsFromFormData(identity.data.category as ComponentCategory, (name) => {
    const values = formData.getAll(name);
    if (values.length === 0) return null;
    return values.length === 1 ? String(values[0]) : values.map(String);
  });
  if (!specs.ok) return { ok: false as const, error: specs.errors.join(' · ') };

  return { ok: true as const, identity: identity.data, specs: specs.specs };
}

/** Stores an uploaded picture, or returns null when the field was left empty. */
async function storeUpload(
  file: FormDataEntryValue | null,
  category: string,
  brand: string,
  model: string,
): Promise<{ ok: true; path: string | null } | { ok: false; error: string }> {
  if (!(file instanceof File) || file.size === 0) return { ok: true, path: null };

  const extension = ALLOWED_IMAGE_TYPES[file.type];
  if (!extension) {
    return { ok: false, error: 'Format d’image non supporté (PNG, JPEG, WebP, GIF ou SVG).' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: `Image trop lourde (max ${MAX_IMAGE_BYTES / 1024 / 1024} Mo).` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await saveImage(uploadPath(category, brand, model, extension), buffer);
  return { ok: true, path: stored };
}

export async function createCatalogComponentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error, values: echoValues(formData) };
  const { identity, specs } = parsed;

  const [duplicate] = await db
    .select({ id: catalogComponents.id })
    .from(catalogComponents)
    .where(
      sql`${catalogComponents.category} = ${identity.category}
          and lower(${catalogComponents.brand}) = ${identity.brand.toLowerCase()}
          and lower(${catalogComponents.model}) = ${identity.model.toLowerCase()}`,
    )
    .limit(1);
  if (duplicate) {
    return {
      error: 'Ce modèle existe déjà dans le catalogue.',
      values: echoValues(formData),
    };
  }

  const upload = await storeUpload(
    formData.get('image'),
    identity.category,
    identity.brand,
    identity.model,
  );
  if (!upload.ok) return { error: upload.error, values: echoValues(formData) };

  // No upload: generate the same placeholder the seed produces, so a
  // hand-added model looks like a seeded one.
  const imagePath =
    upload.path ??
    (await generatePlaceholderImage(identity.category, identity.brand, identity.model));

  const [created] = await db
    .insert(catalogComponents)
    .values({
      category: identity.category,
      brand: identity.brand,
      model: identity.model,
      specs,
      imagePath,
      msrpCents: identity.msrpEur,
      releaseYear: identity.releaseYear,
    })
    .returning({ id: catalogComponents.id });

  revalidatePath('/catalogue');
  redirect(`/catalogue/${created!.id}`);
}

/**
 * A catalog model resolved to an id, for a caller that has somewhere else to be.
 * `hit` has the exact shape the model picker hands around, so the wizard can
 * show a model it just created the same way it shows one it found.
 */
export type EnsureModelState = ActionState & { hit?: CatalogSearchHit };

/**
 * Creates the model — or finds it, if that exact one is already catalogued —
 * and answers with it instead of navigating.
 *
 * The wizard needs this: a purchase of several parts is written as a batch,
 * which only knows how to point at catalog ids, so a model absent from the
 * catalogue has to become one before the purchase can be saved. Entering the
 * same model twice is therefore harmless by construction, which matters on a
 * phone connection that may have dropped the first answer.
 */
export async function ensureCatalogModelAction(
  _prev: EnsureModelState,
  formData: FormData,
): Promise<EnsureModelState> {
  await assertSession();

  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error, values: echoValues(formData) };
  const { identity, specs } = parsed;

  let component;
  try {
    component = await findOrCreateCatalogComponent({
      category: identity.category,
      brand: identity.brand,
      model: identity.model,
      specs,
      releaseYear: identity.releaseYear,
      // Named in euros on the form, already in cents out of the schema.
      msrpCents: identity.msrpEur,
    });
  } catch (error) {
    return {
      error: `Création du modèle impossible : ${error instanceof Error ? error.message : String(error)}`,
      values: echoValues(formData),
    };
  }

  revalidatePath('/catalogue');

  return {
    success: component.created
      ? 'Modèle ajouté au catalogue.'
      : 'Ce modèle était déjà au catalogue : il est repris tel quel.',
    hit: {
      id: component.id,
      category: identity.category,
      brand: identity.brand,
      model: identity.model,
      summary: summarizeSpecs(specs),
      imageUrl: imageUrl(component.imagePath),
      msrpCents: identity.msrpEur,
      // Only the picker's list shows this, and it never lists a model being
      // created: nothing to count.
      inStock: 0,
    },
  };
}

export async function updateCatalogComponentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Composant introuvable.' };

  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error, values: echoValues(formData) };
  const { identity, specs } = parsed;

  const [current] = await db
    .select({ imagePath: catalogComponents.imagePath })
    .from(catalogComponents)
    .where(eq(catalogComponents.id, id))
    .limit(1);
  if (!current) return { error: 'Composant introuvable.' };

  const upload = await storeUpload(
    formData.get('image'),
    identity.category,
    identity.brand,
    identity.model,
  );
  if (!upload.ok) return { error: upload.error, values: echoValues(formData) };

  await db
    .update(catalogComponents)
    .set({
      category: identity.category,
      brand: identity.brand,
      model: identity.model,
      specs,
      msrpCents: identity.msrpEur,
      releaseYear: identity.releaseYear,
      updatedAt: new Date(),
      ...(upload.path ? { imagePath: upload.path } : {}),
    })
    .where(eq(catalogComponents.id, id));

  // Only drop the old file once the new one is committed.
  if (upload.path && current.imagePath && current.imagePath !== upload.path) {
    await deleteImage(current.imagePath);
  }

  revalidatePath('/catalogue');
  revalidatePath(`/catalogue/${id}`);
  return { success: 'Composant mis à jour.' };
}

export async function deleteCatalogComponentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Composant introuvable.' };

  // The FK is ON DELETE RESTRICT; check first so the user gets a real message.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryItems)
    .where(eq(inventoryItems.catalogComponentId, id));
  if (count > 0) {
    return {
      error: `Impossible de supprimer : ${count} unité(s) de stock référencent ce modèle.`,
    };
  }

  const [removed] = await db
    .delete(catalogComponents)
    .where(eq(catalogComponents.id, id))
    .returning({ imagePath: catalogComponents.imagePath });

  if (removed?.imagePath) await deleteImage(removed.imagePath);

  revalidatePath('/catalogue');
  redirect('/catalogue');
}

/** Removes the picture and falls back to the generic placeholder. */
export async function clearCatalogImageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Composant introuvable.' };

  const [previous] = await db
    .select({ imagePath: catalogComponents.imagePath })
    .from(catalogComponents)
    .where(eq(catalogComponents.id, id))
    .limit(1);
  if (!previous) return { error: 'Composant introuvable.' };

  await db
    .update(catalogComponents)
    .set({ imagePath: null, updatedAt: new Date() })
    .where(eq(catalogComponents.id, id));

  await deleteImage(previous.imagePath);

  revalidatePath('/catalogue');
  revalidatePath(`/catalogue/${id}`);
  return { success: 'Image retirée.' };
}
