import Link from 'next/link';
import { CreateBuildForm } from '@/components/builds/create-build';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { listBuilds } from '@/lib/builds/queries';
import { BUILD_STATUS_LABELS, BUILD_STATUS_TONES } from '@/lib/builds/types';
import { formatPrice } from '@/lib/catalog/format';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Configurations — PcPartLister' };

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

export default async function BuildsPage() {
  await requireUser();
  const rows = await listBuilds();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Configurations</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Assemblez un PC emplacement par emplacement : vos unités en stock en tête, les modèles
          à acheter en dessous, incompatibilités signalées en direct.
        </p>
      </div>

      <Card>
        <CreateBuildForm />
      </Card>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            Aucune configuration pour le moment. Créez-en une ci-dessus.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/configs/${row.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-raised p-4 transition-colors hover:border-brand/60 hover:bg-surface-hover"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium break-words">{row.name}</span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${BUILD_STATUS_TONES[row.status]}`}
                    >
                      {BUILD_STATUS_LABELS[row.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {dateFormat.format(new Date(row.createdAt))} · {row.lineCount} composant(s) ·{' '}
                    {row.stockCount} en stock · {row.toBuyCount} à acheter
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {formatPrice(row.componentsCents + row.consumablesCents)}
                  </p>
                  <p className="text-xs text-ink-muted">coût total</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
