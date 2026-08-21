'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertSession } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { catalogComponents, inventoryItems, purchaseBatches } from '@/lib/db/schema';
import {
  echoValues,
  optionalDay,
  optionalText,
  optionalUrl,
  priceEurToCents,
} from '@/lib/forms/fields';
import { ITEM_CONDITIONS, PLATFORM_LABELS, PURCHASE_PLATFORMS } from '@/lib/inventory/labels';
import { splitEvenly } from '@/lib/inventory/split';
import {
  PURCHASE_HANDOVERS,
  initialReceivedAt,
  initialStatus,
} from '@/lib/inventory/status';
import { SHIPPING_CARRIERS } from '@/lib/inventory/tracking';
import { arrived, pendingArrival } from '@/lib/inventory/transitions';
import type { ActionState } from './auth';

/** Guard against a slip of the quantity field turning into a mass insert. */
const MAX_UNITS_PER_BATCH = 100;

function revalidateBatch(batchId: string) {
  revalidatePath(`/arrivages/${batchId}`);
  // The stock list and the dashboard fold the batch into a collapsible row.
  revalidatePath('/stock');
  // Every unit of the batch has its own page showing the parcel.
  revalidatePath('/stock/[id]', 'page');
  revalidatePath('/');
}

/* ─────────────────────────── Shared fields ─────────────────────────── */

const trackingFields = {
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
};

const batchSchema = z.object({
  label: z
    .string()
    .trim()
    .max(120, 'Libellé trop long')
    .optional()
    .transform((v) => (v ? v : null)),
  totalPriceEur: priceEurToCents(
    'Le prix total du lot est obligatoire',
    'Prix total invalide',
  ),
  purchaseDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date d’achat invalide'),
  platform: z.enum(PURCHASE_PLATFORMS),
  condition: z.enum(ITEM_CONDITIONS),
  listingUrl: optionalUrl('Lien de l’annonce invalide'),
  ...trackingFields,
  notes: optionalText,
});

/**
 * One line of the form: a catalog model and how many copies of it the parcel
 * held. The client posts each line as its own JSON field, which keeps the model
 * and its quantity together — two parallel arrays would drift apart the moment
 * a line is left empty.
 */
const lineSchema = z.object({
  componentId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(MAX_UNITS_PER_BATCH),
});

function parseLines(formData: FormData) {
  const raw = formData.getAll('line');
  const lines: Array<z.infer<typeof lineSchema>> = [];

  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    let candidate: unknown;
    try {
      candidate = JSON.parse(entry);
    } catch {
      return { ok: false as const, error: 'Ligne de lot illisible.' };
    }
    const parsed = lineSchema.safeParse(candidate);
    if (!parsed.success) return { ok: false as const, error: 'Ligne de lot invalide.' };
    lines.push(parsed.data);
  }

  return { ok: true as const, lines };
}

/** « Arrivage Vinted du 16/08/2026 » when the field is left empty. */
function fallbackLabel(platform: (typeof PURCHASE_PLATFORMS)[number], isoDay: string): string {
  const [year, month, day] = isoDay.split('-');
  return `Arrivage ${PLATFORM_LABELS[platform]} du ${day}/${month}/${year}`;
}

/* ─────────────────────────── Creation ─────────────────────────── */

/**
 * Creates a batch and its units in one transaction. Each unit is an ordinary
 * inventory row — same statuses, same traceability as one entered by hand — and
 * carries its share of what the batch cost, so a margin computed later needs to
 * know nothing about batches at all.
 */
