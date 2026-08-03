import { z } from 'zod';
import { ITEM_CONDITIONS, ITEM_STATUSES, PURCHASE_PLATFORMS } from '@/lib/inventory/labels';
import { SHIPPING_CARRIERS } from '@/lib/inventory/tracking';

/**
 * Shape of data/seed/stock.json: the physical units already owned, so a fresh
 * database (a rebuilt volume, a new server) comes back with the real stock and
 * not just the catalog.
 *
 * One entry = one physical unit, exactly like a row of the stock table. A lot
 * bought together is written as several entries with the price split, because
 * each unit then lives its own life (reserved, mounted, sold, dead).
 *
 * Prices are in euros here and cents in the database, and the catalog model is
 * referenced by its seed key rather than by a UUID nobody can type by hand.
 */

const day = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

const seedUnitSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'key must be lowercase kebab-case'),
  catalogKey: z.string().trim().min(1),
  purchasePriceEur: z.number().nonnegative(),
  purchaseDate: day,
  platform: z.enum(PURCHASE_PLATFORMS).default('autre'),
  condition: z.enum(ITEM_CONDITIONS).default('bon'),
  status: z.enum(ITEM_STATUSES).default('en_stock'),
  listingUrl: z.string().url().optional(),
  carrier: z.enum(SHIPPING_CARRIERS).optional(),
  trackingNumber: z.string().trim().max(64).optional(),
  trackingUrl: z.string().url().optional(),
  expectedArrival: day.optional(),
  /** Defaults to the purchase date, except while the parcel is still travelling. */
  receivedAt: day.optional(),
  serialNumber: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const stockSeedFileSchema = z.object({
  note: z.string().optional(),
  units: z.array(seedUnitSchema).min(1),
});

export type SeedUnit = z.infer<typeof seedUnitSchema>;

export type StockSeedParseResult = {
  units: SeedUnit[];
  errors: string[];
};

/**
 * Validates the file and drops the entries that cannot be inserted, reporting
 * each one: a single bad hand-edit must not cost the whole stock.
 */
export function parseStockSeedFile(raw: unknown): StockSeedParseResult {
  const file = stockSeedFileSchema.safeParse(raw);
  if (!file.success) {
    return {
      units: [],
      errors: file.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }

  const units: SeedUnit[] = [];
  const errors: string[] = [];
  const seenKeys = new Set<string>();

  for (const unit of file.data.units) {
    if (seenKeys.has(unit.key)) {
      errors.push(`${unit.key}: duplicate key, ignored`);
      continue;
    }
    seenKeys.add(unit.key);

    // A parcel that is still travelling is the only case where nothing has been
    // received: any other status means the unit is physically here.
    if (unit.status === 'en_transit' && unit.receivedAt) {
      errors.push(`${unit.key}: receivedAt makes no sense while en_transit, ignored`);
      continue;
    }

    units.push(unit);
  }

  return { units, errors };
}

/** Reception date implied by the status when the file does not spell it out. */
export function receivedAtFor(unit: SeedUnit): string | null {
  if (unit.status === 'en_transit') return null;
  return unit.receivedAt ?? unit.purchaseDate;
}
