'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSession } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { buildItems, builds, inventoryItems, lotItems, lots, sales } from '@/lib/db/schema';
import { PURCHASE_PLATFORMS } from '@/lib/inventory/labels';
import { awaitedBlockMessage } from '@/lib/inventory/status';
import { countAwaited, heldUnitIds, movedTo } from '@/lib/inventory/transitions';
import { SALE_SHIPPING_METHODS, type SaleSubjectKind } from '@/lib/sales/labels';
import type { ActionState } from './auth';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function centsFrom(raw: FormDataEntryValue | null, fallback = 0): number {
  const value = String(raw ?? '').trim();
  if (!value) return fallback;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : fallback;
}

/** Optional price: an empty field means « je n’ai pas encore fixé le prix ». */
function optionalCents(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

const subjectSchema = z.object({
  kind: z.enum(['build', 'lot', 'item']),
  id: z.string().uuid(),
});

function readSubject(formData: FormData) {
  return subjectSchema.safeParse({
    kind: formData.get('subjectKind'),
    id: formData.get('subjectId'),
  });
}

function revalidateSubject(kind: SaleSubjectKind, id: string) {
  revalidatePath('/ventes');
  revalidatePath('/stock');
  revalidatePath('/');
  if (kind === 'build') {
    revalidatePath('/configs');
    revalidatePath(`/configs/${id}`);
  } else if (kind === 'lot') {
    revalidatePath(`/lots/${id}`);
  } else {
    revalidatePath(`/stock/${id}`);
  }
}

/** Status of the members that matches a subject on sale, sold, or back home. */
const MEMBER_STATUS = { listed: 'en_vente', sold: 'vendu', idle: 'monte' } as const;

/**
 * Carries the units a subject holds along with it. A lone unit is its own
 * subject: it is updated once, by the subject update itself, and there is
 * nothing to carry.
 */
async function setMemberStatus(
  tx: Tx,
  kind: SaleSubjectKind,
  id: string,
  phase: keyof typeof MEMBER_STATUS,
) {
  const ids = await heldUnitIds(tx, kind, id);
  if (ids.length === 0) return;
  // A lot is not assembled hardware: its units go back to being set aside,
  // while a configuration's units stay mounted in it.
  const status = phase === 'idle' && kind === 'lot' ? 'reserve' : MEMBER_STATUS[phase];

  await tx
    .update(inventoryItems)
    .set(movedTo(status))
    .where(inArray(inventoryItems.id, ids));
}

/* ─────────────────────────── Mise en vente ─────────────────────────── */

/**
 * Puts a configuration, a lot or a single unit up for sale: it stays owned, but
 * it is announced somewhere and no longer available for anything else.
 */
export async function listForSaleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const parsed = readSubject(formData);
  if (!parsed.success) return { error: 'Élément introuvable.' };
  const { kind, id } = parsed.data;
  const askingPriceCents = optionalCents(formData.get('askingPriceEur'));

  const guard = await guardListable(kind, id);
  if ('error' in guard) return guard.error;

  await db.transaction(async (tx) => {
    const listing = {
      askingPriceCents,
      // Re-pricing something already announced must not rejuvenate it: the
      // « en vente depuis » counter keeps its original day.
      listedAt: sql`coalesce(listed_at, current_date)`,
      updatedAt: new Date(),
    };

    if (kind === 'build') {
      await tx
        .update(builds)
        .set({ status: 'en_vente', ...listing })
        .where(eq(builds.id, id));
    } else if (kind === 'lot') {
      await tx
        .update(lots)
        .set({ status: 'en_vente', ...listing })
        .where(eq(lots.id, id));
    } else {
      await tx
        .update(inventoryItems)
        .set({ ...movedTo('en_vente'), askingPriceCents })
        .where(eq(inventoryItems.id, id));
    }

    await setMemberStatus(tx, kind, id, 'listed');
  });

  revalidateSubject(kind, id);
  if (guard.alreadyListed) {
    return {
      success:
        askingPriceCents === null
          ? 'Prix retiré : l’annonce est de nouveau à prix libre.'
          : `Prix mis à jour : ${(askingPriceCents / 100).toLocaleString('fr-FR')} €.`,
    };
  }
  return {
    success:
      kind === 'build'
        ? 'Configuration mise en vente.'
        : kind === 'lot'
          ? 'Lot mis en vente.'
          : 'Composant mis en vente.',
  };
}

