import Link from 'next/link';
import { ComponentImage } from '@/components/catalog/component-image';
import { BatchGroup } from '@/components/inventory/batch-group';
import { Button, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { groupByBatch, type BatchEntry } from '@/lib/batches/group';
import { getBatchHeaders } from '@/lib/batches/queries';
import { formatPrice, formatPriceCompact } from '@/lib/catalog/format';
import { PLATFORM_LABELS } from '@/lib/inventory/labels';
import { CARRIER_LABELS, daysUntil, isLate, trackingLink } from '@/lib/inventory/tracking';
import {
  getInventorySummary,
  listIncomingParcels,
  searchInventory,
  type InventoryRow,
} from '@/lib/inventory/queries';
import { getSalesStats } from '@/lib/sales/queries';
import { getSettings } from '@/lib/settings-store';
import { CATEGORY_LABELS } from '@/lib/specs';

export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return dateFormat.format(new Date(year!, month! - 1, day!));
}

export default async function DashboardPage() {
  const user = await requireUser();
  const settings = await getSettings();

  // Fetched wider than displayed: units that shared a parcel collapse into one
  // row, so it takes more than five of them to fill five lines of a panel.
  const [summary, recent, dormant, parcels, sales] = await Promise.all([
    getInventorySummary(settings.dormant_days),
    searchInventory({ limit: 15 }),
    searchInventory({ dormantDays: settings.dormant_days, limit: 15 }),
    listIncomingParcels(30),
    getSalesStats(),
  ]);

  const batches = await getBatchHeaders(
    [...recent, ...dormant, ...parcels]
      .map(({ item }) => item.purchaseBatchId)
      .filter((id) => id !== null),
  );
  const fold = (rows: InventoryRow[]) =>
    groupByBatch(rows, batches, {
      batchId: ({ item }) => item.purchaseBatchId,
      key: ({ item }) => item.id,
    }).slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tableau de bord</h1>
          <p className="mt-1 text-sm text-ink-muted">Connecté en tant que {user.email}.</p>
        </div>
        <Link href="/stock/nouveau">
          <Button>Ajouter un achat</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Valeur du stock" value={formatPrice(summary.inStockValueCents)} />
        <StatCard label="Unités en stock" value={String(summary.inStockCount)} />
        <StatCard
          label="Immobilisé (non vendu)"
          value={formatPrice(summary.ownedValueCents)}
          hint={`${summary.ownedCount} unité(s)`}
        />
        <StatCard
          label={`Dormants (> ${settings.dormant_days} j)`}
          value={String(summary.dormantCount)}
          hint={summary.dormantCount > 0 ? formatPrice(summary.dormantValueCents) : 'aucun'}
          tone={summary.dormantCount > 0 ? 'warn' : undefined}
        />
      </div>

      {parcels.length > 0 ? <IncomingParcels entries={fold(parcels)} summary={summary} /> : null}

      {sales.count > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="min-w-0 font-medium">Rentabilité</h2>
            <Link
              href="/ventes"
              className="shrink-0 text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              Tout voir
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Ventes" value={String(sales.count)} />
            <StatCard label="Chiffre d’affaires" value={formatPrice(sales.totalRevenueCents)} />
            <StatCard
              label="Marge cumulée"
              value={formatPrice(sales.totalMarginCents)}
              tone={sales.totalMarginCents >= 0 ? 'ok' : 'danger'}
            />
            <StatCard
              label="Marge moyenne"
              value={formatPrice(sales.averageMarginCents)}
              hint={`${sales.averageMarginPct.toFixed(1)} %`}
            />
          </div>
        </section>
      ) : null}

      {summary.byCategory.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-ink-muted">Répartition par catégorie</h2>
          <ul className="flex flex-wrap gap-2">
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
        </Card>
      ) : null}

      {dormant.length > 0 ? (
        <ItemList
          title={`Composants dormants (plus de ${settings.dormant_days} jours en stock)`}
          entries={fold(dormant)}
          href="/stock?dormant=1"
          tone="warn"
        />
      ) : null}

      {recent.length > 0 ? (
        <ItemList title="Derniers achats" entries={fold(recent)} href="/stock" />
      ) : (
        <Card>
          <p className="text-sm text-ink-muted">
            Le stock est vide. Commencez par « Ajouter un achat » — le modèle absent du catalogue
            peut être créé au passage.
          </p>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warn' | 'ok' | 'danger';
}) {
  const toneClass =
    tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : '';
  return (
    <Card className="p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </Card>
  );
}

/**
 * Parcels bought and not received yet, soonest first: what is owed to you is
 * as much part of the day as what sits on the shelf.
 */
