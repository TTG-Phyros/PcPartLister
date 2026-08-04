import Link from 'next/link';
import { notFound } from 'next/navigation';
import { updateInventoryItemAction } from '@/actions/inventory';
import { ComponentImage } from '@/components/catalog/component-image';
import { ChangeInventoryModel } from '@/components/inventory/change-model';
import { DeleteInventoryItem } from '@/components/inventory/delete-item';
import { InventoryForm } from '@/components/inventory/inventory-form';
import { MarkReceived } from '@/components/inventory/mark-received';
import { ListForSale, Unlist } from '@/components/sales/listing-actions';
import { SaleForm } from '@/components/sales/sale-form';
import { Alert, Button, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { suggestedSalePriceCents } from '@/lib/builds/pricing';
import type { InventoryItem } from '@/lib/db/schema';
import { formatPrice, summarizeSpecs } from '@/lib/catalog/format';
import { PLATFORM_LABELS, STATUS_LABELS, STATUS_TONES } from '@/lib/inventory/labels';
import { CARRIER_LABELS, daysUntil, isLate, trackingLink } from '@/lib/inventory/tracking';
import { getInventoryItem, isInventoryItemInBuild } from '@/lib/inventory/queries';
import { getLotOfItem } from '@/lib/lots/queries';
import type { SaleSubject } from '@/lib/sales/labels';
import { getSaleFor, type SaleRecord } from '@/lib/sales/queries';
import { getSettings } from '@/lib/settings-store';
import { CATEGORY_LABELS } from '@/lib/specs';

export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return dateFormat.format(new Date(year!, month! - 1, day!));
}

