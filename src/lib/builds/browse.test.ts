import { describe, expect, it } from 'vitest';
import type { TierEntry } from '@/lib/tier-list/types';
import {
  facetOptions,
  facetsFor,
  filterCandidates,
  sortCandidates,
  sortOptionsFor,
} from './browse';
import type { Candidate } from './types';

function gpu(overrides: Partial<Candidate> & { model: string; vramGb?: number }): Candidate {
  const { vramGb = 8, ...rest } = overrides;
  return {
    key: overrides.model,
    source: 'catalogue',
    inventoryItemId: null,
    catalogComponentId: overrides.model,
    brand: 'NVIDIA',
    imageUrl: '/placeholder.svg',
    summary: [],
    specs: {
      category: 'gpu',
      chipset: overrides.model,
      vramGb,
      lengthMm: 280,
      tdpW: 200,
      powerConnectors: { pcie6pin: 0, pcie8pin: 1, pcie12vhpwr: 0 },
    },
    priceCents: 10000,
    condition: null,
    status: null,
    purchaseDate: null,
    ...rest,
  };
}

function cpu(overrides: Partial<Candidate> & { model: string; socket: string }): Candidate {
  const { socket, ...rest } = overrides;
  return {
    key: overrides.model,
    source: 'catalogue',
    inventoryItemId: null,
    catalogComponentId: overrides.model,
    brand: 'AMD',
    imageUrl: '/placeholder.svg',
    summary: [],
    specs: {
      category: 'cpu',
      socket,
      cores: 6,
      threads: 12,
      baseClockGhz: 3.7,
      tdpW: 65,
      integratedGraphics: false,
    },
    priceCents: 10000,
    condition: null,
    status: null,
    purchaseDate: null,
    ...rest,
  };
}

const noRanking = { slot: 'gpu' as const, tierEntryFor: () => null };

describe('sortCandidates', () => {
  it('orders by price, in both directions', () => {
    const list = [
      gpu({ model: 'B', priceCents: 30000 }),
      gpu({ model: 'A', priceCents: 10000 }),
      gpu({ model: 'C', priceCents: 20000 }),
    ];

    expect(sortCandidates(list, 'prix-asc', noRanking).map((c) => c.model)).toEqual([
      'A',
      'C',
      'B',
    ]);
    expect(sortCandidates(list, 'prix-desc', noRanking).map((c) => c.model)).toEqual([
      'B',
      'C',
      'A',
    ]);
  });

  it('sends a part without a price last, whichever direction is asked', () => {
    const list = [gpu({ model: 'sans prix', priceCents: null }), gpu({ model: 'A', priceCents: 500 })];

    expect(sortCandidates(list, 'prix-asc', noRanking)[1]!.model).toBe('sans prix');
    expect(sortCandidates(list, 'prix-desc', noRanking)[1]!.model).toBe('sans prix');
  });

  it('orders by ranking index, unranked parts last', () => {
    const indexes: Record<string, number> = { A: 40, B: 90 };
    const tierEntryFor = (candidate: Candidate): TierEntry | null =>
      indexes[candidate.model] === undefined
        ? null
        : {
            rank: 1,
            model: candidate.model,
            brand: candidate.brand,
            tier: 'milieu',
            index: indexes[candidate.model]!,
          };

    const list = [gpu({ model: 'A' }), gpu({ model: 'inconnue' }), gpu({ model: 'B' })];
    const sorted = sortCandidates(list, 'performance', { slot: 'gpu', tierEntryFor });

    expect(sorted.map((c) => c.model)).toEqual(['B', 'A', 'inconnue']);
  });

  it('orders by the number that ranks the category, biggest first', () => {
    const list = [gpu({ model: '8 Go', vramGb: 8 }), gpu({ model: '16 Go', vramGb: 16 })];

    expect(sortCandidates(list, 'specs', noRanking)[0]!.model).toBe('16 Go');
  });

  it('leaves the server order untouched on « pertinence »', () => {
    const list = [gpu({ model: 'B', priceCents: 999 }), gpu({ model: 'A', priceCents: 1 })];
    expect(sortCandidates(list, 'pertinence', noRanking)).toBe(list);
  });
});

describe('facets', () => {
  it('offers only the values present in the list', () => {
    const list = [
      cpu({ model: '5600X', socket: 'AM4' }),
      cpu({ model: '7600X', socket: 'AM5' }),
      cpu({ model: '5800X', socket: 'AM4' }),
    ];
    const [, socket] = facetsFor('cpu');

    expect(facetOptions(socket!, list)).toEqual(['AM4', 'AM5']);
  });

  it('narrows on every active facet at once', () => {
    const list = [
      cpu({ model: '5600X', socket: 'AM4', brand: 'AMD' }),
      cpu({ model: '7600X', socket: 'AM5', brand: 'AMD' }),
      cpu({ model: '13600K', socket: 'LGA1700', brand: 'Intel' }),
    ];

    const kept = filterCandidates(list, facetsFor('cpu'), { marque: 'AMD', socket: 'AM4' });
    expect(kept.map((c) => c.model)).toEqual(['5600X']);
  });

  it('keeps everything when no value is selected', () => {
    const list = [cpu({ model: '5600X', socket: 'AM4' })];
    expect(filterCandidates(list, facetsFor('cpu'), { marque: '', socket: '' })).toBe(list);
  });

  it('matches a part that answers to several values of one facet', () => {
    const cooler: Candidate = {
      ...cpu({ model: 'NH-D15', socket: 'AM4' }),
      specs: {
        category: 'cooling',
        coolingType: 'air',
        supportedSockets: ['AM4', 'AM5', 'LGA1700'],
        heightMm: 165,
      },
    };

    expect(filterCandidates([cooler], facetsFor('cooling'), { socket: 'LGA1700' })).toHaveLength(1);
    expect(filterCandidates([cooler], facetsFor('cooling'), { socket: 'LGA1200' })).toHaveLength(0);
  });
});

describe('sortOptionsFor', () => {
  it('offers the ranking only when the slot has one loaded', () => {
    const keys = (ranked: boolean) => sortOptionsFor('gpu', { ranked }).map((o) => o.key);

    expect(keys(true)).toContain('performance');
    expect(keys(false)).not.toContain('performance');
  });

  it('omits the spec order for a category with no obvious number', () => {
    expect(sortOptionsFor('misc', { ranked: false }).map((o) => o.key)).not.toContain('specs');
    expect(sortOptionsFor('psu', { ranked: false }).map((o) => o.key)).toContain('specs');
  });
});