/**
 * Refuses the listings that would contradict something already decided, and
 * tells whether the subject was already announced — the same form both puts a
 * thing on sale and re-prices it afterwards.
 */
async function guardListable(
  kind: SaleSubjectKind,
  id: string,
): Promise<{ error: ActionState } | { alreadyListed: boolean }> {
  if (kind === 'build') {
    const [build] = await db
      .select({ status: builds.status })
      .from(builds)
      .where(eq(builds.id, id))
      .limit(1);
    if (!build) return { error: { error: 'Configuration introuvable.' } };
    if (build.status === 'vendue') {
      return { error: { error: 'Cette configuration est déjà vendue.' } };
    }
    const awaited = await countAwaited(db, kind, id);
    if (awaited > 0) return { error: { error: awaitedBlockMessage(awaited) } };
    return { alreadyListed: build.status === 'en_vente' };
  }

  if (kind === 'lot') {
    const [lot] = await db
      .select({ status: lots.status })
      .from(lots)
      .where(eq(lots.id, id))
      .limit(1);
    if (!lot) return { error: { error: 'Lot introuvable.' } };
    if (lot.status === 'vendu') return { error: { error: 'Ce lot est déjà vendu.' } };

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lotItems)
      .where(eq(lotItems.lotId, id));
    if (count === 0) {
      return { error: { error: 'Ce lot est vide : ajoutez-y des unités d’abord.' } };
    }
    const awaited = await countAwaited(db, kind, id);
    if (awaited > 0) return { error: { error: awaitedBlockMessage(awaited) } };
    return { alreadyListed: lot.status === 'en_vente' };
  }

  const [item] = await db
    .select({ status: inventoryItems.status })
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1);
  if (!item) return { error: { error: 'Unité introuvable.' } };
  if (item.status === 'vendu') return { error: { error: 'Cette unité est déjà vendue.' } };
  // Announcing something not in hand is announcing what may never turn up in
  // the state expected: the listing waits for the delivery, or for the pickup.
  if (await countAwaited(db, kind, id)) {
    return {
      error: {
        error:
          'Cette unité n’est pas encore arrivée : marquez-la comme reçue avant de la mettre en vente.',
      },
    };
  }

  // A unit engaged elsewhere is sold with what holds it, not on its own:
  // otherwise the two would fight over its status.
  const [inBuild] = await db
    .select({ id: buildItems.id })
    .from(buildItems)
    .where(eq(buildItems.inventoryItemId, id))
    .limit(1);
  if (inBuild) {
    return {
      error: {
        error:
          'Cette unité fait partie d’une configuration : mettez la configuration en vente, ou retirez l’unité d’abord.',
      },
    };
  }

  const [inLot] = await db
    .select({ id: lotItems.id })
    .from(lotItems)
    .where(eq(lotItems.inventoryItemId, id))
    .limit(1);
  if (inLot) {
    return {
      error: {
        error: 'Cette unité fait partie d’un lot : mettez le lot en vente, ou retirez-la d’abord.',
      },
    };
  }

  return { alreadyListed: item.status === 'en_vente' };
}

/** Takes a listing back: nothing was sold, the thing returns to the shelf. */
export async function unlistAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const parsed = readSubject(formData);
  if (!parsed.success) return { error: 'Élément introuvable.' };
  const { kind, id } = parsed.data;

  await db.transaction(async (tx) => {
    if (kind === 'build') {
      await tx
        .update(builds)
        .set({ status: 'montee', listedAt: null, updatedAt: new Date() })
        .where(eq(builds.id, id));
    } else if (kind === 'lot') {
      await tx
        .update(lots)
        .set({ status: 'brouillon', listedAt: null, updatedAt: new Date() })
        .where(eq(lots.id, id));
    } else {
      await tx.update(inventoryItems).set(movedTo('en_stock')).where(eq(inventoryItems.id, id));
    }

    await setMemberStatus(tx, kind, id, 'idle');
  });

  revalidateSubject(kind, id);
  return {
    success:
      kind === 'lot' ? 'Lot retiré de la vente.' : 'Élément retiré de la vente.',
  };
}

/* ─────────────────────────── Conclusion ─────────────────────────── */

