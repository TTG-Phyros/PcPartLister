import Link from 'next/link';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { formatPrice } from '@/lib/catalog/format';
import { PLATFORM_LABELS } from '@/lib/inventory/labels';
import { computeSalesStats } from '@/lib/sales/pricing';
import { listSales } from '@/lib/sales/queries';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Ventes — PcPartLister' };

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return dateFormat.format(new Date(year!, month! - 1, day!));
}

export default async function SalesPage() {
  await requireUser();

  const sales = await listSales();
  const stats = computeSalesStats(sales);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ventes</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Marge nette de chaque configuration vendue : prix de vente moins le port, la
          commission et le coût réel des composants.
        </p>
      </div>

      {stats.count === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            Aucune vente enregistrée. Une configuration se vend depuis sa fiche, une fois
            passée en « montée ».
          </p>
        </Card>
      ) : (
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
              <Card className="p-4">
                <p className="text-xs text-ink-muted">Meilleure vente</p>
                <Link
                  href={`/configs/${sales.find((s) => s.id === stats.best!.id)?.buildId ?? ''}`}
                  className="font-medium hover:underline"
                >
                  {stats.best.buildName}
                </Link>
                <p className="text-lg font-semibold text-ok">
                  {formatPrice(stats.best.marginCents)}
                </p>
              </Card>
            ) : null}
            {stats.worst ? (
              <Card className="p-4">
                <p className="text-xs text-ink-muted">Pire vente</p>
                <Link
                  href={`/configs/${sales.find((s) => s.id === stats.worst!.id)?.buildId ?? ''}`}
                  className="font-medium hover:underline"
                >
                  {stats.worst.buildName}
                </Link>
                <p
                  className={`text-lg font-semibold ${
                    stats.worst.marginCents >= 0 ? 'text-ink' : 'text-danger'
                  }`}
                >
                  {formatPrice(stats.worst.marginCents)}
                </p>
              </Card>
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
                        href={`/configs/${sale.buildId}`}
                        className="min-w-0 font-medium break-words hover:underline"
                      >
                        {sale.buildName}
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
                      Vendue {formatDay(sale.saleDate)} sur {PLATFORM_LABELS[sale.platform]}
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
      )}
    </div>
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
