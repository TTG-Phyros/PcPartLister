/**
 * Field parsers shared by the inventory forms. They live here rather than next
 * to an action because a `'use server'` module may only export async functions.
 */

import { z } from 'zod';

/** Every text field of a form, so a rejected submission can be re-rendered. */
export function echoValues(formData: FormData): Record<string, string | string[]> {
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

export const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null));

export const optionalUrl = (message: string) =>
  z
    .union([z.string().trim().url(message), z.literal('')])
    .optional()
    .transform((v) => (v ? v : null));

export const optionalDay = (message: string) =>
  z
    .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, message), z.literal('')])
    .optional()
    .transform((v) => (v ? v : null));

/**
 * A price typed in euros, stored in cents. Accepts "129,90" as well as
 * "129.90": a phone keypad often produces a comma.
 */
export const priceEurToCents = (requiredMessage: string, invalidMessage: string) =>
  z
    .string()
    .trim()
    .min(1, requiredMessage)
    .transform((v) => v.replace(',', '.'))
    .pipe(z.coerce.number({ invalid_type_error: invalidMessage }).nonnegative(invalidMessage))
    .transform((v) => Math.round(v * 100));