function IncomingParcels({
  entries,
  summary,
}: {
  entries: Array<BatchEntry<InventoryRow>>;
  summary: Awaited<ReturnType<typeof getInventorySummary>>;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 font-medium">
          Colis en cours{' '}
          <span className="text-sm font-normal text-ink-muted">
            {summary.inTransitCount} · {formatPrice(summary.inTransitValueCents)}
            {summary.lateParcelCount > 0 ? ` · ${summary.lateParcelCount} en retard` : ''}
          </span>
        </h2>
        <Link
          href="/stock?transit=1"
          className="shrink-0 text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Tout voir
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {entries.map((entry) =>
          entry.kind === 'item' ? (
            <li
              key={entry.key}
              className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised p-2.5"
            >
              <ParcelRow row={entry.row} />
            </li>
          ) : (
            <li key={entry.key}>
              {/* One parcel for the lot: its units share a carrier and a date,
                  so they are one line until you ask for the detail. */}
              <BatchGroup
                batch={entry.batch}
                shownCount={entry.rows.length}
                tone={entry.rows.some(({ item }) => isLate(item)) ? 'warn' : 'transit'}
                note={<ParcelNote rows={entry.rows} />}
              >
                <ul className="divide-y divide-border-subtle">
                  {entry.rows.map((row) => (
                    <li key={row.item.id} className="flex items-center gap-3 p-2.5">
                      <ParcelRow row={row} />
                    </li>
                  ))}
                </ul>
              </BatchGroup>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function ParcelRow({ row }: { row: InventoryRow }) {
  const { item, component } = row;
  const link = trackingLink(item);
  const remaining = item.expectedArrival ? daysUntil(item.expectedArrival) : null;
  const late = isLate(item);

  return (
    <>
      <Link href={`/stock/${item.id}`} className="shrink-0">
        <ComponentImage imagePath={component.imagePath} alt="" className="size-12" />
      </Link>
      <Link href={`/stock/${item.id}`} className="min-w-0 flex-1">
        <span className="block text-xs text-ink-muted">
          {item.shippingCarrier ? CARRIER_LABELS[item.shippingCarrier] : 'Transporteur ?'} ·{' '}
          {PLATFORM_LABELS[item.platform]}
        </span>
        <span className="block truncate font-medium">{component.model}</span>
        <span className={late ? 'block text-xs text-warn' : 'block text-xs text-ink-muted'}>
          {remaining === null
            ? 'Date de livraison non renseignée'
            : late
              ? `En retard de ${-remaining} jour${remaining < -1 ? 's' : ''}`
              : remaining === 0
                ? 'Livraison aujourd’hui'
                : `Livraison dans ${remaining} jour${remaining > 1 ? 's' : ''}`}
        </span>
      </Link>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 text-sm text-brand underline underline-offset-4"
        >
          Suivre
        </a>
      ) : null}
    </>
  );
}

/** Where the parcel is, on the folded row. */
function ParcelNote({ rows }: { rows: InventoryRow[] }) {
  const late = rows.filter(({ item }) => isLate(item)).length;
  const arrival = rows[0]!.item.expectedArrival;
  const remaining = arrival ? daysUntil(arrival) : null;

  if (late > 0) {
    return <p className="text-warn">En retard de {-daysUntil(arrival!)} jours</p>;
  }
  return (
    <p className="text-brand">
      {remaining === null
        ? 'Date de livraison non renseignée'
        : remaining === 0
          ? 'Livraison aujourd’hui'
          : `Livraison dans ${remaining} jour${remaining > 1 ? 's' : ''}`}
    </p>
  );
}

function ItemList({
  title,
  entries,
  href,
  tone,
}: {
  title: string;
  entries: Array<BatchEntry<InventoryRow>>;
  href: string;
  tone?: 'warn';
}) {
  return (
    <section className="flex flex-col gap-3">
      {/* min-w-0 on the heading: a long title must wrap rather than push the
          link past the right edge. */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={tone === 'warn' ? 'min-w-0 font-medium text-warn' : 'min-w-0 font-medium'}>
          {title}
        </h2>
        <Link
          href={href}
          className="shrink-0 text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Tout voir
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {entries.map((entry) =>
          entry.kind === 'item' ? (
            <li key={entry.key}>
              <Link
                href={`/stock/${entry.row.item.id}`}
                className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised p-2.5 transition-colors hover:bg-surface-hover"
              >
                <DashItemRow row={entry.row} />
              </Link>
            </li>
          ) : (
            <li key={entry.key}>
              <BatchGroup batch={entry.batch} shownCount={entry.rows.length} tone={tone}>
                <ul className="divide-y divide-border-subtle">
                  {entry.rows.map((row) => (
                    <li key={row.item.id}>
                      <Link
                        href={`/stock/${row.item.id}`}
                        className="flex items-center gap-3 p-2.5 transition-colors hover:bg-surface-hover"
                      >
                        <DashItemRow row={row} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </BatchGroup>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function DashItemRow({ row }: { row: InventoryRow }) {
  const { item, component } = row;
  return (
    <>
      <ComponentImage imagePath={component.imagePath} alt="" className="size-12 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-ink-muted">
          {CATEGORY_LABELS[component.category]} · {component.brand}
        </span>
        <span className="block truncate font-medium">{component.model}</span>
      </span>
      <span className="shrink-0 text-right text-xs text-ink-muted">
        <span className="block font-medium text-ink">
          {formatPriceCompact(item.purchasePriceCents)}
        </span>
        <span className="block">
          {formatDay(item.purchaseDate)} · {PLATFORM_LABELS[item.platform]}
        </span>
      </span>
    </>
  );
}
