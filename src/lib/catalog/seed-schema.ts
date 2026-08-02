import { z } from 'zod';
import { COMPONENT_CATEGORIES, SPECS_SCHEMA_BY_CATEGORY, type ComponentSpecs } from '@/lib/specs';

/**
 * Shape of data/seed/catalog.json. Kept separate from the database schema so
 * the hand-edited file stays convenient: prices in euros rather than cents, and
 * `specs` without the redundant category discriminator (injected below).
 */

const seedEntrySchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'key must be lowercase kebab-case'),
  category: z.enum(COMPONENT_CATEGORIES),
  brand: z.string().trim().min(1),
  model: z.string().trim().min(1),
  releaseYear: z.number().int().min(1990).max(2100).optional(),
  msrpEur: z.number().nonnegative().optional(),
  imageUrl: z.string().url().optional().nullable(),
  specs: z.record(z.unknown()),
});

export const seedFileSchema = z.object({
  note: z.string().optional(),
  components: z.array(seedEntrySchema).min(1),
});

export type SeedEntry = z.infer<typeof seedEntrySchema>;

export type ParsedSeedEntry = Omit<SeedEntry, 'specs'> & { specs: ComponentSpecs };

export type SeedParseResult = {
  entries: ParsedSeedEntry[];
  errors: string[];
};

/**
 * Validates the file, then each entry's specs against its category schema.
 * A malformed entry is reported and skipped rather than aborting the seed:
 * one bad hand-edit must not leave the catalog empty.
 */
export function parseSeedFile(raw: unknown): SeedParseResult {
  const file = seedFileSchema.safeParse(raw);
  if (!file.success) {
    return {
      entries: [],
      errors: file.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }

  const entries: ParsedSeedEntry[] = [];
  const errors: string[] = [];
  const seenKeys = new Set<string>();

  for (const entry of file.data.components) {
    if (seenKeys.has(entry.key)) {
      errors.push(`${entry.key}: duplicate key, ignored`);
      continue;
    }
    seenKeys.add(entry.key);

    // The discriminator is derived, never repeated in the hand-edited file.
    const schema = SPECS_SCHEMA_BY_CATEGORY[entry.category];
    const specs = schema.safeParse({ ...entry.specs, category: entry.category });
    if (!specs.success) {
      errors.push(
        `${entry.key}: ${specs.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ')}`,
      );
      continue;
    }

    entries.push({ ...entry, specs: specs.data as ComponentSpecs });
  }

  return { entries, errors };
}

export function eurosToCents(value: number | undefined): number | null {
  return value === undefined ? null : Math.round(value * 100);
}