function daysSince(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor((Date.now() - new Date(year!, month! - 1, day!).getTime()) / 86_400_000);
}

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const row = await getInventoryItem(id);
  if (!row) notFound();

  const { item, component } = row;
  const [settings, inBuild, lot, sale] = await Promise.all([
    getSettings(),
    isInventoryItemInBuild(item.id),
    getLotOfItem(item.id),
    getSaleFor('item', item.id),
  ]);
  const age = daysSince(item.purchaseDate);
  const dormant = item.status === 'en_stock' && age > settings.dormant_days;

  const inTransit = item.status === 'en_transit';
  const tracking = trackingLink(item);
  const showTracking =
    inTransit ||
    Boolean(item.shippingCarrier || item.trackingNumber || item.trackingUrl || item.expectedArrival);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href="/stock" className="text-sm text-ink-muted hover:text-ink">
          ← Stock
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">
            {component.brand} {component.model}
          </h1>
          <span
            className={`rounded-md px-2 py-1 text-xs font-medium ${STATUS_TONES[item.status]}`}
          >
            {STATUS_LABELS[item.status]}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {CATEGORY_LABELS[component.category]} · acheté {formatPrice(item.purchasePriceCents)} le{' '}
          {formatDay(item.purchaseDate)} · il y a {age} jour{age > 1 ? 's' : ''}
        </p>
      </div>

      {dormant ? (
        <Alert tone="warning">
          En stock depuis {age} jours, au-delà du seuil de {settings.dormant_days} jours.
        </Alert>
      ) : null}

      {showTracking ? <TrackingCard item={item} link={tracking} /> : null}

      <Card className="flex flex-col gap-4 sm:flex-row">
        <ComponentImage
          imagePath={component.imagePath}
          alt={`${component.brand} ${component.model}`}
          className="h-36 w-full shrink-0 sm:w-48"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <ul className="flex flex-wrap gap-2">
            {summarizeSpecs(component.specs).map((chip) => (
              <li
                key={chip}
                className="h-fit rounded-md bg-surface-hover px-2 py-1 text-xs text-ink-muted"
              >
                {chip}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href={`/catalogue/${component.id}`}
              className="text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              Voir le modèle au catalogue
            </Link>
            {item.listingUrl ? (
              <a
                href={item.listingUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-ink-muted underline underline-offset-4 hover:text-ink"
              >
                Annonce d’origine
              </a>
            ) : null}
          </div>
          {item.notes ? (
            <p className="text-sm whitespace-pre-line text-ink-muted">{item.notes}</p>
          ) : null}
          <ChangeInventoryModel
            id={item.id}
            category={component.category}
            lockedToCategory={inBuild}
          />
        </div>
      </Card>

      <SaleCard
        item={item}
        name={`${component.brand} ${component.model}`}
        inBuild={inBuild}
        lot={lot}
        sale={sale}
        targetMarginPct={settings.target_margin_pct}
        defaultPlatformFeePct={settings.default_platform_fee_pct}
      />

      <Card>
        <h2 className="mb-4 font-medium">Modifier l’unité</h2>
        <InventoryForm
          action={updateInventoryItemAction}
          mode="edit"
          submitLabel="Enregistrer"
          initial={{
            id: item.id,
            purchasePriceEur: String(item.purchasePriceCents / 100),
            purchaseDate: item.purchaseDate,
            platform: item.platform,
            condition: item.condition,
            status: item.status,
            listingUrl: item.listingUrl ?? '',
            shippingCarrier: item.shippingCarrier ?? '',
            trackingNumber: item.trackingNumber ?? '',
            trackingUrl: item.trackingUrl ?? '',
            expectedArrival: item.expectedArrival ?? '',
            serialNumber: item.serialNumber ?? '',
            notes: item.notes ?? '',
          }}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Zone sensible</h2>
        <p className="text-sm text-ink-muted">
          La suppression est refusée tant que l’unité est utilisée dans une configuration.
        </p>
        <DeleteInventoryItem id={item.id} label={`${component.brand} ${component.model}`} />
      </Card>
    </div>
  );
}

/**
 * Selling the unit on its own. A part engaged in a configuration or in a lot is
 * sold with it, so the card sends you there instead of offering a second,
 * contradictory way out.
 */
function SaleCard({
  item,
  name,
  inBuild,
  lot,
  sale,
  targetMarginPct,
  defaultPlatformFeePct,
}: {
  item: InventoryItem;
  name: string;
  inBuild: boolean;
  lot: Awaited<ReturnType<typeof getLotOfItem>>;
  sale: SaleRecord | null;
  targetMarginPct: number;
  defaultPlatformFeePct: number;
}) {
  const subject: SaleSubject = { kind: 'item', id: item.id, name };
  const listed = item.status === 'en_vente';
  const costCents = item.purchasePriceCents;
  const suggestedPrice = suggestedSalePriceCents(costCents, targetMarginPct);
  // A unit marked sold by hand has no figures yet: offer the form so the sale
  // can be filled in after the fact.
  const concluding = sale !== null || listed || item.status === 'vendu';

  // A part engaged in a configuration or in a lot is sold with it, whatever its
  // status: no second sale is recorded here, or the same unit would be counted
  // twice.
  if ((inBuild || lot) && !sale) {
    return (
      <Card className="flex flex-col gap-2">
        <h2 className="font-medium">Vente</h2>
        {lot ? (
          <p className="text-sm text-ink-muted">
            Cette unité fait partie du lot{' '}
            <Link href={`/lots/${lot.id}`} className="text-ink underline underline-offset-4">
              {lot.name}
            </Link>{' '}
            : elle se vend avec lui. Retirez-la du lot pour la vendre séparément.
          </p>
        ) : (
          <p className="text-sm text-ink-muted">
            Cette unité fait partie d’une configuration : elle se vend avec elle. Retirez-la de la
            configuration pour la vendre séparément.
          </p>
        )}
      </Card>
    );
  }

  // Nothing to offer while the parcel is still travelling.
  if (!concluding && item.status === 'en_transit') return null;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Vente</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Prix d’achat : {formatPrice(costCents)}.
          {listed && item.listedAt ? ` En vente depuis le ${formatDay(item.listedAt)}.` : ''}
        </p>
      </div>

      {concluding ? (
        <SaleForm
          subject={subject}
          costCents={costCents}
          suggestedPriceCents={suggestedPrice}
          askingPriceCents={item.askingPriceCents}
          targetMarginPct={targetMarginPct}
          defaultPlatformFeePct={defaultPlatformFeePct}
          sale={sale}
        />
      ) : (
        <ListForSale
          subject={subject}
          costCents={costCents}
          suggestedPriceCents={suggestedPrice}
          askingPriceCents={item.askingPriceCents}
          targetMarginPct={targetMarginPct}
        />
      )}

      {listed && !sale ? <Unlist subject={subject} /> : null}
    </Card>
  );
}

/**
 * Everything about the parcel in one block: where it is, when it is due, and
 * the single button that turns it into stock.
 */
function TrackingCard({ item, link }: { item: InventoryItem; link: string | null }) {
  const inTransit = item.status === 'en_transit';
  const remaining = item.expectedArrival ? daysUntil(item.expectedArrival) : null;
  const late = isLate(item);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Suivi du colis</h2>
        <span className="text-sm text-ink-muted">
          {PLATFORM_LABELS[item.platform]}
          {item.shippingCarrier ? ` · ${CARRIER_LABELS[item.shippingCarrier]}` : ''}
        </span>
      </div>

      {item.trackingNumber ? (
        <p className="text-sm text-ink-muted">
          N° de suivi <span className="font-mono text-ink">{item.trackingNumber}</span>
        </p>
      ) : null}

      {item.expectedArrival ? (
        <p className={late ? 'text-sm text-warn' : 'text-sm text-ink-muted'}>
          Livraison prévue le {formatDay(item.expectedArrival)}
          {inTransit && remaining !== null
            ? remaining < 0
              ? ` · en retard de ${-remaining} jour${remaining < -1 ? 's' : ''}`
              : remaining === 0
                ? ' · aujourd’hui'
                : ` · dans ${remaining} jour${remaining > 1 ? 's' : ''}`
            : ''}
        </p>
      ) : null}

      {item.receivedAt ? (
        <p className="text-sm text-ink-muted">Reçu le {formatDay(item.receivedAt)}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer noopener">
            <Button variant="secondary">Suivre le colis</Button>
          </a>
        ) : inTransit ? (
          <p className="text-sm text-ink-muted">
            Aucun lien de suivi : ajoutez le transporteur et le numéro ci-dessous.
          </p>
        ) : null}
        {inTransit ? <MarkReceived id={item.id} /> : null}
      </div>
    </Card>
  );
}
