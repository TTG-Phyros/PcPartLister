import { describe, expect, it } from 'vitest';
import {
  buildTierIndex,
  findTierEntry,
  matchCatalogIds,
  normalizeModelName,
  parseTierCsv,
  withoutMemorySize,
} from '@/lib/tier-list/parse';
import type { TierEntry } from '@/lib/tier-list/types';

const HEADER = 'Rang,Modèle,Marque,Gamme,Indice';

const CSV = [
  HEADER,
  ',GeForce RTX 5090,NVIDIA,Extrême,125.0%',
  ',GeForce RTX 4090,NVIDIA,Extrême,100.0%',
  '#3,Radeon RX 7900 XTX,AMD,Haut de gamme,80.1%',
  '#4,GeForce RTX 3080 12GB,NVIDIA,Milieu+,57.7%',
  '#5,GeForce RTX 3080,NVIDIA,Milieu+,55.5%',
  '#6,Intel Arc A770 16GB,Intel,Entrée de gamme,30.9%',
  '#7,GeForce GTX 1060 6GB,NVIDIA,Budget,15.7%',
  '#8,GeForce GTX 1060 3GB,NVIDIA,Budget,15.2%',
  // Same chip as #6, without the memory size: the pair the matcher must separate.
  '#9,Intel Arc A770,Intel,Entrée de gamme,30.0%',
].join('\n');

