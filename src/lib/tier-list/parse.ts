import {
  TIER_LIST_CONFIG,
  tierForIndex,
  type TierListKind,
} from '@/lib/tier-list/kinds';
import { TIERS, TIER_LABELS, type Tier, type TierEntry } from '@/lib/tier-list/types';

/**
 * Shape of the files in data/tier-list/, and the name matching that ties a
 * ranked part to a catalog model. What differs between two rankings — columns,
 * where the tier comes from — lives in `kinds.ts`; this file is the same code
 * for all of them.
 *
 * Pure functions only: no filesystem, no database, no React. The same matcher
 * therefore runs on the server (to resolve product links) and in the browser
 * (to badge a candidate in the configurator).
 */

export type TierParseResult = {
  entries: TierEntry[];
  errors: string[];
};

/** Columns a given ranking's file must declare. */
export function tierCsvColumns(kind: TierListKind): string[] {
  const config = TIER_LIST_CONFIG[kind];
  const { rank, model, brand, index } = config.columns;
  return config.tierSource.from === 'column'
    ? [rank, model, brand, config.tierSource.column, index]
    : [rank, model, brand, index];
}

/** Splits one CSV line, honouring double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

const TIER_BY_LABEL = new Map<string, Tier>(
  TIERS.map((tier) => [normalizeLabel(TIER_LABELS[tier]), tier]),
);

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Parses a ranking file. A malformed row is reported and skipped rather than
 * aborting: one bad hand-edit must not empty the whole table.
 */
export function parseTierCsv(kind: TierListKind, raw: string): TierParseResult {
  const config = TIER_LIST_CONFIG[kind];

  // Strips a BOM: spreadsheets add one, and it would poison the first header.
  const lines = raw
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');

  if (lines.length === 0) return { entries: [], errors: ['fichier vide'] };

  const header = splitCsvLine(lines[0]!);
  const missing = tierCsvColumns(kind).filter((column) => !header.includes(column));
  if (missing.length > 0) {
    return { entries: [], errors: [`colonnes manquantes : ${missing.join(', ')}`] };
  }

  const at = {
    rank: header.indexOf(config.columns.rank),
    model: header.indexOf(config.columns.model),
    brand: header.indexOf(config.columns.brand),
    index: header.indexOf(config.columns.index),
    tier: config.tierSource.from === 'column' ? header.indexOf(config.tierSource.column) : -1,
  };

  const entries: TierEntry[] = [];
  const errors: string[] = [];

  for (const [offset, line] of lines.slice(1).entries()) {
    const row = offset + 2; // 1-based, header included: matches what an editor shows.
    const fields = splitCsvLine(line);
    const model = fields[at.model]?.trim() ?? '';
    const brand = fields[at.brand]?.trim() ?? '';
    const rawIndex = fields[at.index] ?? '';
    const index = Number.parseFloat(rawIndex.replace('%', '').replace(',', '.'));

    if (model === '') {
      errors.push(`ligne ${row} : modèle manquant`);
      continue;
    }
    if (brand === '') {
      errors.push(`ligne ${row} : marque manquante`);
      continue;
    }
    if (!Number.isFinite(index) || index <= 0) {
      errors.push(`ligne ${row} (${model}) : indice illisible « ${rawIndex} »`);
      continue;
    }

    let tier: Tier;
    if (config.tierSource.from === 'thresholds') {
      tier = tierForIndex(config.tierSource.steps, index);
    } else {
      const declared = TIER_BY_LABEL.get(normalizeLabel(fields[at.tier] ?? ''));
      if (!declared) {
        errors.push(`ligne ${row} (${model}) : gamme inconnue « ${fields[at.tier] ?? ''} »`);
        continue;
      }
      tier = declared;
    }

    // The top rows of the GPU file leave `Rang` blank; the file order is the ranking.
    const declaredRank = Number.parseInt((fields[at.rank] ?? '').replace('#', ''), 10);
    entries.push({
      rank: Number.isFinite(declaredRank) ? declaredRank : entries.length + 1,
      model,
      brand,
      tier,
      index,
    });
  }

  return { entries, errors };
}

/**
 * Comparable form of a part name. Accents, case and punctuation go away, and the
 * memory size is unified — the catalog writes « 8 Go » where the ranking writes
 * « 8GB ».
 */
