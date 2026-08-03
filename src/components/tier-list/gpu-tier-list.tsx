'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TierBadge } from '@/components/tier-list/gpu-tier-badge';
import { Input, Select, cn } from '@/components/ui';
import { formatGpuIndex } from '@/lib/tier-list/format';
import { GPU_TIERS, GPU_TIER_LABELS, GPU_TIER_STYLES, type GpuTierRow } from '@/lib/tier-list/types';

/**
 * Sortable, filterable GPU ranking. State is local rather than in the URL: the
 * table also shows up inside the catalog page and the configurator modal, which
 * already own the query string.
 */

type SortKey = 'rank' | 'model' | 'brand' | 'tier' | 'index';
type Direction = 'asc' | 'desc';

const COLUMNS: Array<{
  key: SortKey;
  label: string;
  /** Marque and Gamme fold into the model cell on a phone. */
  className?: string;
  numeric?: boolean;
}> = [
  { key: 'rank', label: 'Rang', numeric: true },
  { key: 'model', label: 'Modèle' },
  { key: 'brand', label: 'Marque', className: 'hidden sm:table-cell' },
  { key: 'tier', label: 'Gamme', className: 'hidden md:table-cell' },
  { key: 'index', label: 'Indice', numeric: true },
];

const TIER_RANK = new Map(GPU_TIERS.map((tier, position) => [tier, position]));

export function GpuTierList({
  rows,
  /** Denser rows and a scroll area, for the catalog panel and the configurator. */
  compact = false,
  className,
}: {
  rows: GpuTierRow[];
  compact?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [tier, setTier] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({
    key: 'rank',
    direction: 'asc',
  });

  const brands = useMemo(
    () => [...new Set(rows.map((row) => row.brand))].sort((a, b) => a.localeCompare(b, 'fr')),
    [rows],
  );

  // The bar is relative to the best card of the whole ranking, not of the
  // filtered view: filtering must not make a mid-range card look like a flagship.
  const maxIndex = useMemo(() => Math.max(1, ...rows.map((row) => row.index)), [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter(
      (row) =>
        (needle === '' || row.model.toLowerCase().includes(needle)) &&
        (brand === '' || row.brand === brand) &&
        (tier === '' || row.tier === tier),
    );

    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'model':
          return factor * a.model.localeCompare(b.model, 'fr');
        case 'brand':
          return factor * (a.brand.localeCompare(b.brand, 'fr') || a.rank - b.rank);
        case 'tier':
          return factor * ((TIER_RANK.get(a.tier) ?? 0) - (TIER_RANK.get(b.tier) ?? 0) || a.rank - b.rank);
        case 'index':
          return factor * (a.index - b.index);
        default:
          return factor * (a.rank - b.rank);
      }
    });
  }, [rows, query, brand, tier, sort]);

  const hasFilters = query !== '' || brand !== '' || tier !== '';

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : // Rank and name read best ascending; performance best descending.
          { key, direction: key === 'index' ? 'desc' : 'asc' },
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-border-subtle px-3 py-4 text-sm text-ink-muted">
        Le classement des cartes graphiques est indisponible.
      </p>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          placeholder="Rechercher un modèle…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Rechercher un modèle de carte graphique"
        />
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-96">
          <Select value={brand} onChange={(event) => setBrand(event.target.value)} aria-label="Marque">
            <option value="">Toutes marques</option>
            {brands.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Select value={tier} onChange={(event) => setTier(event.target.value)} aria-label="Gamme">
            <option value="">Toutes gammes</option>
            {GPU_TIERS.map((value) => (
              <option key={value} value={value}>
                {GPU_TIER_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-ink-muted" aria-live="polite">
          {visible.length} carte{visible.length > 1 ? 's' : ''} sur {rows.length}
        </p>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setBrand('');
              setTier('');
            }}
            className="text-xs text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            Réinitialiser les filtres
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          'overflow-x-auto rounded-xl border border-border-subtle',
          compact && 'max-h-[50vh] overflow-y-auto',
        )}
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Classement des cartes graphiques par indice de performance
          </caption>
          {/* Sticky only inside the scrollable compact box: on a full page the
              app header already owns the top of the viewport. */}
          <thead
            className={cn(
              'bg-surface-raised text-left text-xs text-ink-muted',
              compact && 'sticky top-0 z-10',
            )}
          >
            <tr>
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={cn(
                      'border-b border-border-subtle font-medium',
                      column.numeric && 'text-right',
                      column.className,
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={cn(
                        'flex w-full items-center gap-1 px-3 py-2 transition-colors hover:text-ink',
                        column.numeric && 'justify-end',
                        active && 'text-ink',
                      )}
                    >
                      {column.label}
                      <span aria-hidden="true" className={active ? '' : 'opacity-0'}>
                        {sort.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-border-subtle">
            {visible.map((row) => (
              <TierRow key={row.rank} row={row} maxIndex={maxIndex} compact={compact} />
            ))}
          </tbody>
        </table>

        {visible.length === 0 ? (
          <p className="px-3 py-4 text-sm text-ink-muted">
            Aucune carte ne correspond à cette recherche.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TierRow({
  row,
  maxIndex,
  compact,
}: {
  row: GpuTierRow;
  maxIndex: number;
  compact: boolean;
}) {
  const cell = compact ? 'px-3 py-1.5' : 'px-3 py-2';

  return (
    <tr className="transition-colors hover:bg-surface-hover">
      <td className={cn(cell, 'text-right align-top text-xs text-ink-muted tabular-nums')}>
        #{row.rank}
      </td>

      <td className={cn(cell, 'align-top')}>
        {row.catalogComponentId ? (
          <Link
            href={`/catalogue/${row.catalogComponentId}`}
            className="font-medium text-brand underline underline-offset-4 hover:text-ink"
          >
            {row.model}
          </Link>
        ) : (
          <span className="font-medium">{row.model}</span>
        )}
        {/* Brand gets its own column from `sm` up, tier from `md` up: until then
            they ride under the model name. */}
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted md:hidden">
          <span className="sm:hidden">{row.brand}</span>
          <TierBadge tier={row.tier} />
        </span>
      </td>

      <td className={cn(cell, 'hidden align-top text-ink-muted sm:table-cell')}>{row.brand}</td>

      <td className={cn(cell, 'hidden align-top md:table-cell')}>
        <TierBadge tier={row.tier} />
      </td>

      <td className={cn(cell, 'align-top')}>
        <div className="flex items-center justify-end gap-2">
          <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-hover sm:block lg:w-24">
            <span
              className={cn('block h-full rounded-full', GPU_TIER_STYLES[row.tier].bar)}
              style={{ width: `${Math.round((row.index / maxIndex) * 100)}%` }}
            />
          </span>
          <span className="w-14 text-right font-medium tabular-nums">
            {formatGpuIndex(row.index)}
          </span>
        </div>
      </td>
    </tr>
  );
}
