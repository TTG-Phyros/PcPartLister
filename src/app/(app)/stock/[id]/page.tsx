import Link from 'next/link';
import { notFound } from 'next/navigation';
import { updateInventoryItemAction } from '@/actions/inventory';
import { ComponentImage } from '@/components/catalog/component-image';
import { DeleteInventoryItem } from '@/components/inventory/delete-item';
import { InventoryForm } from '@/components/inventory/inventory-form';
import { Alert, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { formatPrice, summarizeSpecs } from '@/lib/catalog/format';
import { STATUS_LABELS, STATUS_TONES } from '@/lib/inventory/labels';
import { getInventoryItem } from '@/lib/inventory/queries';
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
  const settings = await getSettings();
  const age = daysSince(item.purchaseDate);
  const dormant = item.status === 'en_stock' && age > settings.dormant_days;

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
        </div>
      </Card>

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
