import Link from 'next/link';
import { ComponentImage } from '@/components/catalog/component-image';
import { CreateLotForm } from '@/components/lots/lot-header';
import { ConcludeSale } from '@/components/sales/conclude-sale';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { suggestedSalePriceCents } from '@/lib/builds/pricing';
import { formatPrice } from '@/lib/catalog/format';
import { PLATFORM_LABELS } from '@/lib/inventory/labels';
import { listLots } from '@/lib/lots/queries';
import { SHIPPING_METHOD_LABELS, SUBJECT_LABELS, subjectHref } from '@/lib/sales/labels';
import { computeMargin, computeSalesStats } from '@/lib/sales/pricing';
import {
  listListings,
  listSales,
  summarizeListings,
  type ListingRow,
} from '@/lib/sales/queries';
import { getSettings } from '@/lib/settings-store';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Ventes — PcPartLister' };

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return dateFormat.format(new Date(year!, month! - 1, day!));
}

function daysSince(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor((Date.now() - new Date(year!, month! - 1, day!).getTime()) / 86_400_000);
}

export default async function SalesPage() {
  await requireUser();

  const [sales, listings, lots, settings] = await Promise.all([
    listSales(),
    listListings(),
    listLots(),
    getSettings(),
  ]);
  const stats = computeSalesStats(sales);
  const listed = summarizeListings(listings);
  // Lots still being assembled: announced ones are already in `listings`.
  const drafts = lots.filter((lot) => lot.status === 'brouillon');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ventes</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Ce qui attend un acheteur, puis la marge nette de chaque vente conclue : prix de vente
          moins le port, la commission et le coût réel des composants.
        </p>
      </div>

      {listed.count === 0 && stats.count === 0 && drafts.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            Rien en vente ni vendu pour l’instant. Le bouton « Mettre en vente » se trouve sur la
            fiche d’une unité du stock et sur celle d’une configuration montée ; pour plusieurs
            pièces d’un coup, créez un lot ci-dessous.
          </p>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">Nouveau lot</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Plusieurs pièces qui partent ensemble, à un seul acheteur : un lot se remplit d’unités
            du stock, s’annonce à un prix global et se vend d’un bloc.
          </p>
        </div>
        <CreateLotForm />

        {drafts.length > 0 ? (
          <ul className="flex flex-col gap-2 border-t border-border-subtle pt-3">
            {drafts.map((lot) => (
              <li key={lot.id}>
                <Link
                  href={`/lots/${lot.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover"
                >
                  <span className="min-w-0">
                    <span className="block font-medium break-words">{lot.name}</span>
                    <span className="block text-xs text-ink-muted">
                      En préparation · {lot.lineCount} unité{lot.lineCount > 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <span className="block font-medium">{formatPrice(lot.costCents)}</span>
                    <span className="block text-xs text-ink-muted">coût de revient</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {listings.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-medium">
              En vente{' '}
              <span className="text-sm font-normal text-ink-muted">
                {listed.count} · {formatPrice(listed.costCents)} immobilisés
                {listed.askingCents > 0 ? ` · ${formatPrice(listed.askingCents)} demandés` : ''}
              </span>
            </h2>
          </div>
          <ul className="flex flex-col gap-3">
            {listings.map((listing) => (
              <li key={`${listing.subject.kind}:${listing.subject.id}`}>
                <ListingCard
                  listing={listing}
                  targetMarginPct={settings.target_margin_pct}
                  defaultPlatformFeePct={settings.default_platform_fee_pct}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stats.count > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Ventes" value={String(stats.count)} />
            <Stat label="Chiffre d’affaires" value={formatPrice(stats.totalRevenueCents)} />
            <Stat
              label="Marge cumulée"
              value={formatPrice(stats.totalMarginCents)}
              tone={stats.totalMarginCents >= 0 ? 'ok' : 'danger'}
            />
            <Stat
              label="Marge moyenne"
              value={formatPrice(stats.averageMarginCents)}
              hint={`${stats.averageMarginPct.toFixed(1)} % en moyenne`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {stats.best ? (
              <Extreme label="Meilleure vente" extreme={stats.best} sales={sales} tone="ok" />
            ) : null}
            {stats.worst ? (
              <Extreme label="Pire vente" extreme={stats.worst} sales={sales} />
            ) : null}
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="font-medium">Historique</h2>
            <ul className="flex flex-col gap-3">
              {sales.map((sale) => (
                <li key={sale.id}>
                  <Card className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <Link
                        href={subjectHref(sale.subject)}
                        className="min-w-0 font-medium break-words hover:underline"
                      >
                        {sale.subject.name}
                      </Link>
                      <span
                        className={`shrink-0 text-lg font-semibold ${
                          sale.margin.marginCents >= 0 ? 'text-ok' : 'text-danger'
                        }`}
                      >
                        {formatPrice(sale.margin.marginCents)} (
                        {sale.margin.marginPct.toFixed(1)} %)
                      </span>
                    </div>

                    <p className="text-xs text-ink-muted">
                      {SUBJECT_LABELS[sale.subject.kind]} vendu
                      {sale.subject.kind === 'build' ? 'e' : ''} {formatDay(sale.saleDate)} sur{' '}
                      {PLATFORM_LABELS[sale.platform]} ·{' '}
                      {SHIPPING_METHOD_LABELS[sale.shippingMethod]}
                      {sale.trackingNumber ? ` · nº ${sale.trackingNumber}` : ''}
                    </p>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                      <Cell label="Prix de vente" value={formatPrice(sale.margin.salePriceCents)} />
                      <Cell
                        label="Port + commission"
                        value={formatPrice(
                          sale.margin.shippingCostCents + sale.margin.platformFeeCents,
                        )}
                      />
                      <Cell label="Composants" value={formatPrice(sale.componentsCents)} />
                      <Cell label="Consommables" value={formatPrice(sale.consumablesCents)} />
                    </dl>

                    {sale.buyerNotes ? (
                      <p className="text-sm whitespace-pre-line text-ink-muted">
                        {sale.buyerNotes}
                      </p>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

/**
 * One thing waiting for a buyer: what it cost, what is being asked, and the
 * margin that price would leave — then the button that closes the deal.
 */
function ListingCard({
  listing,
  targetMarginPct,
  defaultPlatformFeePct,
}: {
  listing: ListingRow;
  targetMarginPct: number;
  defaultPlatformFeePct: number;
}) {
  const suggested = suggestedSalePriceCents(listing.costCents, targetMarginPct);
  const age = listing.listedAt ? daysSince(listing.listedAt) : null;
  // Before any fee: the buyer has not chosen his shipping method yet.
  const expected = listing.askingPriceCents
    ? computeMargin({
        salePriceCents: listing.askingPriceCents,
        shippingCostCents: 0,
        platformFeeCents: 0,
        costCents: listing.costCents,
      })
    : null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex gap-3">
        {listing.imagePath !== null ? (
          <Link href={subjectHref(listing.subject)} className="shrink-0">
            <ComponentImage imagePath={listing.imagePath} alt="" className="size-16" />
          </Link>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">{listing.detail}</p>
            <Link
              href={subjectHref(listing.subject)}
              className="font-medium break-words hover:underline"
            >
              {listing.subject.name}
            </Link>
            <p className="mt-1 text-xs text-ink-muted">
              {age === null
                ? 'En vente'
                : age === 0
                  ? 'En vente depuis aujourd’hui'
                  : `En vente depuis ${age} jour${age > 1 ? 's' : ''}`}{' '}
              · coût de revient {formatPrice(listing.costCents)}
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
                : `suggestion ${formatPrice(suggested)}`}
            </p>
          </div>
        </div>
      </div>

      <ConcludeSale
        subject={listing.subject}
        costCents={listing.costCents}
        suggestedPriceCents={suggested}
        askingPriceCents={listing.askingPriceCents}
        targetMarginPct={targetMarginPct}
        defaultPlatformFeePct={defaultPlatformFeePct}
      />
    </Card>
  );
}

function Extreme({
  label,
  extreme,
  sales,
  tone,
}: {
  label: string;
  extreme: { id: string; name: string; marginCents: number };
  sales: Awaited<ReturnType<typeof listSales>>;
  tone?: 'ok';
}) {
  const sale = sales.find((row) => row.id === extreme.id);
  const positive = extreme.marginCents >= 0;

  return (
    <Card className="p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      {sale ? (
        <Link href={subjectHref(sale.subject)} className="font-medium hover:underline">
          {extreme.name}
        </Link>
      ) : (
        <p className="font-medium">{extreme.name}</p>
      )}
      <p
        className={`text-lg font-semibold ${
          tone === 'ok' ? 'text-ok' : positive ? 'text-ink' : 'text-danger'
        }`}
      >
        {formatPrice(extreme.marginCents)}
      </p>
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
  tone?: 'ok' | 'danger';
}) {
  const toneClass = tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : '';
  return (
    <Card className="p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </Card>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
