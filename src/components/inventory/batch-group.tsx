import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/components/ui';
import type { BatchHeader } from '@/lib/batches/types';
import { formatPrice } from '@/lib/catalog/format';
import { PLATFORM_LABELS } from '@/lib/inventory/labels';
import { CARRIER_LABELS, trackingLink } from '@/lib/inventory/tracking';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return dateFormat.format(new Date(year!, month! - 1, day!));
}

/**
 * The units of one parcel, folded into a single row of whatever list they
 * appear in. Collapsed by default: a batch of five should cost one line of the
 * stock, not five, and the summary carries enough to decide without opening.
 *
 * Native `<details>`, so it works with no client JavaScript. Links live in the
 * body rather than the summary, where a click would toggle the panel as a side
 * effect of following them.
 */
export function BatchGroup({
  batch,
  shownCount,
  note,
  tone,
  children,
}: {
  batch: BatchHeader;
  /** Units of the batch present in this list, which filters may narrow. */
  shownCount: number;
  /** Context line, such as where the parcel is on the dashboard. */
  note?: ReactNode;
  tone?: 'warn' | 'transit';
  children: ReactNode;
}) {
  const link = trackingLink(batch);
  const partial = shownCount < batch.itemCount;

  return (
    <details
      className={cn(
        'group overflow-hidden rounded-xl border bg-surface-raised',
        tone === 'warn'
          ? 'border-warn/40'
          : tone === 'transit'
            ? 'border-brand/40'
            : 'border-border-subtle',
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3 marker:content-[''] hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
        <Chevron />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-muted">
            Arrivage · {formatDay(batch.purchaseDate)} · {PLATFORM_LABELS[batch.platform]}
          </p>
          <p className="font-medium break-words">{batch.label}</p>
          <p className="text-xs text-ink-muted">
            <span className="font-medium text-ink">
              {shownCount} unité{shownCount > 1 ? 's' : ''}
            </span>
            {partial ? ` sur ${batch.itemCount}` : ''} · {formatPrice(batch.totalPriceCents)} le lot
            {batch.shippingCarrier ? ` · ${CARRIER_LABELS[batch.shippingCarrier]}` : ''}
          </p>
          {note ? <div className="text-xs">{note}</div> : null}
        </div>
      </summary>

      <div className="border-t border-border-subtle">
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs">
          <Link
            href={`/arrivages/${batch.id}`}
            className="text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            Gérer le lot
          </Link>
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              className="text-brand underline underline-offset-4"
            >
              Suivre le colis
            </a>
          ) : null}
          {batch.trackingNumber ? (
            <span className="text-ink-muted">
              N° <span className="font-mono text-ink">{batch.trackingNumber}</span>
            </span>
          ) : null}
        </div>
        {children}
      </div>
    </details>
  );
}

/** Turns down when the panel opens; the only affordance the summary needs. */
function Chevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-90"
    >
      <path
        d="M7 4l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
