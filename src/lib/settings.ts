import { z } from 'zod';

/**
 * Application settings, stored one row per key in the `settings` table so that
 * a new setting never needs a migration.
 */
export const settingsSchema = z.object({
  /** Margin objective used to suggest a sale price. */
  target_margin_pct: z.number().min(0).max(500).default(25),
  /** A component in stock for longer than this is flagged as dormant. */
  dormant_days: z.number().int().min(1).max(3650).default(90),
  /** Default consumables cost pre-filled on a new build, in cents. */
  default_consumables_cents: z.number().int().min(0).default(500),
  /** Default marketplace commission applied to a sale, in percent. */
  default_platform_fee_pct: z.number().min(0).max(100).default(0),
  /** Currency symbol shown in the UI. */
  currency_symbol: z.string().min(1).max(4).default('€'),
});

export type AppSettings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof AppSettings;

export const DEFAULT_SETTINGS: AppSettings = settingsSchema.parse({});

export const SETTING_LABELS: Record<SettingKey, string> = {
  target_margin_pct: 'Objectif de marge (%)',
  dormant_days: 'Seuil composant dormant (jours)',
  default_consumables_cents: 'Consommables par défaut (centimes)',
  default_platform_fee_pct: 'Commission plateforme par défaut (%)',
  currency_symbol: 'Symbole monétaire',
};
