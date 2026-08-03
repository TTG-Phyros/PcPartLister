import Link from 'next/link';
import { Suspense } from 'react';
import { ComponentImage } from '@/components/catalog/component-image';
import { InventoryFilters } from '@/components/inventory/inventory-filters';
import { StatusSelect } from '@/components/inventory/status-select';
import { Button, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { formatPrice, formatPriceCompact, summarizeSpecs } from '@/lib/catalog/format';
import {
  CONDITION_LABELS,
  ITEM_CONDITIONS,
  ITEM_STATUSES,
  PLATFORM_LABELS,
  type ItemCondition,
  type ItemStatus,
} from '@/lib/inventory/labels';
import {
  countInventory,
  getInventorySummary,
  listInventorySockets,
  searchInventory,
} from '@/lib/inventory/queries';
import { getSettings } from '@/lib/settings-store';
import { CATEGORY_LABELS, COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Stock — PcPartLister' };

const PAGE_SIZE = 50;

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

/** Purchase dates are DATE columns, returned as 'YYYY-MM-DD' strings. */
function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return dateFormat.format(new Date(year!, month! - 1, day!));
}

function daysSince(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  const then = new Date(year!, month! - 1, day!).getTime();
  return Math.floor((Date.now() - then) / 86_400_000);
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
  };
  const page = Math.max(1, Number(one('page') ?? 1) || 1);
  const settings = await getSettings();

  const toCents = (value: string | undefined) => {
    if (value === undefined) return undefined;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
  };

  const filters = {
    q: one('q'),
    category: COMPONENT_CATEGORIES.includes(one('category') as ComponentCategory)
      ? (one('category') as ComponentCategory)
      : undefined,
    status: ITEM_STATUSES.includes(one('status') as ItemStatus)
      ? (one('status') as ItemStatus)
      : undefined,
    condition: ITEM_CONDITIONS.includes(one('condition') as ItemCondition)
      ? (one('condition') as ItemCondition)
      : undefined,
    socket: one('socket'),
    minPriceCents: toCents(one('min')),
    maxPriceCents: toCents(one('max')),
    dormantDays: one('dormant') === '1' ? settings.dormant_days : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  const [rows, total, sockets, summary] = await Promise.all([
    searchInventory(filters),
    countInventory(filters),
    listInventorySockets(),
    getInventorySummary(settings.dormant_days),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (targetPage: number) => {
    const next = new URLSearchParams();
    for (const key of ['q', 'category', 'status', 'condition', 'socket', 'min', 'max', 'dormant']) {
      const value = one(key);
      if (value) next.set(key, value);
    }
    if (targetPage > 1) next.set('page', String(targetPage));
    const qs = next.toString();
    return qs ? `/stock?${qs}` : '/stock';
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Stock</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {total} unité{total > 1 ? 's' : ''}
            {pageCount > 1 ? ` · page ${page} sur ${pageCount}` : ''}
          </p>
        </div>
        <Link href="/stock/nouveau">
          <Button>Ajouter un achat</Button>
        </Link>
      </div>

      <StockSummary summary={summary} dormantDays={settings.dormant_days} />

      <Suspense fallback={null}>
        <InventoryFilters sockets={sockets} />
      </Suspense>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            Aucune unité ne correspond. Le stock se remplit depuis « Ajouter un achat ».
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ item, component }) => {
            const age = daysSince(item.purchaseDate);
            const dormant = item.status === 'en_stock' && age > settings.dormant_days;
            return (
              <li key={item.id}>
                <Card className="flex gap-3 p-3">
                  <Link href={`/stock/${item.id}`} className="shrink-0">
                    <ComponentImage
                      imagePath={component.imagePath}
                      alt={`${component.brand} ${component.model}`}
                      className="size-20"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link href={`/stock/${item.id}`} className="min-w-0">
                        <p className="text-xs text-ink-muted">
                          {CATEGORY_LABELS[component.category]} · {component.brand}
                        </p>
                        <p className="font-medium break-words hover:underline">
                          {component.model}
                        </p>
                      </Link>
                      <StatusSelect id={item.id} status={item.status} />
                    </div>

                    <p className="line-clamp-1 text-xs text-ink-muted">
                      {summarizeSpecs(component.specs).join(' · ')}
                    </p>

                    <p className="text-xs text-ink-muted">
                      <span className="font-medium text-ink">
                        {formatPriceCompact(item.purchasePriceCents)}
                      </span>{' '}
                      · {formatDay(item.purchaseDate)} · {PLATFORM_LABELS[item.platform]} ·{' '}
                      {CONDITION_LABELS[item.condition]}
                      {dormant ? (
                        <span className="ml-1 rounded bg-warn/15 px-1.5 py-0.5 text-warn">
                          dormant depuis {age} j
                        </span>
                      ) : null}
                    </p>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          {page > 1 ? (
            <Link href={pageHref(page - 1)}>
              <Button variant="secondary">Précédent</Button>
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-muted">
            Page {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)}>
              <Button variant="secondary">Suivant</Button>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

function StockSummary({
  summary,
  dormantDays,
}: {
  summary: Awaited<ReturnType<typeof getInventorySummary>>;
  dormantDays: number;
}) {
  if (summary.ownedCount === 0 && summary.soldCount === 0) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Valeur du stock" value={formatPrice(summary.inStockValueCents)} />
        <Stat label="Unités en stock" value={String(summary.inStockCount)} />
        <Stat
          label="Immobilisé (non vendu)"
          value={formatPrice(summary.ownedValueCents)}
          hint={`${summary.ownedCount} unité(s)`}
        />
        <Stat
          label={`Dormants (> ${dormantDays} j)`}
          value={String(summary.dormantCount)}
          hint={summary.dormantCount > 0 ? formatPrice(summary.dormantValueCents) : undefined}
          tone={summary.dormantCount > 0 ? 'warn' : undefined}
        />
      </div>

      {summary.byCategory.length > 0 ? (
        <ul className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
          {summary.byCategory.map((row) => (
            <li key={row.category}>
              <Link
                href={`/stock?category=${row.category}`}
                className="flex items-baseline gap-1.5 rounded-md bg-surface-hover px-2 py-1 text-xs hover:bg-border-subtle"
              >
                <span className="text-ink-muted">{CATEGORY_LABELS[row.category]}</span>
                <span className="font-medium">{row.count}</span>
                <span className="text-ink-muted">{formatPriceCompact(row.valueCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warn';
}) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={tone === 'warn' ? 'text-lg font-semibold text-warn' : 'text-lg font-semibold'}>
        {value}
      </p>
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
