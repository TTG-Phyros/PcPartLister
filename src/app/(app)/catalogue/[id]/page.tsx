import Link from 'next/link';
import { notFound } from 'next/navigation';
import { updateCatalogComponentAction } from '@/actions/catalog';
import { CatalogDangerZone } from '@/components/catalog/catalog-danger-zone';
import { CatalogForm } from '@/components/catalog/catalog-form';
import { ComponentImage } from '@/components/catalog/component-image';
import { GpuTierBadge } from '@/components/tier-list/gpu-tier-badge';
import { Button, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { formatPriceCompact, summarizeSpecs } from '@/lib/catalog/format';
import { getCatalogComponent } from '@/lib/catalog/queries';
import { countInStockForComponent } from '@/lib/inventory/queries';
import { findTierEntryForGpu } from '@/lib/tier-list/queries';
import { CATEGORY_LABELS } from '@/lib/specs';
import { SPEC_FIELDS, formValueFor } from '@/lib/specs/fields';

export const dynamic = 'force-dynamic';

export default async function CatalogComponentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const component = await getCatalogComponent(id);
  if (!component) notFound();

  const ownedCount = await countInStockForComponent(component.id);
  const tierEntry =
    component.specs.category === 'gpu'
      ? await findTierEntryForGpu({
          model: component.model,
          chipset: component.specs.chipset,
          vramGb: component.specs.vramGb,
        })
      : null;

  const specValues = Object.fromEntries(
    SPEC_FIELDS[component.category].map((field) => [
      field.path,
      formValueFor(field, component.specs),
    ]),
  );

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link
          href="/catalogue"
          className="text-sm text-ink-muted hover:text-ink"
        >
          ← Catalogue
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {component.brand} {component.model}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {CATEGORY_LABELS[component.category]}
          {component.releaseYear ? ` · ${component.releaseYear}` : ''} · neuf{' '}
          {formatPriceCompact(component.msrpCents)}
          {component.seedKey ? ' · entrée du catalogue livré' : ''}
        </p>
      </div>

      <Card className="flex flex-col gap-4 sm:flex-row">
        <ComponentImage
          imagePath={component.imagePath}
          alt={`${component.brand} ${component.model}`}
          className="h-40 w-full shrink-0 sm:w-56"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {tierEntry ? (
            <div className="flex flex-wrap items-center gap-2">
              <GpuTierBadge entry={tierEntry} />
              <Link
                href="/tier-list"
                className="text-xs text-ink-muted underline underline-offset-4 hover:text-ink"
              >
                Voir la tier list
              </Link>
            </div>
          ) : null}

          <ul className="flex flex-wrap content-start gap-2">
            {summarizeSpecs(component.specs).map((chip) => (
              <li
                key={chip}
                className="h-fit rounded-md bg-surface-hover px-2 py-1 text-xs text-ink-muted"
              >
                {chip}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/stock/nouveau?modele=${component.id}`}>
              <Button variant="secondary">Ajouter un exemplaire au stock</Button>
            </Link>
            {ownedCount > 0 ? (
              <Link
                href={`/stock?q=${encodeURIComponent(component.model)}&status=en_stock`}
                className="text-sm text-ok underline underline-offset-4"
              >
                {ownedCount} exemplaire{ownedCount > 1 ? 's' : ''} possédé
                {ownedCount > 1 ? 's' : ''}
              </Link>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-medium">Modifier</h2>
        <CatalogForm
          action={updateCatalogComponentAction}
          submitLabel="Enregistrer"
          initial={{
            id: component.id,
            category: component.category,
            brand: component.brand,
            model: component.model,
            releaseYear: component.releaseYear ? String(component.releaseYear) : '',
            msrpEur: component.msrpCents !== null ? String(component.msrpCents / 100) : '',
            specValues,
          }}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Zone sensible</h2>
        <p className="text-sm text-ink-muted">
          La suppression est refusée tant que des unités de stock référencent ce modèle.
        </p>
        <CatalogDangerZone
          id={component.id}
          model={`${component.brand} ${component.model}`}
          hasImage={Boolean(component.imagePath)}
        />
      </Card>
    </div>
  );
}
