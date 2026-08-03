import { cn } from '@/components/ui';
import { formatTierIndex } from '@/lib/tier-list/format';
import type { TierListKind } from '@/lib/tier-list/kinds';
import { TIER_LABELS, TIER_STYLES, type Tier, type TierEntry } from '@/lib/tier-list/types';

/** The tier name alone, used as a cell in the table and inside the fuller badge. */
export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded px-1.5 py-0.5 text-[11px] font-medium',
        TIER_STYLES[tier].badge,
        className,
      )}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}

/**
 * Where a part sits in its ranking, in one line: shown on a component sheet and
 * on the ranked rows of the configurator, so the arbitration happens where the
 * choice is made. Renders nothing when the ranking does not cover the part.
 */
export function TierEntryBadge({
  kind,
  entry,
  className,
}: {
  kind: TierListKind;
  entry: TierEntry | null | undefined;
  className?: string;
}) {
  if (!entry) return null;

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5 text-xs', className)}>
      <TierBadge tier={entry.tier} />
      <span className="text-ink-muted">
        Indice {formatTierIndex(kind, entry.index)} · #{entry.rank} du classement
      </span>
    </span>
  );
}
