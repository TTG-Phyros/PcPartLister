'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Input, Select } from '@/components/ui';
import { CATEGORY_LABELS, COMPONENT_CATEGORIES } from '@/lib/specs';

/**
 * Filters drive the URL, so a filtered view is bookmarkable and the server
 * component re-renders from `searchParams`. The text field is debounced to
 * avoid a request per keystroke on a phone.
 */
export function CatalogFilters({
  brands,
  sockets,
  basePath = '/catalogue',
}: {
  brands: string[];
  sockets: string[];
  basePath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (query === current) return;
    const timer = setTimeout(() => apply({ q: query }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const hasFilters = ['q', 'category', 'brand', 'socket'].some((key) => searchParams.get(key));

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        placeholder="Rechercher une marque, un modèle, une puce…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Recherche"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Select
          value={searchParams.get('category') ?? ''}
          onChange={(e) => apply({ category: e.target.value })}
          aria-label="Catégorie"
        >
          <option value="">Toutes catégories</option>
          {COMPONENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get('brand') ?? ''}
          onChange={(e) => apply({ brand: e.target.value })}
          aria-label="Marque"
        >
          <option value="">Toutes marques</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get('socket') ?? ''}
          onChange={(e) => apply({ socket: e.target.value })}
          aria-label="Socket"
        >
          <option value="">Tous sockets</option>
          {sockets.map((socket) => (
            <option key={socket} value={socket}>
              {socket}
            </option>
          ))}
        </Select>
      </div>

      {hasFilters ? (
        <Link
          href={basePath}
          onClick={() => setQuery('')}
          className="self-start text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Réinitialiser les filtres
        </Link>
      ) : null}
    </div>
  );
}
