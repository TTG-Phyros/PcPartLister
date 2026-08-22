import { describe, expect, it } from 'vitest';
import { buildListingText, listingLine, listingPrice } from './listing-text';
import type { BuildDetail, BuildLine } from './types';

function line(overrides: Partial<BuildLine>): BuildLine {
  return {
    id: 'line',
    slot: 'cpu',
    source: 'stock',
    inventoryItemId: 'unit',
    catalogComponentId: 'model',
    brand: 'AMD',
    model: 'Ryzen 5 5600X',
    imageUrl: '/placeholder.svg',
    summary: [],
    specs: {
      category: 'cpu',
      socket: 'AM4',
      cores: 6,
      threads: 12,
      baseClockGhz: 3.7,
      tdpW: 65,
      integratedGraphics: false,
    },
    priceCents: 11250,
    originalPriceCents: null,
    condition: null,
    unit: { status: 'en_stock', receivedAt: '2026-01-10' },
    position: 0,
    ...overrides,
  };
}

function build(overrides: Partial<BuildDetail> = {}): Pick<
  BuildDetail,
  'name' | 'lines' | 'targetPriceCents' | 'askingPriceCents'
> {
  return {
    name: 'Config gaming',
    lines: [line({})],
    targetPriceCents: null,
    askingPriceCents: null,
    ...overrides,
  };
}

describe('listingPrice', () => {
  it('leads with what the sale fetched', () => {
    const price = listingPrice({ targetPriceCents: 80000, askingPriceCents: 85000 }, 82000);
    expect(price).toEqual({ label: 'Prix de vente', priceCents: 82000 });
  });

  it('falls back on the asking price, then on the objective', () => {
    expect(listingPrice({ targetPriceCents: 80000, askingPriceCents: 85000 }, null)).toEqual({
      label: 'Prix demandé',
      priceCents: 85000,
    });
    expect(listingPrice({ targetPriceCents: 80000, askingPriceCents: null }, null)).toEqual({
      label: 'Prix objectif',
      priceCents: 80000,
    });
  });

  it('says nothing when no price has been set anywhere', () => {
    expect(listingPrice({ targetPriceCents: null, askingPriceCents: null }, null)).toBeNull();
  });
});

describe('listingLine', () => {
  it('names the category, the model and the specs a buyer scans for', () => {
    expect(listingLine(line({}))).toBe(
      '- Processeur : AMD Ryzen 5 5600X — 6 cœurs / 12 threads, 3.7 GHz, socket AM4, 65 W',
    );
  });

  it('prefers the boost clock and mentions integrated graphics only when there are some', () => {
    const text = listingLine(
      line({
        specs: {
          category: 'cpu',
          socket: 'AM4',
          cores: 6,
          threads: 12,
          baseClockGhz: 3.7,
          boostClockGhz: 4.6,
          tdpW: 65,
          integratedGraphics: true,
        },
      }),
    );
    expect(text).toContain("jusqu'à 4.6 GHz");
    expect(text).toContain('graphiques intégrés');
  });

  it('skips optional specs left blank instead of showing an empty field', () => {
    const text = listingLine(
      line({
        slot: 'ram',
        brand: 'Corsair',
        model: 'Vengeance LPX',
        specs: {
          category: 'ram',
          ramType: 'DDR4',
          capacityPerStickGb: 8,
          sticks: 2,
          speedMhz: 3200,
        },
      }),
    );
    expect(text).toBe('- Mémoire : Corsair Vengeance LPX — 16 Go (2×8 Go), DDR4, 3200 MHz');
    expect(text).not.toContain('CL');
    expect(text).not.toContain('undefined');
  });

  it('does not repeat a chipset the model already spells out', () => {
    const gpu = {
      category: 'gpu' as const,
      chipset: 'RTX 3060 Ti',
      vramGb: 8,
      lengthMm: 242,
      tdpW: 200,
      powerConnectors: { pcie6pin: 0, pcie8pin: 1, pcie12vhpwr: 0 },
    };
    expect(listingLine(line({ slot: 'gpu', brand: 'MSI', model: 'RTX 3060 Ti Gaming X', specs: gpu }))).toBe(
      '- Carte graphique : MSI RTX 3060 Ti Gaming X — 8 Go de VRAM, 200 W',
    );
    expect(listingLine(line({ slot: 'gpu', brand: 'MSI', model: 'Gaming X Trio', specs: gpu }))).toContain(
      'puce RTX 3060 Ti',
    );
  });

  it('carries the condition of an owned unit', () => {
    expect(listingLine(line({ condition: 'tres_bon' }))).toContain('état : Très bon');
  });

  it('holds a part with nothing but a name on its own', () => {
    expect(
      listingLine(
        line({
          slot: 'misc',
          brand: 'Générique',
          model: 'Câble HDMI',
          condition: null,
          specs: { category: 'misc' },
        }),
      ),
    ).toBe('- Divers : Générique Câble HDMI');
  });

  it('agrees the plural with the number of slots and ports', () => {
    const text = listingLine(
      line({
        slot: 'motherboard',
        brand: 'MSI',
        model: 'Z170-A PRO',
        condition: null,
        specs: {
          category: 'motherboard',
          socket: 'LGA1151',
          chipset: 'Z170',
          formFactor: 'ATX',
          ramType: 'DDR4',
          ramSlots: 4,
          maxRamGb: 64,
          sataPorts: 6,
          m2Slots: 1,
        },
      }),
    );
    expect(text).toBe(
      '- Carte mère : MSI Z170-A PRO — socket LGA1151, chipset Z170, format ATX, 4 slots DDR4, 1 slot M.2, 6 ports SATA',
    );
  });
});

describe('buildListingText', () => {
  it('opens on the instruction, then the configuration, then its components', () => {
    const text = buildListingText(build({ targetPriceCents: 85000 }), null);
    expect(text).toBe(
      [
        'Rédige une annonce de vente attractive pour cette configuration PC en te basant sur les composants suivants :',
        '',
        'Configuration PC à vendre : Config gaming',
        'Prix objectif : 850 €',
        '',
        'Composants :',
        '- Processeur : AMD Ryzen 5 5600X — 6 cœurs / 12 threads, 3.7 GHz, socket AM4, 65 W',
      ].join('\n'),
    );
  });

  it('stays correct with no price of any kind', () => {
    const text = buildListingText(build(), null);
    expect(text).not.toContain('Prix');
    expect(text).toContain('Configuration PC à vendre : Config gaming');
  });

  it('lists the components in the reading order of the configurator', () => {
    const text = buildListingText(
      build({
        lines: [
          line({ id: 'c', slot: 'psu', brand: 'Corsair', model: 'RM650', specs: {
            category: 'psu',
            wattage: 650,
            efficiency: '80+ Gold',
            modular: 'oui',
            formFactor: 'ATX',
            pcieConnectors: { pcie6pin: 0, pcie8pin: 2, pcie12vhpwr: 0 },
          }, position: 0 }),
          line({ id: 'a', slot: 'cpu', position: 1 }),
        ],
      }),
      null,
    );
    const order = text.split('\n').filter((row) => row.startsWith('- '));
    expect(order[0]).toContain('Processeur');
    expect(order[1]).toBe('- Alimentation : Corsair RM650 — 650 W, 80+ Gold, modulaire, format ATX');
  });

  it('says so plainly when the configuration has no component yet', () => {
    expect(buildListingText(build({ lines: [] }), null)).toContain(
      'Composants : aucun composant renseigné.',
    );
  });
});
