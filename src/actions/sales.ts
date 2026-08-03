'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSession } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { buildItems, builds, inventoryItems, sales } from '@/lib/db/schema';
import { PURCHASE_PLATFORMS } from '@/lib/inventory/labels';
import type { ActionState } from './auth';

function centsFrom(raw: FormDataEntryValue | null, fallback = 0): number {
  const value = String(raw ?? '').trim();
  if (!value) return fallback;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : fallback;
}

const saleSchema = z.object({
  buildId: z.string().uuid(),
  saleDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de vente invalide'),
  platform: z.enum(PURCHASE_PLATFORMS),
  buyerNotes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v ? v : null)),
});

/**
 * Records or updates the sale of a configuration, and carries the whole thing
 * to the sold state: the build, and every unit it contains.
 */
export async function recordSaleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const parsed = saleSchema.safeParse({
    buildId: formData.get('buildId'),
    saleDate: formData.get('saleDate'),
    platform: formData.get('platform') ?? 'autre',
    buyerNotes: formData.get('buyerNotes') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const salePriceCents = centsFrom(formData.get('salePriceEur'), -1);
  if (salePriceCents < 0) return { error: 'Le prix de vente est obligatoire.' };

  const values = {
    buildId: parsed.data.buildId,
    salePriceCents,
    saleDate: parsed.data.saleDate,
    platform: parsed.data.platform,
    shippingCostCents: centsFrom(formData.get('shippingCostEur')),
    platformFeeCents: centsFrom(formData.get('platformFeeEur')),
    buyerNotes: parsed.data.buyerNotes,
  };

  await db.transaction(async (tx) => {
    // One sale per configuration, hence the upsert on the unique build index.
    await tx
      .insert(sales)
      .values(values)
      .onConflictDoUpdate({ target: sales.buildId, set: values });

    await tx
      .update(builds)
      .set({ status: 'vendue', updatedAt: new Date() })
      .where(eq(builds.id, parsed.data.buildId));

    const units = await tx
      .select({ id: buildItems.inventoryItemId })
      .from(buildItems)
      .where(
        and(
          eq(buildItems.buildId, parsed.data.buildId),
          sql`${buildItems.inventoryItemId} is not null`,
        ),
      );
    const ids = units.map((u) => u.id).filter((value): value is string => value !== null);
    if (ids.length > 0) {
      await tx
        .update(inventoryItems)
        .set({ status: 'vendu', updatedAt: new Date() })
        .where(inArray(inventoryItems.id, ids));
    }
  });

  revalidatePath('/ventes');
  revalidatePath('/configs');
  revalidatePath(`/configs/${parsed.data.buildId}`);
  revalidatePath('/stock');
  revalidatePath('/');
  return { success: 'Vente enregistrée.' };
}

/** Cancels a sale: the configuration goes back to built and its units with it. */
export async function deleteSaleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const buildId = String(formData.get('buildId') ?? '');
  if (!buildId) return { error: 'Configuration introuvable.' };

  await db.transaction(async (tx) => {
    await tx.delete(sales).where(eq(sales.buildId, buildId));
    await tx
      .update(builds)
      .set({ status: 'montee', updatedAt: new Date() })
      .where(eq(builds.id, buildId));

    const units = await tx
      .select({ id: buildItems.inventoryItemId })
      .from(buildItems)
      .where(and(eq(buildItems.buildId, buildId), sql`${buildItems.inventoryItemId} is not null`));
    const ids = units.map((u) => u.id).filter((value): value is string => value !== null);
    if (ids.length > 0) {
      await tx
        .update(inventoryItems)
        .set({ status: 'monte', updatedAt: new Date() })
        .where(inArray(inventoryItems.id, ids));
    }
  });

  revalidatePath('/ventes');
  revalidatePath('/configs');
  revalidatePath(`/configs/${buildId}`);
  revalidatePath('/stock');
  revalidatePath('/');
  return { success: 'Vente annulée : la configuration repasse en « montée ».' };
}
