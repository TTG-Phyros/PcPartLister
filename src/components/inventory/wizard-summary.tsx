'use client';

import type { ReactNode } from 'react';
import { CategoryIcon } from '@/components/catalog/category-icon';
import { Button, cn } from '@/components/ui';
import { formatPrice } from '@/lib/catalog/format';
import {
  CONDITION_LABELS,
  PLATFORM_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/lib/inventory/labels';
import { CARRIER_LABELS, trackingLink } from '@/lib/inventory/tracking';
import {
  MODE_LABELS,
  articleShares,
  purchaseParcel,
  unitCount,
  wizardStatus,
  type WizardArticle,
  type WizardPurchase,
} from '@/lib/inventory/wizard';
import { CATEGORY_LABELS } from '@/lib/specs';

const dayFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return dayFormat.format(new Date(year, month - 1, day));
}

/**
 * What the purchase is about to become, as a card rather than a list of fields.
 *
 * The same component serves the last step and the panel that stays alongside
 * the earlier ones on a wide screen — `compact` only drops what a sidebar has
 * no room for, so the two can never tell different stories.
 */
export function WizardSummary({
  articles,
  purchase,
  totalCents,
  compact = false,
  onEdit,
  onRemove,
}: {
  articles: WizardArticle[];
  purchase: WizardPurchase;
  /** The price as parsed, or null while it is not a usable amount yet. */
  totalCents: number | null;
  compact?: boolean;
  onEdit?: (key: number) => void;
  onRemove?: (key: number) => void;
}) {
  const units = unitCount(articles);
  const shares = articleShares(totalCents, articles);
  const status = wizardStatus(purchase.mode, purchaseParcel(purchase));
  const link = trackingLink({
    shippingCarrier: purchase.shippingCarrier === '' ? null : purchase.shippingCarrier,
    trackingNumber: purchase.trackingNumber,
    trackingUrl: purchase.trackingUrl,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-medium',
            STATUS_TONES[status],
          )}
        >
          {STATUS_LABELS[status]}
        </span>
        <span className="text-sm text-ink-muted">
          {units} unité{units > 1 ? 's' : ''}
          {totalCents !== null ? ` · ${formatPrice(totalCents)}` : ''}
        </span>
      </div>

      {articles.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Aucun article pour l’instant : choisissez un type, puis le composant.
        </p>
      ) : (
        <ul className={cn('flex flex-col', compact ? 'gap-2' : 'gap-3')}>
          {articles.map((article, index) => {
            const share = shares[index] ?? [];
            const lineCents = share.reduce((sum, cents) => sum + cents, 0);
            const perUnit = share[0] ?? 0;

            return (
              <li
                key={article.key}
                className="flex gap-3 rounded-xl border border-border-subtle bg-surface p-3"
              >
                {compact ? (
                  <span className="mt-0.5 shrink-0 text-ink-muted">
                    <CategoryIcon category={article.category} className="size-5" />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={article.component.imageUrl}
                    alt=""
                    className="size-16 shrink-0 rounded-lg bg-surface-raised object-contain"
                  />
                )}

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-xs text-ink-muted">
                    {CATEGORY_LABELS[article.category]} · {article.component.brand}
                    {article.quantity > 1 ? ` · ×${article.quantity}` : ''}
                  </p>
                  <p className="text-sm leading-tight font-medium break-words">
                    {article.component.model}
                  </p>
                  {compact ? null : (
                    <p className="line-clamp-2 text-xs text-ink-muted">
                      {article.component.summary.join(' · ')}
                    </p>
                  )}
                  {share.length > 0 ? (
                    <p className="text-xs text-ink-muted">
                      {article.quantity > 1
                        ? `${formatPrice(lineCents)} · ${formatPrice(perUnit)} par unité`
                        : formatPrice(lineCents)}
                    </p>
                  ) : null}

                  {onEdit || onRemove ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {onEdit ? (
                        <button
                          type="button"
                          onClick={() => onEdit(article.key)}
                          className="min-h-9 rounded-lg border border-border-subtle px-3 text-xs text-ink-muted hover:bg-surface-hover hover:text-ink"
                        >
                          Modifier
                        </button>
                      ) : null}
                      {onRemove ? (
                        <button
                          type="button"
                          onClick={() => onRemove(article.key)}
                          className="min-h-9 rounded-lg px-3 text-xs text-ink-muted hover:bg-surface-hover hover:text-danger"
                        >
                          Retirer
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <dl className="flex flex-col gap-1.5 text-sm">
        <Row label="Achat">
          {MODE_LABELS[purchase.mode]} · {PLATFORM_LABELS[purchase.platform]}
        </Row>
        <Row label="Date">{formatDay(purchase.purchaseDate)}</Row>
        {compact ? null : <Row label="État">{CONDITION_LABELS[purchase.condition]}</Row>}
        {purchase.mode === 'envoi' ? (
          <Row label="Colis">
            {purchase.shippingCarrier === ''
              ? 'Transporteur inconnu'
              : CARRIER_LABELS[purchase.shippingCarrier]}
            {purchase.trackingNumber ? ` · ${purchase.trackingNumber}` : ''}
            {purchase.expectedArrival ? ` · prévu le ${formatDay(purchase.expectedArrival)}` : ''}
            {link ? (
              <>
                {' · '}
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-4 hover:text-ink"
                >
                  suivre
                </a>
              </>
            ) : null}
          </Row>
        ) : null}
      </dl>

      {units > 1 && totalCents !== null ? (
        <p className="rounded-lg bg-surface-hover px-3 py-2 text-xs text-ink-muted">
          {formatPrice(totalCents)} réparti au centime près entre {units} unités : chacune
          portera sa part comme prix d’achat.
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

/** The last thing the wizard says before it writes anything. */
export function WizardActions({
  units,
  pending,
  onAddAnother,
  onFinish,
}: {
  units: number;
  pending: boolean;
  onAddAnother: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row-reverse">
      <Button
        type="button"
        onClick={onFinish}
        disabled={pending || units === 0}
        className="sm:flex-1"
      >
        {pending ? 'Enregistrement…' : `Terminer — ${units} unité${units > 1 ? 's' : ''} au stock`}
      </Button>
      <Button type="button" variant="secondary" onClick={onAddAnother} disabled={pending}>
        Ajouter un autre article
      </Button>
    </div>
  );
}
