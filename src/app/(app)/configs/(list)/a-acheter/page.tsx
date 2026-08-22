import Link from 'next/link';
import { ComponentImage } from '@/components/catalog/component-image';
import { Alert, Button, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { getBuildName } from '@/lib/builds/queries';
import { getShoppingList, type ShoppingNeed, type ShoppingRow } from '@/lib/builds/shopping';
import { BUILD_STATUS_LABELS, BUILD_STATUS_TONES } from '@/lib/builds/types';
import { formatPrice, formatPriceCompact } from '@/lib/catalog/format';
import { CATEGORY_LABELS } from '@/lib/specs';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'À acheter — PcPartLister' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ToBuyPage({
  searchParams,
}: {
  searchParams: Promise<{ achete?: string }>;
}) {
  await requireUser();

  // `achete` carries the configuration the purchase completed — it comes from a
  // URL, so it is only trusted as far as looking like an id.
  const { achete } = await searchParams;
  const completedBuildId = achete && UUID.test(achete) ? achete : null;
  const [list, purchasedFor] = await Promise.all([
    getShoppingList(),
    completedBuildId ? getBuildName(completedBuildId) : null,
  ]);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">
        Les modèles réclamés par une configuration dont aucune unité n’est encore achetée. Un
        même composant demandé par deux configurations tient sur une ligne.
      </p>

      {/* Coming back from the purchase form: the part left this list for the stock. */}
      {completedBuildId ? (
        <Alert tone="success">
          Unité ajoutée au stock
          {purchasedFor ? (
            <>
              {' '}
              et rattachée à{' '}
              <Link
                href={`/configs/${completedBuildId}`}
                className="underline underline-offset-4"
              >
                {purchasedFor}
              </Link>
            </>
          ) : null}
          .
        </Alert>
      ) : null}

      {list.rows.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            Rien à commander : chaque emplacement rempli de vos configurations en cours pointe sur
            une unité que vous possédez déjà.
          </p>
        </Card>
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Modèles à sourcer" value={String(list.modelCount)} />
            <Stat label="Unités à acheter" value={String(list.unitCount)} />
            <Stat label="Budget estimé" value={formatPrice(list.estimatedTotalCents)} />
            <Stat
              label="Configurations en attente"
              value={String(list.buildCount)}
              hint="au moins une pièce manquante"
            />
          </Card>

          <ul className="flex flex-col gap-3">
            {list.rows.map((row) => (
              <li key={row.catalogComponentId}>
                <PartToBuy row={row} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PartToBuy({ row }: { row: ShoppingRow }) {
  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex gap-3">
        <Link href={`/catalogue/${row.catalogComponentId}`} className="shrink-0">
          <ComponentImage
            imagePath={row.imagePath}
            alt={`${row.brand} ${row.model}`}
            className="size-20"
          />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link href={`/catalogue/${row.catalogComponentId}`} className="min-w-0">
              <p className="text-xs text-ink-muted">
                {CATEGORY_LABELS[row.category]} · {row.brand}
              </p>
              <p className="font-medium break-words hover:underline">{row.model}</p>
            </Link>
            <div className="shrink-0 text-right">
              <p className="font-semibold">{formatPriceCompact(row.estimatedTotalCents)}</p>
              <p className="text-xs text-ink-muted">
                estimé{row.quantity > 1 ? ` · ${row.quantity} unités` : ''}
              </p>
            </div>
          </div>

          <p className="line-clamp-1 text-xs text-ink-muted">{row.summary.join(' · ')}</p>
        </div>
      </div>

      {/* Bought since the line was drafted: attaching the unit costs nothing,
          ordering another one costs the price of the part. */}
      {row.availableStock > 0 ? (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
          {row.availableStock} unité{row.availableStock > 1 ? 's' : ''} de ce modèle vous{' '}
          {row.availableStock > 1
            ? 'appartiennent déjà et sont libres'
            : 'appartient déjà et est libre'}{' '}
          : rattachez-l{row.availableStock > 1 ? 'es' : 'a'} depuis la configuration plutôt que de
          racheter.
        </p>
      ) : null}

      <details
        className="rounded-lg border border-border-subtle"
        // A single claimant needs no unfolding: the purchase is one tap away.
        open={row.needs.length === 1}
      >
        <summary className="cursor-pointer px-3 py-2 text-sm text-ink-muted">
          Demandé par {row.needs.length} configuration{row.needs.length > 1 ? 's' : ''}
        </summary>
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {row.needs.map((need) => (
            <li key={need.lineId} className="p-3">
              <NeedRow need={need} catalogComponentId={row.catalogComponentId} />
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

function NeedRow({
  need,
  catalogComponentId,
}: {
  need: ShoppingNeed;
  catalogComponentId: string;
}) {
  // The purchase form fills the line it came from — but only a line asking for a
  // single unit, which one purchase can actually satisfy.
  const params = new URLSearchParams({ modele: catalogComponentId });
  if (need.quantity === 1) params.set('ligne', need.lineId);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/configs/${need.buildId}`}
            className="min-w-0 font-medium break-words hover:underline"
          >
            {need.buildName}
          </Link>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${BUILD_STATUS_TONES[need.buildStatus]}`}
          >
            {BUILD_STATUS_LABELS[need.buildStatus]}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-ink-muted">
          {CATEGORY_LABELS[need.slot]}
          {need.quantity > 1 ? ` · ${need.quantity} unités` : ''} ·{' '}
          {need.estimatedPriceCents === null
            ? 'sans estimation'
            : `estimé à ${formatPriceCompact(need.estimatedPriceCents)}`}
        </p>
      </div>

      <Link href={`/stock/nouveau?${params}`} className="shrink-0">
        <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs">
          Acheter
        </Button>
      </Link>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
