import type { ComponentCategory, ComponentSpecs } from '@/lib/specs';
import type { TierEntry } from '@/lib/tier-list/types';
import type { Candidate } from './types';

/**
 * How a slot's candidate list is browsed: the order it is shown in, and the
 * criteria that narrow it. Everything here is pure and runs in the browser —
 * the candidates already travel with their specs, so sorting by socket or by
 * ranking never needs another round trip.
 *
 * What differs from one slot to the next — which criteria make sense, what the
 * numbers mean — is data at the top of this file; the picker itself stays
 * category-agnostic.
 */

export type SortKey = 'pertinence' | 'prix-asc' | 'prix-desc' | 'performance' | 'marque' | 'specs';

export type SortOption = { key: SortKey; label: string };

/**
 * The one number that ranks parts of a category on its own terms, when there is
 * one. Always read as « the bigger the better », hence the single direction.
 */
type SpecSort = { label: string; valueOf: (specs: ComponentSpecs) => number | null };

const SPEC_SORTS: Partial<Record<ComponentCategory, SpecSort>> = {
  cpu: {
    label: 'Cœurs (décroissant)',
    valueOf: (specs) => (specs.category === 'cpu' ? specs.cores : null),
  },
  ram: {
    label: 'Capacité (décroissante)',
    // What the machine ends up with, not what one stick holds.
    valueOf: (specs) =>
      specs.category === 'ram' ? specs.capacityPerStickGb * specs.sticks : null,
  },
  gpu: {
    label: 'VRAM (décroissante)',
    valueOf: (specs) => (specs.category === 'gpu' ? specs.vramGb : null),
  },
  storage: {
    label: 'Capacité (décroissante)',
    valueOf: (specs) => (specs.category === 'storage' ? specs.capacityGb : null),
  },
  psu: {
    label: 'Puissance (décroissante)',
    valueOf: (specs) => (specs.category === 'psu' ? specs.wattage : null),
  },
};

/**
 * A criterion the list can be narrowed by. A part may answer to several values
 * of the same facet — a cooler fits many sockets, a case many form factors.
 */
export type Facet = {
  id: string;
  label: string;
  valuesOf: (candidate: Candidate) => string[];
};

const BRAND: Facet = { id: 'marque', label: 'Marque', valuesOf: (c) => [c.brand] };

const SOCKET: Facet = {
  id: 'socket',
  label: 'Socket',
  valuesOf: ({ specs }) => {
    if (specs.category === 'cpu' || specs.category === 'motherboard') return [specs.socket];
    if (specs.category === 'cooling') return specs.supportedSockets;
    return [];
  },
};

const RAM_TYPE: Facet = {
  id: 'memoire',
  label: 'Type de mémoire',
  valuesOf: ({ specs }) =>
    specs.category === 'ram' || specs.category === 'motherboard' ? [specs.ramType] : [],
};

const VRAM: Facet = {
  id: 'vram',
  label: 'VRAM',
  valuesOf: ({ specs }) => (specs.category === 'gpu' ? [`${specs.vramGb} Go`] : []),
};

const STORAGE_TYPE: Facet = {
  id: 'interface',
  label: 'Interface',
  valuesOf: ({ specs }) => (specs.category === 'storage' ? [specs.storageType] : []),
};

const PSU_FORM_FACTOR: Facet = {
  id: 'format',
  label: 'Format',
  valuesOf: ({ specs }) => (specs.category === 'psu' ? [specs.formFactor] : []),
};

const CASE_FORM_FACTORS: Facet = {
  id: 'format',
  label: 'Cartes mères acceptées',
  valuesOf: ({ specs }) => (specs.category === 'case' ? specs.supportedFormFactors : []),
};

const COOLING_LABELS = { air: 'Ventirad', aio: 'Watercooling AIO', fan: 'Ventilateur' } as const;

const COOLING_TYPE: Facet = {
  id: 'type',
  label: 'Type',
  valuesOf: ({ specs }) => (specs.category === 'cooling' ? [COOLING_LABELS[specs.coolingType]] : []),
};

