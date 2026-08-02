'use server';

import { and, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertAdmin } from '@/lib/auth/guard';
import { hashPassword, passwordSchema } from '@/lib/auth/password';
import { destroyAllUserSessions } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import type { ActionState } from './auth';

const ADMIN_PATH = '/admin/utilisateurs';

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse email invalide'),
  password: passwordSchema,
  role: z.enum(['admin', 'user']),
});

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertAdmin();

  const parsed = createUserSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide' };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${parsed.data.email}`)
    .limit(1);
  if (existing) return { error: 'Un compte utilise déjà cette adresse.' };

  await db.insert(users).values({
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
    role: parsed.data.role,
    // The admin knows the password, so the account owner must replace it.
    mustChangePassword: true,
  });

  revalidatePath(ADMIN_PATH);
  return { success: `Compte ${parsed.data.email} créé.` };
}

export async function deleteUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user: admin } = await assertAdmin();
  const targetId = String(formData.get('userId') ?? '');
  if (!targetId) return { error: 'Utilisateur introuvable.' };
  if (targetId === admin.id) return { error: 'Vous ne pouvez pas supprimer votre propre compte.' };

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, 'admin'), ne(users.id, targetId)));
  if (count === 0) return { error: 'Il doit rester au moins un administrateur.' };

  // Sessions cascade on delete, but be explicit about the intent.
  await destroyAllUserSessions(targetId);
  await db.delete(users).where(eq(users.id, targetId));

  revalidatePath(ADMIN_PATH);
  return { success: 'Compte supprimé.' };
}

const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: passwordSchema,
});

export async function resetUserPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertAdmin();

  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get('userId'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide' };
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, parsed.data.userId));

  await destroyAllUserSessions(parsed.data.userId);

  revalidatePath(ADMIN_PATH);
  return { success: 'Mot de passe réinitialisé. Le compte devra le changer à la connexion.' };
}
