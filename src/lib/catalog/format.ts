import type { ComponentSpecs } from '@/lib/specs';

const priceFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

export function formatPrice(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return priceFormat.format(cents / 100);
}

export function formatPriceCompact(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  const euros = cents / 100;
  return `${Number.isInteger(euros) ? euros : euros.toFixed(2)} €`;
}

/**
 * Short, human-readable highlights of a component, shown as chips in lists and
 * in the configurator. Deliberately lossy: the full specs live on the detail page.
 */
export function summarizeSpecs(specs: ComponentSpecs): string[] {
  switch (specs.category) {
    case 'cpu':
      return [
        specs.socket,
        `${specs.cores}C/${specs.threads}T`,
        specs.boostClockGhz ? `${specs.boostClockGhz} GHz` : `${specs.baseClockGhz} GHz`,
        `${specs.tdpW} W`,
        specs.integratedGraphics ? 'IGP' : 'sans IGP',
      ];
    case 'motherboard':
      return [
        specs.socket,
        specs.chipset,
        specs.formFactor,
        `${specs.ramType} ×${specs.ramSlots}`,
        `${specs.sataPorts} SATA`,
        `${specs.m2Slots} M.2`,
      ];
    case 'ram':
      return [
        specs.ramType,
        `${specs.sticks}×${specs.capacityPerStickGb} Go`,
        `${specs.speedMhz} MHz`,
        ...(specs.casLatency ? [`CL${specs.casLatency}`] : []),
      ];
    case 'gpu':
      return [`${specs.vramGb} Go`, `${specs.lengthMm} mm`, `${specs.tdpW} W`];
    case 'storage':
      return [specs.storageType, formatCapacity(specs.capacityGb), specs.formFactor];
    case 'psu':
      return [`${specs.wattage} W`, specs.efficiency, `modulaire : ${specs.modular}`, specs.formFactor];
    case 'case':
      return [
        specs.supportedFormFactors.join(' / '),
        `GPU ≤ ${specs.maxGpuLengthMm} mm`,
        `ventirad ≤ ${specs.maxCoolerHeightMm} mm`,
      ];
    case 'cooling':
      return [
        specs.coolingType === 'aio' ? 'AIO' : specs.coolingType === 'air' ? 'Air' : 'Ventilateur',
        ...(specs.heightMm ? [`${specs.heightMm} mm`] : []),
        ...(specs.radiatorSizeMm ? [`radiateur ${specs.radiatorSizeMm} mm`] : []),
        ...(specs.maxTdpW ? [`≤ ${specs.maxTdpW} W`] : []),
      ];
    case 'misc':
      return specs.description ? [specs.description] : [];
  }
}

export function formatCapacity(gb: number): string {
  return gb >= 1000 && gb % 1000 === 0 ? `${gb / 1000} To` : `${gb} Go`;
}

/** Socket(s) a component relates to, used by the catalog socket filter. */
export function socketsOf(specs: ComponentSpecs): string[] {
  if (specs.category === 'cpu' || specs.category === 'motherboard') return [specs.socket];
  if (specs.category === 'cooling') return specs.supportedSockets;
  return [];
}
