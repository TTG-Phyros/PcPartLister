import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { catalogComponents } from '@/lib/db/schema';
import {
  buildGpuTierIndex,
  findGpuTierEntry,
  matchCatalogIds,
  parseGpuTierCsv,
  type GpuNaming,
  type GpuTierIndex,
} from '@/lib/tier-list/parse';
import type { GpuTierEntry, GpuTierRow } from '@/lib/tier-list/types';

/**
 * Loads data/tier-list/cartes-graphiques.csv and ties it to the catalog.
 *
 * The ranking is reference data, hand-editable like the seed files, and never
 * stored in the database: nothing in the app writes to it, and a new column in
 * the file would only mean a new column in the table.
 */

const TIER_LIST_FILE = 'cartes-graphiques.csv';

/** Same convention as the seed scripts: overridable, with a working default. */
function tierListDir(): string {
  return process.env.TIER_LIST_DATA_DIR ?? path.resolve('data/tier-list');
}

let cached: GpuTierEntry[] | null = null;

export async function getGpuTierEntries(): Promise<GpuTierEntry[]> {
  // The file cannot change while the server runs, so one read is enough.
  if (cached) return cached;

  try {
    const raw = await readFile(path.join(tierListDir(), TIER_LIST_FILE), 'utf8');
    const { entries, errors } = parseGpuTierCsv(raw);
    for (const error of errors) console.warn(`[tier-list] ${error}`);
    cached = entries;
  } catch (error) {
    // A missing or unreadable file must not take a page down: the table simply
    // reports that it has nothing to show.
    console.warn(`[tier-list] ${TIER_LIST_FILE} illisible : ${(error as Error).message}`);
    cached = [];
  }

  return cached;
}

let cachedIndex: GpuTierIndex | null = null;

/** Where a single GPU sits in the ranking, for the badge on its sheet. */
export async function findTierEntryForGpu(naming: GpuNaming): Promise<GpuTierEntry | null> {
  const entries = await getGpuTierEntries();
  cachedIndex ??= buildGpuTierIndex(entries);
  return findGpuTierEntry(cachedIndex, naming);
}

/** Catalog GPUs, reference brands first so a ranked chip links to the plain model
 *  rather than to an AIB variant that happens to share the chip. */
async function listCatalogGpus(): Promise<Array<GpuNaming & { id: string }>> {
  const rows = await db
    .select({
      id: catalogComponents.id,
      brand: catalogComponents.brand,
      model: catalogComponents.model,
      specs: catalogComponents.specs,
    })
    .from(catalogComponents)
    .where(eq(catalogComponents.category, 'gpu'))
    .orderBy(asc(catalogComponents.model));

  const gpus = rows.flatMap((row) =>
    row.specs.category === 'gpu'
      ? [
          {
            id: row.id,
            brand: row.brand,
            model: row.model,
            chipset: row.specs.chipset,
            vramGb: row.specs.vramGb,
          },
        ]
      : [],
  );

  const isReferenceBrand = (brand: string) =>
    ['nvidia', 'amd', 'intel'].includes(brand.trim().toLowerCase());

  // Stable sort: alphabetical order survives inside each group.
  return gpus.sort((a, b) => Number(isReferenceBrand(b.brand)) - Number(isReferenceBrand(a.brand)));
}

/** The ranking, each row carrying the catalog model it matches when there is one. */
export async function getGpuTierRows(): Promise<GpuTierRow[]> {
  const entries = await getGpuTierEntries();
  if (entries.length === 0) return [];

  const matches = matchCatalogIds(entries, await listCatalogGpus());
  return entries.map((entry) => ({
    ...entry,
    catalogComponentId: matches.get(entry.rank) ?? null,
  }));
}
