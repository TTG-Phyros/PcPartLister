import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { catalogComponents } from '@/lib/db/schema';
import { TIER_LIST_CONFIG, TIER_LIST_KINDS, type TierListKind } from '@/lib/tier-list/kinds';
import {
  buildTierIndex,
  findTierEntry,
  matchCatalogIds,
  parseTierCsv,
  type ComponentNaming,
  type TierIndex,
} from '@/lib/tier-list/parse';
import type { TierEntry, TierRow } from '@/lib/tier-list/types';

/**
 * Loads the files of data/tier-list/ and ties them to the catalog.
 *
 * The rankings are reference data, hand-editable like the seed files, and never
 * stored in the database: nothing in the app writes to them, and a new column in
 * a file would only mean a new column in the table.
 */

/** Same convention as the seed scripts: overridable, with a working default. */
function tierListDir(): string {
  return process.env.TIER_LIST_DATA_DIR ?? path.resolve('data/tier-list');
}

const cachedEntries = new Map<TierListKind, TierEntry[]>();

export async function getTierEntries(kind: TierListKind): Promise<TierEntry[]> {
  // A file cannot change while the server runs, so one read each is enough.
  const known = cachedEntries.get(kind);
  if (known) return known;

  const { file } = TIER_LIST_CONFIG[kind];
  let entries: TierEntry[];

  try {
    const raw = await readFile(path.join(tierListDir(), file), 'utf8');
    const parsed = parseTierCsv(kind, raw);
    for (const error of parsed.errors) console.warn(`[tier-list] ${file} : ${error}`);
    entries = parsed.entries;
  } catch (error) {
    // A missing or unreadable file must not take a page down: the table simply
    // reports that it has nothing to show.
    console.warn(`[tier-list] ${file} illisible : ${(error as Error).message}`);
    entries = [];
  }

  cachedEntries.set(kind, entries);
  return entries;
}

const cachedIndexes = new Map<TierListKind, TierIndex>();

/** Where a single component sits in its ranking, for the badge on its sheet. */
export async function findTierEntryFor(
  kind: TierListKind,
  naming: ComponentNaming,
): Promise<TierEntry | null> {
  const entries = await getTierEntries(kind);
  let index = cachedIndexes.get(kind);
  if (!index) {
    index = buildTierIndex(entries);
    cachedIndexes.set(kind, index);
  }
  return findTierEntry(index, naming);
}

/**
 * Catalog components of the ranked category, reference brands first so a ranked
 * chip links to the plain model rather than to an AIB variant that happens to
 * share it.
 */
async function listCatalogComponents(
  kind: TierListKind,
): Promise<Array<ComponentNaming & { id: string }>> {
  const { category } = TIER_LIST_CONFIG[kind];

  const rows = await db
    .select({
      id: catalogComponents.id,
      brand: catalogComponents.brand,
      model: catalogComponents.model,
      specs: catalogComponents.specs,
    })
    .from(catalogComponents)
    .where(eq(catalogComponents.category, category))
    .orderBy(asc(catalogComponents.model));

  // Only graphics cards name a chipset; a processor is matched on its model.
  const components = rows.map((row) => ({
    id: row.id,
    brand: row.brand,
    model: row.model,
    chipset: row.specs.category === 'gpu' ? row.specs.chipset : null,
    vramGb: row.specs.category === 'gpu' ? row.specs.vramGb : null,
  }));

  const isReferenceBrand = (brand: string) =>
    ['nvidia', 'amd', 'intel'].includes(brand.trim().toLowerCase());

  // Stable sort: alphabetical order survives inside each group.
  return components.sort(
    (a, b) => Number(isReferenceBrand(b.brand)) - Number(isReferenceBrand(a.brand)),
  );
}

/** A ranking, each row carrying the catalog model it matches when there is one. */
export async function getTierRows(kind: TierListKind): Promise<TierRow[]> {
  const entries = await getTierEntries(kind);
  if (entries.length === 0) return [];

  const matches = matchCatalogIds(entries, await listCatalogComponents(kind));
  return entries.map((entry) => ({
    ...entry,
    catalogComponentId: matches.get(entry.rank) ?? null,
  }));
}

/** Every ranking at once, for the configurator: it may open any slot. */
export async function getAllTierRows(): Promise<Record<TierListKind, TierRow[]>> {
  const rankings = await Promise.all(TIER_LIST_KINDS.map((kind) => getTierRows(kind)));
  return Object.fromEntries(TIER_LIST_KINDS.map((kind, position) => [kind, rankings[position]!])) as Record<
    TierListKind,
    TierRow[]
  >;
}
