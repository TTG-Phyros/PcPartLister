import { cn } from '@/components/ui';
import { formatGpuIndex } from '@/lib/tier-list/format';
import { GPU_TIER_LABELS, GPU_TIER_STYLES, type GpuTier, type GpuTierEntry } from '@/lib/tier-list/types';

/** The tier name alone, used as a cell in the table and inside the fuller badge. */
export function TierBadge({ tier, className }: { tier: GpuTier; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded px-1.5 py-0.5 text-[11px] font-medium',
        GPU_TIER_STYLES[tier].badge,
        className,
      )}
    >
      {GPU_TIER_LABELS[tier]}
    </span>
  );
}

/**
 * Where a card sits in the ranking, in one line: shown on a GPU sheet and on the
 * GPU rows of the configurator, so the arbitration happens where the choice is
 * made. Renders nothing when the ranking does not cover the card.
 */
export function GpuTierBadge({
  entry,
  className,
}: {
  entry: GpuTierEntry | null | undefined;
  className?: string;
}) {
  if (!entry) return null;

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5 text-xs', className)}>
      <TierBadge tier={entry.tier} />
      <span className="text-ink-muted">
        Indice {formatGpuIndex(entry.index)} · #{entry.rank} du classement
      </span>
    </span>
  );
}