const FACETS: Partial<Record<ComponentCategory, Facet[]>> = {
  cpu: [SOCKET],
  motherboard: [SOCKET, RAM_TYPE],
  ram: [RAM_TYPE],
  gpu: [VRAM],
  storage: [STORAGE_TYPE],
  psu: [PSU_FORM_FACTOR],
  case: [CASE_FORM_FACTORS],
  cooling: [COOLING_TYPE, SOCKET],
};

/** The brand is offered everywhere, the rest depends on what the slot holds. */
export function facetsFor(slot: ComponentCategory): Facet[] {
  return [BRAND, ...(FACETS[slot] ?? [])];
}

/** Values actually present in a list, so a select never offers a dead end. */
export function facetOptions(facet: Facet, candidates: Candidate[]): string[] {
  const values = new Set<string>();
  for (const candidate of candidates) {
    for (const value of facet.valuesOf(candidate)) {
      if (value.trim() !== '') values.add(value.trim());
    }
  }
  // Numeric-aware so « 12 Go » sorts after « 8 Go », not before it.
  return [...values].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
}

/** Selected value per facet id; an absent or empty entry means « toutes ». */
export type FacetSelection = Record<string, string>;

export function filterCandidates<T extends Candidate>(
  candidates: T[],
  facets: Facet[],
  selection: FacetSelection,
): T[] {
  const active = facets.filter((facet) => (selection[facet.id] ?? '') !== '');
  if (active.length === 0) return candidates;
  return candidates.filter((candidate) =>
    active.every((facet) => facet.valuesOf(candidate).includes(selection[facet.id]!)),
  );
}

export function hasActiveFilters(selection: FacetSelection): boolean {
  return Object.values(selection).some((value) => value !== '');
}

/** The orders that mean something for a slot, in the order the select shows them. */
export function sortOptionsFor(
  slot: ComponentCategory,
  options: { ranked: boolean },
): SortOption[] {
  const specSort = SPEC_SORTS[slot];
  return [
    { key: 'pertinence', label: 'Pertinence' },
    { key: 'prix-asc', label: 'Prix croissant' },
    { key: 'prix-desc', label: 'Prix décroissant' },
    ...(options.ranked ? ([{ key: 'performance', label: 'Tier list' }] as SortOption[]) : []),
    ...(specSort ? ([{ key: 'specs', label: specSort.label }] as SortOption[]) : []),
    { key: 'marque', label: 'Marque (A → Z)' },
  ];
}

/** Sorts a missing value last, whichever direction the present ones go. */
function compareValues(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

/**
 * Reorders a list. The sort is stable, so parts the criterion cannot separate
 * keep the order they arrived in — brand then model, as the server listed them.
 */
export function sortCandidates<T extends Candidate>(
  candidates: T[],
  key: SortKey,
  context: { slot: ComponentCategory; tierEntryFor: (candidate: Candidate) => TierEntry | null },
): T[] {
  if (key === 'pertinence') return candidates;

  const specSort = SPEC_SORTS[context.slot];
  const sorted = [...candidates];

  switch (key) {
    case 'prix-asc':
      return sorted.sort((a, b) => compareValues(a.priceCents, b.priceCents, 1));
    case 'prix-desc':
      return sorted.sort((a, b) => compareValues(a.priceCents, b.priceCents, -1));
    case 'performance':
      // Best index first; a part the ranking does not cover goes to the end.
      return sorted.sort((a, b) =>
        compareValues(
          context.tierEntryFor(a)?.index ?? null,
          context.tierEntryFor(b)?.index ?? null,
          -1,
        ),
      );
    case 'specs':
      if (!specSort) return sorted;
      return sorted.sort((a, b) => compareValues(specSort.valueOf(a.specs), specSort.valueOf(b.specs), -1));
    case 'marque':
      return sorted.sort(
        (a, b) =>
          a.brand.localeCompare(b.brand, 'fr') || a.model.localeCompare(b.model, 'fr', { numeric: true }),
      );
  }
}
