import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ComponentImage } from '@/components/catalog/component-image';
import {
  BatchMetaForm,
  DeleteBatch,
  MarkBatchReceived,
} from '@/components/inventory/batch-header';
import { Alert, Button, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { getPurchaseBatchDetail } from '@/lib/batches/queries';
import { formatPrice } from '@/lib/catalog/format';
import {
  CONDITION_LABELS,
  PLATFORM_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/lib/inventory/labels';
import { CARRIER_LABELS, daysUntil, trackingLink } from '@/lib/inventory/tracking';
import { CATEGORY_LABELS } from '@/lib/specs';

export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return dateFormat.format(new Date(year!, month! - 1, day!));
}

export default async function PurchaseBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const batch = await getPurchaseBatchDetail(id);
  if (!batch) notFound();

  const pending = batch.lines.filter((line) => line.status === 'en_transit').length;
  const link = trackingLink(batch);
  const remaining = batch.expectedArrival ? daysUntil(batch.expectedArrival) : null;
  const late = pending > 0 && remaining !== null && remaining < 0;
  const hasParcel = Boolean(
    batch.shippingCarrier || batch.trackingNumber || batch.trackingUrl || batch.expectedArrival,
  );
  // The units were given their share on the day the batch was created. Anything
  // else today means one was deleted or re-priced by hand — worth saying out
  // loud rather than quietly showing two numbers that disagree.
  const drift = batch.splitTotalCents - batch.totalPriceCents;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href="/stock" className="text-sm text-ink-muted hover:text-ink">
          ← Stock
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{batch.label}</h1>
          <span
            className={
              pending > 0
                ? 'rounded-md border border-brand/50 px-2 py-1 text-xs font-medium text-brand'
                : 'rounded-md bg-ok/15 px-2 py-1 text-xs font-medium text-ok'
            }
          >
            {pending > 0 ? `${pending} en transit` : 'Reçu'}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {batch.lines.length} unité{batch.lines.length > 1 ? 's' : ''} ·{' '}
          {formatPrice(batch.totalPriceCents)} · acheté le {formatDay(batch.purchaseDate)} sur{' '}
          {PLATFORM_LABELS[batch.platform]}
        </p>
      </div>

      {drift !== 0 ? (
        <Alert tone="warning">
          Les unités totalisent {formatPrice(batch.splitTotalCents)}, contre{' '}
          {formatPrice(batch.totalPriceCents)} payés — écart de {formatPrice(Math.abs(drift))}. Une
          unité a été supprimée ou son prix modifié à la main depuis la saisie.
        </Alert>
      ) : null}

      {hasParcel || pending > 0 ? (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">Suivi du colis</h2>
            <span className="text-sm text-ink-muted">
              {batch.shippingCarrier ? CARRIER_LABELS[batch.shippingCarrier] : 'Transporteur inconnu'}
            </span>
          </div>

          <p className="text-sm text-ink-muted">
            Un seul colis pour {batch.lines.length} unité{batch.lines.length > 1 ? 's' : ''}.
          </p>

          {batch.trackingNumber ? (
            <p className="text-sm text-ink-muted">
              N° de suivi <span className="font-mono text-ink">{batch.trackingNumber}</span>
            </p>
          ) : null}

          {batch.expectedArrival ? (
            <p className={late ? 'text-sm text-warn' : 'text-sm text-ink-muted'}>
              Livraison prévue le {formatDay(batch.expectedArrival)}
              {pending > 0 && remaining !== null
                ? remaining < 0
                  ? ` · en retard de ${-remaining} jour${remaining < -1 ? 's' : ''}`
                  : remaining === 0
                    ? ' · aujourd’hui'
                    : ` · dans ${remaining} jour${remaining > 1 ? 's' : ''}`
                : ''}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {link ? (
              <a href={link} target="_blank" rel="noreferrer noopener">
                <Button variant="secondary">Suivre le colis</Button>
              </a>
            ) : pending > 0 ? (
              <p className="text-sm text-ink-muted">
                Aucun lien de suivi : ajoutez le transporteur et le numéro ci-dessous.
              </p>
            ) : null}
            {pending > 0 ? <MarkBatchReceived id={batch.id} pending={pending} /> : null}
          </div>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Unités du lot</h2>
          <span className="text-sm text-ink-muted">
            {formatPrice(batch.totalPriceCents)} réparti sur {batch.lines.length}
          </span>
        </div>

        {batch.lines.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Plus aucune unité ne pointe vers ce lot : elles ont été supprimées du stock.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {batch.lines.map((line) => (
              <li key={line.inventoryItemId} className="flex items-center gap-3 py-2.5 first:pt-0">
                <Link href={`/stock/${line.inventoryItemId}`} className="shrink-0">
                  <ComponentImage
                    imagePath={line.imagePath}
                    alt={`${line.brand} ${line.model}`}
                    className="size-12"
                  />
                </Link>
                <Link href={`/stock/${line.inventoryItemId}`} className="min-w-0 flex-1">
                  <span className="block text-xs text-ink-muted">
                    {CATEGORY_LABELS[line.category]} · {line.brand} ·{' '}
                    {CONDITION_LABELS[line.condition]}
                  </span>
                  <span className="block truncate font-medium hover:underline">{line.model}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {line.summary.join(' · ')}
                  </span>
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-medium">{formatPrice(line.priceCents)}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${STATUS_TONES[line.status]}`}
                  >
                    {STATUS_LABELS[line.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="border-t border-border-subtle pt-3 text-xs text-ink-muted">
          Chaque unité est indépendante : elle se modifie, se configure et se vend seule. Le prix
          total a été réparti à la saisie et ne bouge plus — corrigez une unité depuis sa fiche si
          besoin.
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 font-medium">Informations du lot</h2>
        <p className="mb-4 text-sm text-ink-muted">
          Le suivi saisi ici est reporté sur les {batch.lines.length} unités à l’enregistrement.
        </p>
        <BatchMetaForm batch={batch} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Zone sensible</h2>
        <p className="text-sm text-ink-muted">
          Dissoudre le lot ne supprime aucune unité : elles restent au stock avec leur prix, et
          perdent seulement le lien vers ce colis.
        </p>
        <DeleteBatch batch={batch} />
      </Card>
    </div>
  );
}
