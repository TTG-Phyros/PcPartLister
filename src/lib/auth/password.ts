import { hash, verify, type Algorithm } from '@node-rs/argon2';
import { z } from 'zod';

/**
 * `Algorithm` is an ambient const enum, which isolatedModules forbids reading,
 * so its value is inlined here: Algorithm.Argon2id === 2.
 */
const ARGON2ID = 2 as Algorithm;

/**
 * Argon2id parameters follow the OWASP Password Storage Cheat Sheet
 * recommendation: 19 MiB of memory, 2 iterations, 1 lane.
 */
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const passwordSchema = z
  .string()
  .min(10, 'Le mot de passe doit faire au moins 10 caractères')
  .max(256, 'Le mot de passe ne peut pas dépasser 256 caractères');

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, ARGON2_OPTIONS);
  } catch {
    // Malformed digest in database: treat as a failed login, never as a crash.
    return false;
  }
}

let dummyDigest: Promise<string> | null = null;

/**
 * Burns a comparable amount of CPU when the email does not exist, so response
 * time cannot be used to enumerate accounts.
 */
export async function fakeVerify(): Promise<void> {
  dummyDigest ??= hashPassword('this-account-does-not-exist');
  await verifyPassword(await dummyDigest, 'wrong-password');
}
