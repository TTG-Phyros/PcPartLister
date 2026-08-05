'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, cn } from '@/components/ui';
import { formatPrice } from '@/lib/catalog/format';
import { SUBJECT_LABELS, subjectHref, type SaleSubjectKind } from '@/lib/sales/labels';
import { computeMargin } from '@/lib/sales/pricing';
import type { ListingLine, ListingRow } from '@/lib/sales/queries';
import { ConcludeSale } from './conclude-sale';
import { ListForSale, Unlist } from './listing-actions';

function daysSince(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor((Date.now() - new Date(year!, month! - 1, day!).getTime()) / 86_400_000);
}

function ageLabel(listedAt: string | null): string {
  if (listedAt === null) return 'En vente';
  const age = daysSince(listedAt);
  if (age <= 0) return 'En vente depuis aujourd’hui';
  return `En vente depuis ${age} jour${age > 1 ? 's' : ''}`;
}

/** Title of the fold-out, which says what kind of thing is being opened. */
const CONTENT_TITLES: Record<SaleSubjectKind, string> = {
  build: 'Composants de la configuration',
  lot: 'Unités du lot',
  item: 'Détail du composant',
};

/**
 * One thing waiting for a buyer, shown as a single card whatever it holds: a
 * configuration and a lot appear once, not once per part. Opening the card
 * reveals what is inside and everything that can be done with it — re-price,
 * conclude, or take the listing back.
 */
export function ListingCard({
  listing,
  targetMarginPct,
  defaultPlatformFeePct,
  suggestedPriceCents,
}: {
  listing: ListingRow;
  targetMarginPct: number;
  defaultPlatformFeePct: number;
  /** Price reaching the margin objective, computed server-side. */
  suggestedPriceCents: number;
}) {
  const [open, setOpen] = useState(false);

  // Before any fee: the buyer has not chosen his shipping method yet.
  const expected = listing.askingPriceCents
    ? computeMargin({
        salePriceCents: listing.askingPriceCents,
        shippingCostCents: 0,
        platformFeeCents: 0,
        costCents: listing.costCents,
      })
    : null;

  const panelId = `listing-${listing.subject.kind}-${listing.subject.id}`;

  return (
    <Card className="flex flex-col p-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex items-center gap-3 rounded-xl p-4 text-left transition-colors hover:bg-surface-hover"
      >
        {listing.imageUrl !== null ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-16 shrink-0 rounded-lg bg-surface object-contain"
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">{listing.detail}</p>
            <p className="font-medium break-words">{listing.subject.name}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {ageLabel(listing.listedAt)} · coût de revient {formatPrice(listing.costCents)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-lg font-semibold">
              {listing.askingPriceCents === null
                ? 'Prix libre'
                : formatPrice(listing.askingPriceCents)}
            </p>
            <p className="text-xs text-ink-muted">
              {expected
                ? `marge ${formatPrice(expected.marginCents)} (${expected.marginPct.toFixed(0)} %)`
                : `suggestion ${formatPrice(suggestedPriceCents)}`}
            </p>
          </div>
        </div>

        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={cn(
            'size-5 shrink-0 text-ink-muted transition-transform',
            open && 'rotate-180',
          )}
        >
          <path
            d="M5 8l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div id={panelId} className="flex flex-col gap-4 border-t border-border-subtle p-4">
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium text-ink-muted">
                {CONTENT_TITLES[listing.subject.kind]}
              </h3>
              <Link
                href={subjectHref(listing.subject)}
                className="text-xs text-ink-muted underline underline-offset-4 hover:text-ink"
              >
                Ouvrir la fiche {SUBJECT_LABELS[listing.subject.kind].toLowerCase()}
              </Link>
            </div>

            {listing.lines.length === 0 ? (
              <p className="text-sm text-ink-muted">Rien dedans pour l’instant.</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {listing.lines.map((line) => (
                  <li key={line.key}>
                    <LineRow line={line} />
                  </li>
                ))}
              </ul>
            )}

            {listing.consumablesCents > 0 ? (
              <p className="text-xs text-ink-muted">
                + {formatPrice(listing.consumablesCents)} de consommables (pâte thermique,
                visserie…).
              </p>
            ) : null}
          </section>

          <div className="border-t border-border-subtle pt-4">
            <ListForSale
              subject={listing.subject}
              costCents={listing.costCents}
              suggestedPriceCents={suggestedPriceCents}
              askingPriceCents={listing.askingPriceCents}
              targetMarginPct={targetMarginPct}
              listed
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
            <ConcludeSale
              subject={listing.subject}
              costCents={listing.costCents}
              suggestedPriceCents={suggestedPriceCents}
              askingPriceCents={listing.askingPriceCents}
              targetMarginPct={targetMarginPct}
              defaultPlatformFeePct={defaultPlatformFeePct}
            />
            <Unlist subject={listing.subject} />
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function LineRow({ line }: { line: ListingLine }) {
  return (
    <Link href={line.href} className="flex items-center gap-3 py-2.5 hover:bg-surface-hover">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={line.imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-11 shrink-0 rounded-md bg-surface object-contain"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-muted">{line.label}</span>
          {line.source === 'a_acheter' ? (
            <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[11px] font-medium text-warn">
              À acheter
            </span>
          ) : null}
        </div>
        <p className="truncate font-medium">{line.name}</p>
        <p className="truncate text-xs text-ink-muted">{line.detail}</p>
      </div>

      <span className="shrink-0 text-sm font-medium">{formatPrice(line.priceCents)}</span>
    </Link>
  );
}
