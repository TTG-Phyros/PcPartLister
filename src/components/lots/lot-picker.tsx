'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { addLotItemAction, removeLotItemAction } from '@/actions/lots';
import { Alert, Input } from '@/components/ui';
import { formatPriceCompact } from '@/lib/catalog/format';
import { CONDITION_LABELS } from '@/lib/inventory/labels';
import type { LotCandidate } from '@/lib/lots/types';
import { CATEGORY_LABELS } from '@/lib/specs';

/**
 * Adds units to a lot. Only free units in stock are offered — a part held by a
 * configuration or another lot is already promised elsewhere, so it never shows
 * up here.
 */
export function LotPicker({ lotId }: { lotId: string }) {
  const listId = useId();
  const [state, formAction] = useActionState<ActionState, FormData>(addLotItemAction, {});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LotCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  // `state` is a fresh object on every submission, even when two adds in a row
  // return the same message: depending on it re-fetches after each one, so the
  // unit just placed leaves the list.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      try {
        const response = await fetch(`/api/lots/candidates?${params}`, {
          credentials: 'same-origin',
        });
        const data = (await response.json()) as { results?: LotCandidate[] };
        if (!cancelled) setResults(data.results ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, state]);

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        placeholder="Rechercher une unité du stock…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Rechercher une unité"
        aria-controls={listId}
        autoComplete="off"
      />

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <ul
        id={listId}
        className="max-h-96 divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border-subtle"
      >
        {results.length === 0 ? (
          <li className="px-3 py-4 text-sm text-ink-muted">
            {loading
              ? 'Recherche…'
              : query.trim()
                ? 'Aucune unité libre ne correspond.'
                : 'Aucune unité libre en stock : tout est déjà placé, vendu ou en transit.'}
          </li>
        ) : (
          results.map((candidate) => (
            <li key={candidate.id}>
              <form action={formAction}>
                <input type="hidden" name="lotId" value={lotId} />
                <input type="hidden" name="inventoryItemId" value={candidate.id} />
                <AddRow candidate={candidate} />
              </form>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function AddRow({ candidate }: { candidate: LotCandidate }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-surface-hover disabled:opacity-50"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={candidate.imageUrl}
        alt=""
        loading="lazy"
        className="size-12 shrink-0 rounded-md bg-surface object-contain"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-ink-muted">
          {CATEGORY_LABELS[candidate.category]} · {candidate.brand}
        </span>
        <span className="block truncate font-medium">{candidate.model}</span>
        <span className="block truncate text-xs text-ink-muted">
          {candidate.summary.join(' · ')}
        </span>
      </span>
      <span className="shrink-0 text-right text-xs text-ink-muted">
        <span className="block font-medium text-ink">
          {formatPriceCompact(candidate.priceCents)}
        </span>
        <span className="block">{CONDITION_LABELS[candidate.condition]}</span>
        <span className="block text-brand">{pending ? 'Ajout…' : '+ Ajouter'}</span>
      </span>
    </button>
  );
}

/** Takes a unit out of the lot and puts it back in plain stock. */
export function RemoveLotItem({ lineId, label }: { lineId: string; label: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(removeLotItemAction, {});

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="lineId" value={lineId} />
      <RemoveButton label={label} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </form>
  );
}

function RemoveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Retirer ${label} du lot`}
      className="min-h-9 rounded-lg px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-hover hover:text-danger disabled:opacity-50"
    >
      {pending ? '…' : 'Retirer'}
    </button>
  );
}