describe('parseTierCsv (gpu)', () => {
  it('reads every column and maps the tier label to its slug', () => {
    const { entries, errors } = parseTierCsv('gpu', CSV);

    expect(errors).toEqual([]);
    expect(entries).toHaveLength(9);
    expect(entries[0]).toEqual({
      rank: 1,
      model: 'GeForce RTX 5090',
      brand: 'NVIDIA',
      tier: 'extreme',
      index: 125,
    });
    expect(entries[2]).toMatchObject({ rank: 3, tier: 'haut-de-gamme', index: 80.1 });
    expect(entries[5]!.tier).toBe('entree-de-gamme');
  });

  it('numbers the leading rows the source leaves blank', () => {
    const { entries } = parseTierCsv('gpu', CSV);
    expect(entries.slice(0, 3).map((entry: TierEntry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it('tolerates a BOM, CRLF line endings and quoted fields', () => {
    const { entries, errors } = parseTierCsv(
      'gpu',
      `﻿${HEADER}\r\n#1,"GeForce RTX 4090, édition test",NVIDIA,Extrême,100.0%\r\n`,
    );

    expect(errors).toEqual([]);
    expect(entries[0]!.model).toBe('GeForce RTX 4090, édition test');
  });

  it('skips a malformed row and reports it, keeping the rest', () => {
    const { entries, errors } = parseTierCsv(
      'gpu',
      [HEADER, '#1,GeForce RTX 4090,NVIDIA,Gamme inventée,100.0%', '#2,Radeon RX 7600,AMD,Budget,34.9%'].join(
        '\n',
      ),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]!.model).toBe('Radeon RX 7600');
    expect(errors[0]).toContain('gamme inconnue');
  });

  it('reports a header that lost a column instead of guessing', () => {
    const { entries, errors } = parseTierCsv('gpu', 'Rang,Modèle,Marque\n#1,GeForce RTX 4090,NVIDIA');

    expect(entries).toEqual([]);
    expect(errors[0]).toContain('Gamme');
  });
});

describe('parseTierCsv (cpu)', () => {
  const CPU_HEADER = 'Rang,Processeur,Marque,Indice720p';

  const CPU_CSV = [
    CPU_HEADER,
    '1,Ryzen 7 9800X3D,AMD,120',
    '2,Core i9-14900K,Intel,104.6',
    // Exactly on a threshold: the step is inclusive, so this is still « Extrême ».
    '3,Ryzen 7 9700X,AMD,100.0',
    '4,Ryzen 5 9600X,AMD,98.0',
    '5,Core i5-12600K,Intel,82.4',
    '6,Core i7-10700K,Intel,72.5',
    '7,Ryzen 5 3600,AMD,60.0',
    '8,Ryzen 5 2600,AMD,45.0',
  ].join('\n');

  it('reads the processor columns, which are named differently', () => {
    const { entries, errors } = parseTierCsv('cpu', CPU_CSV);

    expect(errors).toEqual([]);
    expect(entries).toHaveLength(8);
    expect(entries[1]).toMatchObject({ rank: 2, model: 'Core i9-14900K', brand: 'Intel', index: 104.6 });
  });

  it('derives the tier from the index, the file having no « Gamme » column', () => {
    const { entries } = parseTierCsv('cpu', CPU_CSV);

    expect(entries.map((entry: TierEntry) => entry.tier)).toEqual([
      'extreme',
      'extreme',
      'extreme',
      'haut-de-gamme',
      'milieu-plus',
      'milieu',
      'entree-de-gamme',
      'budget',
    ]);
  });

  it('puts an index just under a threshold in the step below', () => {
    const { entries } = parseTierCsv('cpu', [CPU_HEADER, '1,Test,AMD,99.9'].join('\n'));
    expect(entries[0]!.tier).toBe('haut-de-gamme');
  });

  it('reports the processor header it expects, not the graphics one', () => {
    const { entries, errors } = parseTierCsv('cpu', 'Rang,Modèle,Marque,Indice\n1,Ryzen 5 7600,AMD,91');

    expect(entries).toEqual([]);
    expect(errors[0]).toContain('Processeur');
    expect(errors[0]).toContain('Indice720p');
  });

  it('reports an unreadable index and keeps the other rows', () => {
    const { entries, errors } = parseTierCsv(
      'cpu',
      [CPU_HEADER, '1,Ryzen 7 9800X3D,AMD,rapide', '2,Ryzen 5 2600,AMD,45.0'].join('\n'),
    );

    expect(entries).toHaveLength(1);
    expect(errors[0]).toContain('indice illisible');
  });
});

describe('normalizeModelName', () => {
  it('unifies the two ways of writing memory', () => {
    expect(normalizeModelName('GeForce RTX 3070 8 Go')).toBe('geforce rtx 3070 8gb');
    expect(normalizeModelName('GeForce RTX 3070 8GB')).toBe('geforce rtx 3070 8gb');
  });

  it('ignores case, accents and punctuation', () => {
    expect(normalizeModelName('GeForce GTX 1650 SUPER')).toBe(normalizeModelName('GeForce GTX 1650 Super'));
  });

  it('strips the memory size on demand', () => {
    expect(withoutMemorySize(normalizeModelName('GeForce GTX 1060 6GB'))).toBe('geforce gtx 1060');
  });

  it('leaves a processor name alone apart from its case', () => {
    expect(normalizeModelName('Core Ultra 7 270K Plus')).toBe('core ultra 7 270k plus');
    expect(normalizeModelName('Ryzen 7 9800X3D')).toBe('ryzen 7 9800x3d');
  });
});

describe('findTierEntry', () => {
  const index = buildTierIndex(parseTierCsv('gpu', CSV).entries);

  it('picks the variant matching the memory the card actually has', () => {
    expect(
      findTierEntry(index, { model: 'GeForce GTX 1060 6 Go', chipset: 'GeForce GTX 1060', vramGb: 6 })
        ?.rank,
    ).toBe(7);
    expect(
      findTierEntry(index, { model: 'GeForce GTX 1060 3 Go', chipset: 'GeForce GTX 1060', vramGb: 3 })
        ?.rank,
    ).toBe(8);
  });

  it('prefers the plain row over a memory-qualified one for the base card', () => {
    expect(
      findTierEntry(index, { model: 'GeForce RTX 3080 10 Go', chipset: 'GeForce RTX 3080', vramGb: 10 })
        ?.rank,
    ).toBe(5);
  });

  it('matches an AIB card through its chipset', () => {
    expect(
      findTierEntry(index, {
        model: 'GeForce RTX 3080 Gaming OC 10G',
        chipset: 'GeForce RTX 3080',
        vramGb: 10,
      })?.rank,
    ).toBe(5);
  });

  it('returns null for a card the ranking does not cover', () => {
    expect(
      findTierEntry(index, { model: 'GeForce GTX 950 2 Go', chipset: 'GeForce GTX 950', vramGb: 2 }),
    ).toBeNull();
  });

  it('matches a processor on its model name alone', () => {
    const cpuIndex = buildTierIndex(
      parseTierCsv('cpu', ['Rang,Processeur,Marque,Indice720p', '1,Ryzen 7 9800X3D,AMD,120'].join('\n'))
        .entries,
    );

    expect(findTierEntry(cpuIndex, { model: 'Ryzen 7 9800X3D' })?.rank).toBe(1);
    expect(findTierEntry(cpuIndex, { model: 'Ryzen 7 9700X' })).toBeNull();
  });
});

describe('matchCatalogIds', () => {
  const { entries } = parseTierCsv('gpu', CSV);

  it('links a ranked card to the catalog model that is exactly it', () => {
    const matches = matchCatalogIds(entries, [
      { id: 'a', model: 'GeForce RTX 3080 10 Go', chipset: 'GeForce RTX 3080', vramGb: 10 },
      { id: 'b', model: 'Radeon RX 7900 XTX 24 Go', chipset: 'Radeon RX 7900 XTX', vramGb: 24 },
    ]);

    expect(matches.get(5)).toBe('a');
    expect(matches.get(3)).toBe('b');
    // The 12 Go row must not borrow the 10 Go sheet.
    expect(matches.get(4)).toBeUndefined();
  });

  it('separates two variants of the same chip', () => {
    const matches = matchCatalogIds(entries, [
      { id: '10go', model: 'GeForce RTX 3080 10 Go', chipset: 'GeForce RTX 3080', vramGb: 10 },
      { id: '12go', model: 'GeForce RTX 3080 12 Go', chipset: 'GeForce RTX 3080', vramGb: 12 },
    ]);

    expect(matches.get(4)).toBe('12go');
    expect(matches.get(5)).toBe('10go');
  });

  it('lets a better-placed row claim the sheet a looser name would also match', () => {
    // Only « Intel Arc A770 16GB » (#6) names its memory; « Intel Arc A770 » (#9)
    // must then land on the sheet the first one did not take.
    const matches = matchCatalogIds(entries, [
      { id: '8go', model: 'Arc A770 8 Go', chipset: 'Intel Arc A770', vramGb: 8 },
      { id: '16go', model: 'Arc A770 16 Go', chipset: 'Intel Arc A770', vramGb: 16 },
    ]);

    expect(matches.get(6)).toBe('16go');
    expect(matches.get(9)).toBe('8go');
  });

  it('never links the same sheet from two rows', () => {
    const duplicated = [...entries, { ...entries[4]!, rank: 99 }];
    const matches = matchCatalogIds(duplicated, [
      { id: 'a', model: 'GeForce RTX 3080 10 Go', chipset: 'GeForce RTX 3080', vramGb: 10 },
    ]);

    expect(matches.get(5)).toBe('a');
    expect(matches.has(99)).toBe(false);
  });

  it('leaves a rank unmatched when the catalog has nothing for it', () => {
    const matches = matchCatalogIds(entries, [
      { id: 'a', model: 'GeForce RTX 4060 8 Go', chipset: 'GeForce RTX 4060', vramGb: 8 },
    ]);

    expect(matches.size).toBe(0);
  });

  it('gives a chip to the reference model rather than to an AIB variant', () => {
    const matches = matchCatalogIds(entries, [
      // Reference brands are ordered first by the query layer.
      { id: 'reference', model: 'GeForce RTX 5090 32 Go', chipset: 'GeForce RTX 5090', vramGb: 32 },
      { id: 'aib', model: 'GeForce RTX 5090 Suprim X', chipset: 'GeForce RTX 5090', vramGb: 32 },
    ]);

    expect(matches.get(1)).toBe('reference');
  });

  it('links ranked processors to their catalog sheets by name', () => {
    const cpus = parseTierCsv(
      'cpu',
      ['Rang,Processeur,Marque,Indice720p', '1,Ryzen 7 9800X3D,AMD,120', '2,Core i9-14900K,Intel,104.6'].join(
        '\n',
      ),
    ).entries;

    const matches = matchCatalogIds(cpus, [
      { id: 'ryzen', model: 'Ryzen 7 9800X3D' },
      { id: 'intel', model: 'Core i9-14900K' },
    ]);

    expect(matches.get(1)).toBe('ryzen');
    expect(matches.get(2)).toBe('intel');
  });
});
