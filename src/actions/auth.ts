'use server';

import { eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertSession, getClientIp } from '@/lib/auth/guard';
import { fakeVerify, hashPassword, passwordSchema, verifyPassword } from '@/lib/auth/password';
import {
  applyProgressiveDelay,
  checkLoginRateLimit,
  recordLoginAttempt,
} from '@/lib/auth/rate-limit';
import {
  clearSessionCookie,
  createSession,
  destroyOtherUserSessions,
  destroySession,
  readSessionToken,
  setSessionCookie,
} from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export type ActionState = { error?: string; success?: string };

/** Generic on purpose: never reveal whether the email exists. */
const INVALID_CREDENTIALS = 'Email ou mot de passe incorrect.';

const loginSchema = z.object({
  email: z.string().trim().email('Adresse email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

/** Blocks open redirects: only same-origin absolute paths are accepted. */
function safeNextPath(raw: FormDataEntryValue | null): string {
  const value = typeof raw === 'string' ? raw : '';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? INVALID_CREDENTIALS };
  }

  const { email, password } = parsed.data;
  const ip = await getClientIp();

  const verdict = await checkLoginRateLimit(ip);
  if (!verdict.allowed) {
    const minutes = Math.ceil(verdict.retryAfterSeconds / 60);
    return { error: `Trop de tentatives. Réessayez dans ${minutes} minutes.` };
  }
  await applyProgressiveDelay(verdict.delayMs);

  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  if (!user) {
    await fakeVerify();
    await recordLoginAttempt(ip, email, false);
    return { error: INVALID_CREDENTIALS };
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    await recordLoginAttempt(ip, email, false);
    return { error: INVALID_CREDENTIALS };
  }

  await recordLoginAttempt(ip, email, true);

  const userAgent = (await headers()).get('user-agent');
  const token = await createSession(user.id, { ip, userAgent });
  await setSessionCookie(token);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  // redirect() throws a control-flow signal: it must stay outside any try/catch.
  redirect(user.mustChangePassword ? '/premiere-connexion' : safeNextPath(formData.get('next')));
}

export async function logoutAction(): Promise<never> {
  await destroySession(await readSessionToken());
  await clearSessionCookie();
  redirect('/connexion');
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'Le nouveau mot de passe doit être différent de l’actuel',
    path: ['newPassword'],
  });

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, sessionId } = await assertSession();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide' };
  }

  if (!(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
    return { error: 'Mot de passe actuel incorrect.' };
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  // A password change signs every other device out.
  await destroyOtherUserSessions(user.id, sessionId);

  return { success: 'Mot de passe mis à jour. Les autres sessions ont été déconnectées.' };
}

/** Same as above but used on the forced first-login screen, which then redirects. */
export async function firstLoginPasswordAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = await changePasswordAction(prev, formData);
  if (result.error) return result;
  redirect('/');
}
