'use server';

import { eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertSession } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { buildItems, inventoryItems, lotItems, lots } from '@/lib/db/schema';
import { requiresUnitsInHand } from '@/lib/inventory/status';
import { countAwaited, engagedByLot, freedUnit, heldUnitIds } from '@/lib/inventory/transitions';
import type { LotStatus } from '@/lib/lots/types';
import type { ActionState } from './auth';

function revalidateLot(lotId: string) {
  revalidatePath('/lots');
  revalidatePath(`/lots/${lotId}`);
  revalidatePath('/ventes');
  revalidatePath('/stock');
  revalidatePath('/');
}

async function currentStatus(lotId: string): Promise<LotStatus | null> {
  const [row] = await db
    .select({ status: lots.status })
    .from(lots)
    .where(eq(lots.id, lotId))
    .limit(1);
  return row?.status ?? null;
}

/* ─────────────────────────── Lifecycle ─────────────────────────── */

export async function createLotAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Donnez un nom au lot.' };

  const [created] = await db
    .insert(lots)
    .values({ name: name.slice(0, 120) })
    .returning({ id: lots.id });

  revalidatePath('/ventes');
  redirect(`/lots/${created!.id}`);
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

export async function updateLotMetaAction(
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

  await db
    .update(lots)
    .set({ name: parsed.data.name, notes: parsed.data.notes, updatedAt: new Date() })
    .where(eq(lots.id, parsed.data.id));

  revalidateLot(parsed.data.id);
  return { success: 'Lot mis à jour.' };
}

export async function deleteLotAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Lot introuvable.' };

  await db.transaction(async (tx) => {
    // Free the units before the cascade removes the lines pointing at them.
    const ids = await heldUnitIds(tx, 'lot', id);
    if (ids.length > 0) {
      await tx
        .update(inventoryItems)
        .set(freedUnit())
        .where(inArray(inventoryItems.id, ids));
    }

    await tx.delete(lots).where(eq(lots.id, id));
  });

  revalidatePath('/ventes');
  revalidatePath('/stock');
  revalidatePath('/');
  redirect('/ventes');
}

/* ─────────────────────────── Members ─────────────────────────── */

export async function addLotItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const lotId = String(formData.get('lotId') ?? '');
  const inventoryItemId = String(formData.get('inventoryItemId') ?? '');
  if (!lotId || !inventoryItemId) return { error: 'Unité introuvable.' };

  const status = await currentStatus(lotId);
  if (!status) return { error: 'Lot introuvable.' };
  if (status === 'vendu') return { error: 'Ce lot est vendu : il ne bouge plus.' };

  // An announced lot claims hardware in hand; a lot being gathered may well
  // wait on a purchase, exactly like a draft configuration.
  if (requiresUnitsInHand(status)) {
    const awaited = await countAwaited(db, 'item', inventoryItemId);
    if (awaited > 0) {
      return {
        error:
          'Cette unité n’est pas encore arrivée : marquez-la comme reçue avant de l’ajouter à un lot en vente.',
      };
    }
  }

  // A unit engaged in a configuration is promised there; letting it join a lot
  // would sell the same part twice.
  const [engaged] = await db
    .select({ id: buildItems.id })
    .from(buildItems)
    .where(eq(buildItems.inventoryItemId, inventoryItemId))
    .limit(1);
  if (engaged) {
    return { error: 'Cette unité est utilisée dans une configuration : retirez-la d’abord.' };
  }

  try {
    await db.transaction(async (tx) => {
      const [{ nextPosition }] = await tx
        .select({ nextPosition: sql<number>`coalesce(max(${lotItems.position}), -1) + 1` })
        .from(lotItems)
        .where(eq(lotItems.lotId, lotId));

      await tx.insert(lotItems).values({ lotId, inventoryItemId, position: nextPosition });

      await tx
        .update(inventoryItems)
        .set(engagedByLot(status))
        .where(eq(inventoryItems.id, inventoryItemId));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('lot_items_inventory_idx')) {
      return { error: 'Cette unité fait déjà partie d’un lot.' };
    }
    return { error: `Ajout impossible : ${message}` };
  }

  revalidateLot(lotId);
  return { success: 'Unité ajoutée au lot.' };
}

export async function removeLotItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSession();

  const lineId = String(formData.get('lineId') ?? '');
  if (!lineId) return { error: 'Ligne introuvable.' };

  // A sold lot is history: taking a unit back out of it would put on the shelf
  // something the buyer already went home with.
  const [line] = await db
    .select({ lotStatus: lots.status })
    .from(lotItems)
    .innerJoin(lots, eq(lots.id, lotItems.lotId))
    .where(eq(lotItems.id, lineId))
    .limit(1);
  if (!line) return { error: 'Ligne introuvable.' };
  if (line.lotStatus === 'vendu') return { error: 'Ce lot est vendu : il ne bouge plus.' };

  const [removed] = await db
    .delete(lotItems)
    .where(eq(lotItems.id, lineId))
    .returning({ lotId: lotItems.lotId, unitId: lotItems.inventoryItemId });
  if (!removed) return { error: 'Ligne introuvable.' };

  await db
    .update(inventoryItems)
    .set(freedUnit())
    .where(eq(inventoryItems.id, removed.unitId));

  revalidateLot(removed.lotId);
  return { success: 'Unité retirée du lot.' };
}