export function normalizeModelName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(\d+)\s*(go|gb)\b/g, '$1gb')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same name without its memory size: « geforce gtx 1060 6gb » → « geforce gtx 1060 ». */
export function withoutMemorySize(normalized: string): string {
  return normalized.replace(/\s*\b\d+gb\b/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * What a part is called on the catalog side. `chipset` and `vramGb` only exist
 * for graphics cards; a CPU answers to its model name alone.
 */
export type ComponentNaming = {
  model: string;
  chipset?: string | null;
  vramGb?: number | null;
};

/**
 * Builds a lookup table where a more specific key always wins over a looser one,
 * whichever item declared it: every item registers its level-0 keys before any
 * item registers its level-1 keys. Within a level, the first item wins.
 */
function groupByLevel<T>(items: T[], keysOf: (item: T) => Array<string | null>): Map<string, T[]> {
  const index = new Map<string, T[]>();
  const keyed = items.map((item) => ({ item, keys: keysOf(item) }));
  const levels = Math.max(0, ...keyed.map(({ keys }) => keys.length));

  for (let level = 0; level < levels; level += 1) {
    for (const { item, keys } of keyed) {
      const key = keys[level];
      if (!key) continue;
      const bucket = index.get(key);
      if (!bucket) index.set(key, [item]);
      else if (!bucket.includes(item)) bucket.push(item);
    }
  }

  return index;
}

/** Same table, keeping only the best candidate per key. */
function indexByLevel<T>(items: T[], keysOf: (item: T) => Array<string | null>): Map<string, T> {
  return new Map(
    [...groupByLevel(items, keysOf)].map(([key, candidates]) => [key, candidates[0]!]),
  );
}

/** Keys a ranked part answers to, most specific first. */
function tierEntryKeys(entry: TierEntry): string[] {
  const normalized = normalizeModelName(entry.model);
  const base = withoutMemorySize(normalized);
  return base === normalized ? [normalized] : [normalized, base];
}

/** Keys a catalog part answers to, most specific first. */
function catalogKeys(naming: ComponentNaming): Array<string | null> {
  const chipset = naming.chipset ? normalizeModelName(naming.chipset) : null;
  return [
    chipset && naming.vramGb ? `${chipset} ${naming.vramGb}gb` : null,
    chipset,
    normalizeModelName(naming.model),
  ];
}

export type TierIndex = Map<string, TierEntry>;

export function buildTierIndex(entries: TierEntry[]): TierIndex {
  return indexByLevel(entries, tierEntryKeys);
}

/**
 * The ranked part a catalog component corresponds to, or null when the ranking
 * does not cover it. Tries « chip + memory » first so that a GTX 1060 6 Go never
 * lands on the 3 Go row.
 */
export function findTierEntry(index: TierIndex, naming: ComponentNaming): TierEntry | null {
  for (const key of catalogKeys(naming)) {
    if (!key) continue;
    const found = index.get(key);
    if (found) return found;
  }
  return null;
}

/**
 * Reverse direction: for each ranked part, the id of the catalog model that is
 * exactly it, keyed by rank. A row naming a memory size only ever matches a
 * catalog card of that size, so « RTX 3080 12GB » never links to a 10 Go sheet.
 *
 * The pairing is one-to-one, walked in ranking order: a catalog sheet claimed by
 * a better-placed row is out of reach for the ones below. That is what separates
 * two variants of the same chip — « Arc A770 16GB » takes the 16 Go sheet, and
 * plain « Arc A770 » then falls on the 8 Go one — and what keeps a duplicated row
 * from pointing a second time at the same model.
 */
export function matchCatalogIds<T extends ComponentNaming & { id: string }>(
  entries: TierEntry[],
  components: T[],
): Map<number, string> {
  const index = groupByLevel(components, catalogKeys);
  const matches = new Map<number, string>();
  const claimed = new Set<string>();

  for (const entry of [...entries].sort((a, b) => a.rank - b.rank)) {
    const candidates = index.get(normalizeModelName(entry.model)) ?? [];
    const free = candidates.find((candidate) => !claimed.has(candidate.id));
    if (!free) continue;

    claimed.add(free.id);
    matches.set(entry.rank, free.id);
  }

  return matches;
}
