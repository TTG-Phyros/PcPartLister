import type { ComponentCategory } from '@/lib/specs';
import type { Tier } from '@/lib/tier-list/types';

/**
 * Everything that separates one ranking from another: the file it comes from,
 * the columns that file uses, how a row gets its tier, and the wording of the
 * table. The parser, the queries and the table itself are otherwise identical
 * for every kind — adding a third ranking means adding an entry here.
 *
 * Pure data and pure functions: this module is imported by the server (to read
 * the file) and by the browser (to render the table and badge a candidate).
 */

export const TIER_LIST_KINDS = ['gpu', 'cpu'] as const;

export type TierListKind = (typeof TIER_LIST_KINDS)[number];

export function isTierListKind(value: string | undefined): value is TierListKind {
  return TIER_LIST_KINDS.includes(value as TierListKind);
}

/**
 * Where a row's tier comes from. The GPU file states it in a « Gamme » column;
 * the CPU file has no such column, so the tier is derived from the performance
 * index — steps are read top down, the last tier catching everything below.
 */
export type TierSteps = ReadonlyArray<{ tier: Tier; minIndex: number }>;

export type TierSource =
  | { from: 'column'; column: string }
  | { from: 'thresholds'; steps: TierSteps };

export type TierListConfig = {
  /** Catalog category the ranking describes, and the one it links to. */
  category: ComponentCategory;
  /** File name inside the tier-list data directory. */
  file: string;
  columns: { rank: string; model: string; brand: string; index: string };
  tierSource: TierSource;
  /** Unit appended to a formatted index, if any. */
  indexSuffix: string;
  labels: {
    /** Page heading and tab. */
    heading: string;
    tab: string;
    /** Header of the collapsible panel, on the catalog page and in the picker. */
    panel: string;
    indexColumn: string;
    searchPlaceholder: string;
    searchLabel: string;
    unavailable: string;
    noMatch: string;
    /** What the index measures, shown under the page heading. */
    scale: string;
    /** « 12 cartes » — French agreements stay in one place per ranking. */
    count: (total: number) => string;
    /** « 12 cartes classées ». */
    ranked: (total: number) => string;
  };
};

export const TIER_LIST_CONFIG: Record<TierListKind, TierListConfig> = {
  gpu: {
    category: 'gpu',
    file: 'cartes-graphiques.csv',
    columns: { rank: 'Rang', model: 'Modèle', brand: 'Marque', index: 'Indice' },
    tierSource: { from: 'column', column: 'Gamme' },
    indexSuffix: ' %',
    labels: {
      heading: 'Tier list — cartes graphiques',
      tab: 'Cartes graphiques',
      panel: 'Tier list des cartes graphiques',
      indexColumn: 'Indice',
      searchPlaceholder: 'Rechercher un modèle…',
      searchLabel: 'Rechercher un modèle de carte graphique',
      unavailable: 'Le classement des cartes graphiques est indisponible.',
      noMatch: 'Aucune carte ne correspond à cette recherche.',
      scale: 'indice de performance relatif (GeForce RTX 4090 = 100 %)',
      count: (total) => `${total} carte${total > 1 ? 's' : ''}`,
      ranked: (total) => `${total} carte${total > 1 ? 's' : ''} classée${total > 1 ? 's' : ''}`,
    },
  },
  cpu: {
    category: 'cpu',
    file: 'processeurs.csv',
    columns: { rank: 'Rang', model: 'Processeur', brand: 'Marque', index: 'Indice720p' },
    // Thresholds chosen on the shape of the current file: the top step holds the
    // chips still at or above the reference, and each one below is a step a
    // buyer actually feels. They are the only tuning knob of the CPU ranking.
    tierSource: {
      from: 'thresholds',
      steps: [
        { tier: 'extreme', minIndex: 100 },
        { tier: 'haut-de-gamme', minIndex: 92 },
        { tier: 'milieu-plus', minIndex: 80 },
        { tier: 'milieu', minIndex: 70 },
        { tier: 'entree-de-gamme', minIndex: 60 },
        { tier: 'budget', minIndex: Number.NEGATIVE_INFINITY },
      ],
    },
    indexSuffix: '',
    labels: {
      heading: 'Tier list — processeurs',
      tab: 'Processeurs',
      panel: 'Tier list des processeurs',
      indexColumn: 'Indice 720p',
      searchPlaceholder: 'Rechercher un processeur…',
      searchLabel: 'Rechercher un modèle de processeur',
      unavailable: 'Le classement des processeurs est indisponible.',
      noMatch: 'Aucun processeur ne correspond à cette recherche.',
      scale: 'indice de performance en jeu à 720p (base 100)',
      count: (total) => `${total} processeur${total > 1 ? 's' : ''}`,
      ranked: (total) => `${total} processeur${total > 1 ? 's' : ''} classé${total > 1 ? 's' : ''}`,
    },
  },
};

/** The ranking that covers a catalog category, when there is one. */
export function tierListKindFor(category: ComponentCategory): TierListKind | null {
  return TIER_LIST_KINDS.find((kind) => TIER_LIST_CONFIG[kind].category === category) ?? null;
}

/** The tier a given index falls into, for a ranking that derives it. */
export function tierForIndex(steps: TierSteps, index: number): Tier {
  for (const step of steps) {
    if (index >= step.minIndex) return step.tier;
  }
  // Unreachable with a well-formed config: the last step catches everything.
  return 'budget';
}
