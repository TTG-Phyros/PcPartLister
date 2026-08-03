'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Input, Select, cn } from '@/components/ui';
import {
  CONDITION_LABELS,
  ITEM_CONDITIONS,
  ITEM_STATUSES,
  STATUS_LABELS,
} from '@/lib/inventory/labels';
import { CATEGORY_LABELS, COMPONENT_CATEGORIES } from '@/lib/specs';

const FILTER_KEYS = ['q', 'category', 'status', 'condition', 'socket', 'min', 'max', 'dormant'];

/** Filters live in the URL so a view stays bookmarkable and shareable. */
export function InventoryFilters({ sockets }: { sockets: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [min, setMin] = useState(searchParams.get('min') ?? '');
  const [max, setMax] = useState(searchParams.get('max') ?? '');

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete('page');
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  // Debounced so typing on a phone does not fire a request per keystroke.
  useEffect(() => {
    const same =
      query === (searchParams.get('q') ?? '') &&
      min === (searchParams.get('min') ?? '') &&
      max === (searchParams.get('max') ?? '');
    if (same) return;
    const timer = setTimeout(() => apply({ q: query, min, max }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, min, max]);

  const dormantOn = searchParams.get('dormant') === '1';
  const hasFilters = FILTER_KEYS.some((key) => searchParams.get(key));

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        placeholder="Rechercher une marque, un modèle, un n° de série…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Recherche"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          value={searchParams.get('status') ?? ''}
          onChange={(e) => apply({ status: e.target.value })}
          aria-label="Statut"
        >
          <option value="">Tous statuts</option>
          {ITEM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get('condition') ?? ''}
          onChange={(e) => apply({ condition: e.target.value })}
          aria-label="État"
        >
          <option value="">Tous états</option>
          {ITEM_CONDITIONS.map((condition) => (
            <option key={condition} value={condition}>
              {CONDITION_LABELS[condition]}
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

      <div className="flex flex-wrap items-center gap-2">
        {/* Wrapped rather than sized directly: Input is w-full, which would win
            over a width utility passed through className. */}
        <div className="w-28">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Prix min €"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            aria-label="Prix d’achat minimum"
          />
        </div>
        <span className="text-ink-muted">–</span>
        <div className="w-28">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Prix max €"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            aria-label="Prix d’achat maximum"
          />
        </div>

        <button
          type="button"
          onClick={() => apply({ dormant: dormantOn ? '' : '1' })}
          aria-pressed={dormantOn}
          className={cn(
            'min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
            dormantOn
              ? 'border-warn bg-warn/15 text-warn'
              : 'border-border-subtle text-ink-muted hover:bg-surface-hover',
          )}
        >
          Dormants uniquement
        </button>

        {hasFilters ? (
          <Link
            href="/stock"
            onClick={() => {
              setQuery('');
              setMin('');
              setMax('');
            }}
            className="text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            Réinitialiser
          </Link>
        ) : null}
      </div>
    </div>
  );
}
