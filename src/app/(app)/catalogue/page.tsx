import Link from 'next/link';
import { Suspense } from 'react';
import { CatalogFilters } from '@/components/catalog/catalog-filters';
import { ComponentImage } from '@/components/catalog/component-image';
import { TierList } from '@/components/tier-list/tier-list';
import { Button, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { formatPriceCompact, summarizeSpecs } from '@/lib/catalog/format';
import { countCatalog, listBrands, listSockets, searchCatalog } from '@/lib/catalog/queries';
import { TIER_LIST_CONFIG, tierListKindFor } from '@/lib/tier-list/kinds';
import { getTierRows } from '@/lib/tier-list/queries';
import { CATEGORY_LABELS, COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Catalogue — PcPartLister' };

const PAGE_SIZE = 60;

function asCategory(value: string | undefined): ComponentCategory | undefined {
  return COMPONENT_CATEGORIES.includes(value as ComponentCategory)
    ? (value as ComponentCategory)
    : undefined;
}

export default async function CatalogPage({
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

  const filters = {
    q: one('q'),
    category: asCategory(one('category')),
    brand: one('brand'),
    socket: one('socket'),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  // A ranking is only fetched for the category it describes.
  const tierKind = filters.category ? tierListKindFor(filters.category) : null;

  const [components, total, brands, sockets, tierRows] = await Promise.all([
    searchCatalog(filters),
    countCatalog(filters),
    listBrands(),
    listSockets(),
    tierKind ? getTierRows(tierKind) : Promise.resolve([]),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryString = (targetPage: number) => {
    const next = new URLSearchParams();
    for (const key of ['q', 'category', 'brand', 'socket']) {
      const value = one(key);
      if (value) next.set(key, value);
    }
    if (targetPage > 1) next.set('page', String(targetPage));
    const qs = next.toString();
    return qs ? `/catalogue?${qs}` : '/catalogue';
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Catalogue</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {total} modèle{total > 1 ? 's' : ''} de référence
            {total !== components.length ? ` · page ${page} sur ${pageCount}` : ''}
          </p>
        </div>
        <Link href="/catalogue/nouveau">
          <Button>Ajouter un modèle</Button>
        </Link>
      </div>

      <Suspense fallback={null}>
        <CatalogFilters brands={brands} sockets={sockets} />
      </Suspense>

      {tierKind && tierRows.length > 0 ? (
        // Collapsed by default: the ranking is a reference to open when a choice
        // needs arbitrating, not something to scroll past on every visit.
        <details className="rounded-xl border border-border-subtle bg-surface-raised">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:content-none">
            {TIER_LIST_CONFIG[tierKind].labels.panel}{' '}
            <span className="font-normal text-ink-muted">
              — {tierRows.length} modèles classés par performance
            </span>
          </summary>
          <div className="border-t border-border-subtle p-4">
            <TierList kind={tierKind} rows={tierRows} compact />
            <p className="mt-3 text-xs text-ink-muted">
              <Link
                href={`/tier-list?type=${tierKind}`}
                className="underline underline-offset-4 hover:text-ink"
              >
                Ouvrir le classement complet
              </Link>
            </p>
          </div>
        </details>
      ) : null}

      {components.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            Aucun composant ne correspond à cette recherche.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {components.map((component) => (
            <li key={component.id}>
              <Link
                href={`/catalogue/${component.id}`}
                className="flex h-full gap-3 rounded-xl border border-border-subtle bg-surface-raised p-3 transition-colors hover:border-brand/60 hover:bg-surface-hover"
              >
                <ComponentImage
                  imagePath={component.imagePath}
                  alt={`${component.brand} ${component.model}`}
                  className="size-20 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink-muted">
                    {CATEGORY_LABELS[component.category]} · {component.brand}
                  </p>
                  <p className="font-medium break-words">{component.model}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-muted">
                    {summarizeSpecs(component.specs).join(' · ')}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Neuf : {formatPriceCompact(component.msrpCents)}
                    {component.releaseYear ? ` · ${component.releaseYear}` : ''}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          {page > 1 ? (
            <Link href={queryString(page - 1)}>
              <Button variant="secondary">Précédent</Button>
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-muted">
            Page {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={queryString(page + 1)}>
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