export async function createPurchaseBatchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const parsed = batchSchema.safeParse({
    label: formData.get('label') ?? '',
    totalPriceEur: formData.get('totalPriceEur') ?? '',
    purchaseDate: formData.get('purchaseDate') ?? '',
    platform: formData.get('platform') ?? 'autre',
    condition: formData.get('condition') ?? 'bon',
    listingUrl: formData.get('listingUrl') ?? '',
    shippingCarrier: formData.get('shippingCarrier') ?? '',
    trackingNumber: formData.get('trackingNumber') ?? '',
    trackingUrl: formData.get('trackingUrl') ?? '',
    expectedArrival: formData.get('expectedArrival') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]!.message, values: echoValues(formData) };
  }
  const { label, totalPriceEur: totalPriceCents, ...shared } = parsed.data;

  const linesParsed = parseLines(formData);
  if (!linesParsed.ok) return { error: linesParsed.error, values: echoValues(formData) };
  const { lines } = linesParsed;

  if (lines.length === 0) {
    return {
      error: 'Ajoutez au moins une ligne, avec son modèle du catalogue.',
      values: echoValues(formData),
    };
  }

  // Flattened here: from this point on a batch is just a list of units, in the
  // order the lines were typed.
  const componentIds = lines.flatMap((line) =>
    Array.from({ length: line.quantity }, () => line.componentId),
  );

  if (componentIds.length < 2) {
    return {
      error:
        'Une saisie groupée compte au moins deux unités. Pour un achat seul, utilisez « Ajouter un achat ».',
      values: echoValues(formData),
    };
  }
  if (componentIds.length > MAX_UNITS_PER_BATCH) {
    return {
      error: `Un lot est limité à ${MAX_UNITS_PER_BATCH} unités (${componentIds.length} demandées).`,
      values: echoValues(formData),
    };
  }

  // One round trip for the whole selection: an id that no longer matches a
  // model must not become an insert that the foreign key rejects.
  const distinctIds = [...new Set(componentIds)];
  const known = await db
    .select({ id: catalogComponents.id })
    .from(catalogComponents)
    .where(inArray(catalogComponents.id, distinctIds));
  if (known.length !== distinctIds.length) {
    return {
      error: 'Un des modèles choisis est introuvable au catalogue.',
      values: echoValues(formData),
    };
  }

  const shares = splitEvenly(totalPriceCents, componentIds.length);

  // One purchase for the whole batch, so one status for all its units: the
  // parcel decides it, or the hand-over does, exactly as for a purchase entered
  // on its own.
  const handover = z.enum(PURCHASE_HANDOVERS).safeParse(formData.get('handover'));
  const status = initialStatus(shared, handover.success ? handover.data : 'reserve');

  let batchId: string;
  try {
    batchId = await db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(purchaseBatches)
        .values({
          label: label ?? fallbackLabel(shared.platform, shared.purchaseDate),
          totalPriceCents,
          purchaseDate: shared.purchaseDate,
          platform: shared.platform,
          listingUrl: shared.listingUrl,
          shippingCarrier: shared.shippingCarrier,
          trackingNumber: shared.trackingNumber,
          trackingUrl: shared.trackingUrl,
          expectedArrival: shared.expectedArrival,
          notes: shared.notes,
        })
        .returning({ id: purchaseBatches.id });

      await tx.insert(inventoryItems).values(
        componentIds.map((catalogComponentId, index) => ({
          catalogComponentId,
          purchaseBatchId: batch!.id,
          purchasePriceCents: shares[index]!,
          purchaseDate: shared.purchaseDate,
          platform: shared.platform,
          listingUrl: shared.listingUrl,
          condition: shared.condition,
          status,
          // The parcel is one and the same for every unit: copied onto each row
          // so the stock list, the dashboard and the « colis en cours » filter
          // keep working on units alone, with no idea batches exist.
          shippingCarrier: shared.shippingCarrier,
          trackingNumber: shared.trackingNumber,
          trackingUrl: shared.trackingUrl,
          expectedArrival: shared.expectedArrival,
          // Only a batch already in hand has a reception date.
          receivedAt: initialReceivedAt(status, shared.purchaseDate),
          notes: shared.notes,
        })),
      );

      return batch!.id;
    });
  } catch (error) {
    return {
      error: `Création du lot impossible : ${error instanceof Error ? error.message : String(error)}`,
      values: echoValues(formData),
    };
  }

  revalidateBatch(batchId);
  // Same as for a single unit: the wizard closes on the stock list, with the
  // arrival named there rather than opened in its own page.
  if (formData.get('apres') === 'stock') redirect(`/stock?arrivage=${batchId}`);
  redirect(`/arrivages/${batchId}`);
}

/* ─────────────────────────── Edition ─────────────────────────── */

const updateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1, 'Le libellé est obligatoire').max(120),
  listingUrl: optionalUrl('Lien de l’annonce invalide'),
  ...trackingFields,
  notes: optionalText,
});

/**
 * Edits what the batch shares. The parcel is entered once and lives here, so
 * saving pushes it back onto every unit — correcting a tracking number in one
 * place is the point of the batch existing.
 *
 * The total is deliberately absent: it was split at creation, and re-splitting
 * would silently rewrite the purchase price of units that may already be sold.
 */
export async function updatePurchaseBatchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const parsed = updateSchema.safeParse({
    id: formData.get('id') ?? '',
    label: formData.get('label') ?? '',
    listingUrl: formData.get('listingUrl') ?? '',
    shippingCarrier: formData.get('shippingCarrier') ?? '',
    trackingNumber: formData.get('trackingNumber') ?? '',
    trackingUrl: formData.get('trackingUrl') ?? '',
    expectedArrival: formData.get('expectedArrival') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]!.message, values: echoValues(formData) };
  }
  const { id, label, listingUrl, notes, ...tracking } = parsed.data;

  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(purchaseBatches)
      .set({ label, listingUrl, notes, ...tracking, updatedAt: new Date() })
      .where(eq(purchaseBatches.id, id))
      .returning({ id: purchaseBatches.id });
    if (rows.length === 0) return false;

    await tx
      .update(inventoryItems)
      .set({ ...tracking, updatedAt: new Date() })
      .where(eq(inventoryItems.purchaseBatchId, id));

    return true;
  });
  if (!updated) return { error: 'Lot introuvable.' };

  revalidateBatch(id);
  return { success: 'Lot mis à jour, suivi reporté sur ses unités.' };
}

/**
 * One purchase, one arrival: the whole batch lands at once, so it takes one tap
 * rather than one per unit. Units already received keep their own date.
 */
export async function markBatchReceivedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Lot introuvable.' };

  const received = await db
    .update(inventoryItems)
    .set(arrived())
    .where(and(eq(inventoryItems.purchaseBatchId, id), pendingArrival()))
    .returning({ id: inventoryItems.id });

  revalidateBatch(id);
  if (received.length === 0) return { success: 'Toutes les unités étaient déjà arrivées.' };
  return {
    success: `${received.length} unité${received.length > 1 ? 's' : ''} passée${received.length > 1 ? 's' : ''} en stock.`,
  };
}

/**
 * Dissolves the grouping. The units stay in stock, untouched, with the share of
 * the price they were given — only the link back to the parcel is lost, which
 * the foreign key does on its own with `on delete set null`.
 */
export async function deletePurchaseBatchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Lot introuvable.' };

  await db.delete(purchaseBatches).where(eq(purchaseBatches.id, id));

  revalidateBatch(id);
  redirect('/stock');
}
