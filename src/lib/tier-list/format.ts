import { TIER_LIST_CONFIG, type TierListKind } from '@/lib/tier-list/kinds';

const indexFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Performance index as its own ranking states it: a percentage of the reference
 * card for the GPUs, a bare 720p index for the processors.
 */
export function formatTierIndex(kind: TierListKind, index: number): string {
  return `${indexFormat.format(index)}${TIER_LIST_CONFIG[kind].indexSuffix}`;
}
