'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { CatalogSearchHit } from '@/app/api/catalog/search/route';
import { Input, Select, cn } from '@/components/ui';
import { formatPriceCompact } from '@/lib/catalog/format';
import { CATEGORY_LABELS, COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';

/**
 * Searchable model picker. A native <select> over ~200 models is unusable on a
 * phone, so this queries /api/catalog/search as you type and posts the chosen
 * id through a hidden input.
 */
export function CatalogPicker({
  name,
  initialSelection,
}: {
  name: string;
  initialSelection?: CatalogSearchHit | null;
}) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ComponentCategory | ''>('');
  const [results, setResults] = useState<CatalogSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CatalogSearchHit | null>(initialSelection ?? null);
  const requestId = useRef(0);

  useEffect(() => {
    if (selected) return;

    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (category) params.set('category', category);
      try {
        const response = await fetch(`/api/catalog/search?${params}`, {
          credentials: 'same-origin',
        });
        const data = (await response.json()) as { results?: CatalogSearchHit[] };
        // Ignore a slow response that lost the race with a newer keystroke.
        if (id === requestId.current) setResults(data.results ?? []);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, category, selected]);

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-brand/50 bg-brand/10 p-3">
        <input type="hidden" name={name} value={selected.id} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selected.imageUrl}
          alt=""
          className="size-16 shrink-0 rounded-lg bg-surface object-contain"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-muted">
            {CATEGORY_LABELS[selected.category]} · {selected.brand}
          </p>
          <p className="font-medium break-words">{selected.model}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">
            {selected.summary.join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setQuery('');
          }}
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-surface-hover hover:text-ink"
        >
          Changer
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          placeholder="Rechercher un modèle du catalogue…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher un modèle"
          aria-controls={listId}
          autoComplete="off"
        />
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as ComponentCategory | '')}
          aria-label="Filtrer par catégorie"
          className="sm:max-w-56"
        >
          <option value="">Toutes catégories</option>
          {COMPONENT_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      <ul
        id={listId}
        className="max-h-80 divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border-subtle"
      >
        {results.length === 0 ? (
          <li className="px-3 py-4 text-sm text-ink-muted">
            {loading ? 'Recherche…' : 'Aucun modèle trouvé. Utilisez « Nouveau modèle » ci-dessus.'}
          </li>
        ) : (
          results.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => setSelected(hit)}
                className={cn(
                  'flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-surface-hover',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hit.imageUrl}
                  alt=""
                  loading="lazy"
                  className="size-12 shrink-0 rounded-md bg-surface object-contain"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-ink-muted">
                    {CATEGORY_LABELS[hit.category]} · {hit.brand}
                  </span>
                  <span className="block truncate font-medium">{hit.model}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {hit.summary.join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-ink-muted">
                  {hit.inStock > 0 ? (
                    <span className="block text-ok">{hit.inStock} en stock</span>
                  ) : null}
                  <span className="block">neuf {formatPriceCompact(hit.msrpCents)}</span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
