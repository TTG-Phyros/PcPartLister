import { formatCapacity, formatPriceCompact } from '@/lib/catalog/format';
import { CONDITION_LABELS } from '@/lib/inventory/labels';
import { CATEGORY_LABELS, type ComponentSpecs } from '@/lib/specs';
import { SLOT_ORDER, type BuildDetail, type BuildLine } from './types';

/**
 * Plain text describing a configuration, meant to be pasted into an AI prompt
 * that will write the actual listing. Nothing is invented here: every line
 * comes from the configuration already loaded on the page.
 *
 * Deliberately free of any markup — the destination is a chat box, not a
 * renderer — and deliberately silent about anything missing: a spec left blank
 * in the catalog simply does not appear, rather than showing as an empty field
 * the AI would then have to guess around.
 */

/** The instruction the text opens with, so the whole block is usable as is. */
export const LISTING_PROMPT_HEADER =
  'Rédige une annonce de vente attractive pour cette configuration PC en te basant sur les composants suivants :';

/**
 * The price shown to the AI, in order of how settled it is: what the sale
 * fetched, then what the listing asks, then the objective. NULL when none of
 * the three is set — the ad is then written without a price, which is a normal
 * way to sell.
 */
export type ListingPrice = { label: string; priceCents: number };

export function listingPrice(
  build: Pick<BuildDetail, 'targetPriceCents' | 'askingPriceCents'>,
  salePriceCents: number | null,
): ListingPrice | null {
  if (salePriceCents !== null) return { label: 'Prix de vente', priceCents: salePriceCents };
  if (build.askingPriceCents !== null) {
    return { label: 'Prix demandé', priceCents: build.askingPriceCents };
  }
  if (build.targetPriceCents !== null) {
    return { label: 'Prix objectif', priceCents: build.targetPriceCents };
  }
  return null;
}

/** « 1 slot M.2 », « 2 slots M.2 » : the count decides the plural. */
function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`;
}

/** Case-insensitive, so a chipset already spelled out in the model is not repeated. */
function alreadyNamed(text: string, value: string): boolean {
  return text.toLowerCase().includes(value.trim().toLowerCase());
}

/**
 * The specs worth putting in an ad, per category — what a buyer scans for,
 * not what the compatibility engine needs. Optional fields are pushed only
 * when they hold something.
 */
function listingSpecs(specs: ComponentSpecs, name: string): string[] {
  switch (specs.category) {
    case 'cpu': {
      const out = [`${specs.cores} cœurs / ${specs.threads} threads`];
      out.push(
        specs.boostClockGhz
          ? `jusqu'à ${specs.boostClockGhz} GHz`
          : `${specs.baseClockGhz} GHz`,
      );
      out.push(`socket ${specs.socket}`, `${specs.tdpW} W`);
      // Only worth saying when there is one: « sans IGP » sells nothing.
      if (specs.integratedGraphics) out.push('graphiques intégrés');
      return out;
    }
    case 'motherboard': {
      const out = [
        `socket ${specs.socket}`,
        `chipset ${specs.chipset}`,
        `format ${specs.formFactor}`,
        `${plural(specs.ramSlots, 'slot')} ${specs.ramType}`,
      ];
      if (specs.m2Slots > 0) out.push(`${plural(specs.m2Slots, 'slot')} M.2`);
      if (specs.sataPorts > 0) out.push(`${plural(specs.sataPorts, 'port')} SATA`);
      return out;
    }
    case 'ram': {
      const totalGb = specs.capacityPerStickGb * specs.sticks;
      const out = [
        `${totalGb} Go (${specs.sticks}×${specs.capacityPerStickGb} Go)`,
        specs.ramType,
        `${specs.speedMhz} MHz`,
      ];
      if (specs.casLatency) out.push(`CL${specs.casLatency}`);
      return out;
    }
    case 'gpu': {
      const out = [`${specs.vramGb} Go de VRAM`];
      if (!alreadyNamed(name, specs.chipset)) out.unshift(`puce ${specs.chipset}`);
      out.push(`${specs.tdpW} W`);
      return out;
    }
    case 'storage':
      return [specs.storageType, formatCapacity(specs.capacityGb)];
    case 'psu': {
      const out = [`${specs.wattage} W`];
      if (specs.efficiency !== 'Aucune') out.push(specs.efficiency);
      if (specs.modular === 'oui') out.push('modulaire');
      if (specs.modular === 'semi') out.push('semi-modulaire');
      out.push(`format ${specs.formFactor}`);
      return out;
    }
    case 'case':
      return [`format ${specs.supportedFormFactors.join(' / ')}`];
    case 'cooling': {
      const out = [
        specs.coolingType === 'aio'
          ? 'watercooling AIO'
          : specs.coolingType === 'air'
            ? 'refroidissement à air'
            : 'ventilateur',
      ];
      if (specs.radiatorSizeMm) out.push(`radiateur ${specs.radiatorSizeMm} mm`);
      if (specs.heightMm) out.push(`${specs.heightMm} mm de haut`);
      if (specs.maxTdpW) out.push(`jusqu'à ${specs.maxTdpW} W dissipés`);
      return out;
    }
    case 'misc':
      return specs.description ? [specs.description] : [];
  }
}

/** One component, one line: category, model, then whatever specs are known. */
export function listingLine(line: BuildLine): string {
  const name = `${line.brand} ${line.model}`.trim();
  const details = listingSpecs(line.specs, name);
  if (line.condition) details.push(`état : ${CONDITION_LABELS[line.condition]}`);

  const label = `- ${CATEGORY_LABELS[line.slot]} : ${name}`;
  return details.length > 0 ? `${label} — ${details.join(', ')}` : label;
}

/** Reading order of the configurator, so the text matches the page above it. */
function bySlotOrder(a: BuildLine, b: BuildLine): number {
  return SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot);
}

export function buildListingText(
  build: Pick<BuildDetail, 'name' | 'lines' | 'targetPriceCents' | 'askingPriceCents'>,
  salePriceCents: number | null = null,
): string {
  const price = listingPrice(build, salePriceCents);
  const lines = [...build.lines].sort(bySlotOrder).map(listingLine);

  const blocks = [
    LISTING_PROMPT_HEADER,
    [
      `Configuration PC à vendre : ${build.name}`,
      ...(price ? [`${price.label} : ${formatPriceCompact(price.priceCents)}`] : []),
    ].join('\n'),
    lines.length > 0
      ? ['Composants :', ...lines].join('\n')
      : 'Composants : aucun composant renseigné.',
  ];

  return blocks.join('\n\n');
}