const saleSchema = z.object({
  saleDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de vente invalide'),
  platform: z.enum(PURCHASE_PLATFORMS),
  shippingMethod: z.enum(SALE_SHIPPING_METHODS),
  trackingNumber: z
    .string()
    .trim()
    .max(64, 'Numéro de suivi trop long')
    .optional()
    .transform((v) => (v ? v : null)),
  buyerNotes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v ? v : null)),
});

/**
 * Records or updates a concluded sale, and carries its subject to the sold
 * state: the configuration or the lot with every unit it holds, or the lone
 * unit.
 */
export async function recordSaleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const subject = readSubject(formData);
  if (!subject.success) return { error: 'Élément introuvable.' };
  const { kind, id } = subject.data;

  const parsed = saleSchema.safeParse({
    saleDate: formData.get('saleDate'),
    platform: formData.get('platform') ?? 'autre',
    shippingMethod: formData.get('shippingMethod') ?? 'main_propre',
    trackingNumber: formData.get('trackingNumber') ?? '',
    buyerNotes: formData.get('buyerNotes') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const salePriceCents = centsFrom(formData.get('salePriceEur'), -1);
  if (salePriceCents < 0) return { error: 'Le prix de vente est obligatoire.' };

  // Same wall as the listing, one step further: what has not arrived cannot
  // have changed hands. Recording the sale would otherwise carry a unit that is
  // not here straight to `vendu`, parcel and all.
  const awaited = await countAwaited(db, kind, id);
  if (awaited > 0) return { error: awaitedBlockMessage(awaited) };

  const values = {
    buildId: kind === 'build' ? id : null,
    lotId: kind === 'lot' ? id : null,
    inventoryItemId: kind === 'item' ? id : null,
    salePriceCents,
    saleDate: parsed.data.saleDate,
    platform: parsed.data.platform,
    shippingMethod: parsed.data.shippingMethod,
    shippingCostCents: centsFrom(formData.get('shippingCostEur')),
    platformFeeCents: centsFrom(formData.get('platformFeeEur')),
    trackingNumber: parsed.data.trackingNumber,
    buyerNotes: parsed.data.buyerNotes,
  };

  await db.transaction(async (tx) => {
    // One sale per subject, hence the upsert on its unique index.
    await tx
      .insert(sales)
      .values(values)
      .onConflictDoUpdate({
        target:
          kind === 'build' ? sales.buildId : kind === 'lot' ? sales.lotId : sales.inventoryItemId,
        set: values,
      });

    if (kind === 'build') {
      await tx
        .update(builds)
        .set({ status: 'vendue', updatedAt: new Date() })
        .where(eq(builds.id, id));
    } else if (kind === 'lot') {
      await tx.update(lots).set({ status: 'vendu', updatedAt: new Date() }).where(eq(lots.id, id));
    } else {
      await tx.update(inventoryItems).set(movedTo('vendu')).where(eq(inventoryItems.id, id));
    }

    await setMemberStatus(tx, kind, id, 'sold');
  });

  revalidateSubject(kind, id);
  return { success: 'Vente enregistrée.' };
}

/** Cancels a sale: the subject goes back on sale, nothing is lost. */
export async function deleteSaleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const parsed = readSubject(formData);
  if (!parsed.success) return { error: 'Élément introuvable.' };
  const { kind, id } = parsed.data;

  await db.transaction(async (tx) => {
    const relisted = {
      status: 'en_vente' as const,
      updatedAt: new Date(),
    };

    if (kind === 'build') {
      await tx.delete(sales).where(eq(sales.buildId, id));
      await tx
        .update(builds)
        .set({ ...relisted, listedAt: sql`coalesce(${builds.listedAt}, current_date)` })
        .where(eq(builds.id, id));
    } else if (kind === 'lot') {
      await tx.delete(sales).where(eq(sales.lotId, id));
      await tx
        .update(lots)
        .set({ ...relisted, listedAt: sql`coalesce(${lots.listedAt}, current_date)` })
        .where(eq(lots.id, id));
    } else {
      await tx.delete(sales).where(eq(sales.inventoryItemId, id));
      await tx.update(inventoryItems).set(movedTo('en_vente')).where(eq(inventoryItems.id, id));
    }

    await setMemberStatus(tx, kind, id, 'listed');
  });

  revalidateSubject(kind, id);
  return { success: 'Vente annulée : l’élément repasse en vente.' };
}
