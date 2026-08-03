'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionState } from '@/actions/auth';
import { addBuildItemAction } from '@/actions/builds';
import { candidateToPart } from '@/lib/builds/selection';
import type { Candidate } from '@/lib/builds/types';
import { formatPriceCompact } from '@/lib/catalog/format';
import { checkCandidate, type BuildSelection, type CandidateVerdict } from '@/lib/compat/engine';
import { CONDITION_LABELS } from '@/lib/inventory/labels';
import { CATEGORY_LABELS, type ComponentCategory } from '@/lib/specs';
import { Alert, Button, Input, cn } from '@/components/ui';

type GradedCandidate = Candidate & { verdict: CandidateVerdict };

/**
 * Slot picker. Candidates arrive from the server with their specs, and the
 * compatibility engine runs here in the browser: changing another slot re-grades
 * the open list instantly instead of waiting for a round trip.
 */
export function SlotPicker({
  buildId,
  slot,
  selection,
  onClose,
}: {
  buildId: string;
  slot: ComponentCategory;
  selection: BuildSelection;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState, FormData>(addBuildItemAction, {});
  const [query, setQuery] = useState('');
  const [data, setData] = useState<{ stock: Candidate[]; catalog: Candidate[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(
      async () => {
        setLoading(true);
        const params = new URLSearchParams({ slot });
        if (query.trim()) params.set('q', query.trim());
        try {
          const response = await fetch(`/api/builds/candidates?${params}`, {
            credentials: 'same-origin',
          });
          const payload = (await response.json()) as { stock: Candidate[]; catalog: Candidate[] };
          if (id === requestId.current) setData(payload);
        } catch {
          if (id === requestId.current) setData({ stock: [], catalog: [] });
        } finally {
          if (id === requestId.current) setLoading(false);
        }
      },
      query ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [slot, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Closes once the server action has accepted the part.
  useEffect(() => {
    if (state.success) {
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  const grade = (list: Candidate[]): GradedCandidate[] => {
    const graded = list.map((candidate) => ({
      ...candidate,
      verdict: checkCandidate(selection, slot, candidateToPart(candidate)),
    }));
    // Incompatible parts stay visible, with their reason, but at the bottom.
    return graded.sort((a, b) => Number(b.verdict.compatible) - Number(a.verdict.compatible));
  };

  const stock = useMemo(() => grade(data ? data.stock : []), [data, selection, slot]);
  const catalog = useMemo(() => grade(data ? data.catalog : []), [data, selection, slot]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Choisir : ${CATEGORY_LABELS[slot]}`}
      onMouseDown={(event) => {
        if (!dialogRef.current?.contains(event.target as Node)) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-t-2xl border border-border-subtle bg-surface sm:rounded-2xl"
      >
        <header className="flex items-center gap-3 border-b border-border-subtle p-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{CATEGORY_LABELS[slot]}</h2>
            <p className="text-xs text-ink-muted">
              Vos unités en stock d’abord, puis les modèles à acheter.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} type="button">
            Fermer
          </Button>
        </header>

        <div className="border-b border-border-subtle p-4">
          <Input
            type="search"
            placeholder="Filtrer par marque, modèle, puce…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Filtrer les composants"
            autoFocus
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <Group
            title={`En stock (${stock.length})`}
            hint="Prix d’achat réel, déjà payé."
            empty={loading ? 'Chargement…' : 'Aucune unité disponible dans cette catégorie.'}
            candidates={stock}
            buildId={buildId}
            slot={slot}
            formAction={formAction}
          />

          <Group
            title={`À acheter (${catalog.length})`}
            hint="Modèles du catalogue, au prix neuf indicatif."
            empty={loading ? 'Chargement…' : 'Aucun modèle au catalogue.'}
            candidates={catalog}
            buildId={buildId}
            slot={slot}
            formAction={formAction}
            className="mt-6"
          />
        </div>
      </div>
    </div>
  );
}

function Group({
  title,
  hint,
  empty,
  candidates,
  buildId,
  slot,
  formAction,
  className,
}: {
  title: string;
  hint: string;
  empty: string;
  candidates: GradedCandidate[];
  buildId: string;
  slot: ComponentCategory;
  formAction: (formData: FormData) => void;
  className?: string;
}) {
  return (
    <section className={className}>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mb-2 text-xs text-ink-muted">{hint}</p>

      {candidates.length === 0 ? (
        <p className="rounded-lg border border-border-subtle px-3 py-4 text-sm text-ink-muted">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {candidates.map((candidate) => (
            <li key={candidate.key}>
              <CandidateRow
                candidate={candidate}
                buildId={buildId}
                slot={slot}
                formAction={formAction}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CandidateRow({
  candidate,
  buildId,
  slot,
  formAction,
}: {
  candidate: GradedCandidate;
  buildId: string;
  slot: ComponentCategory;
  formAction: (formData: FormData) => void;
}) {
  const { verdict } = candidate;
  const warning = verdict.compatible && verdict.warnings.length > 0;

  return (
    <form action={formAction}>
      <input type="hidden" name="buildId" value={buildId} />
      <input type="hidden" name="slot" value={slot} />
      {candidate.inventoryItemId ? (
        <input type="hidden" name="inventoryItemId" value={candidate.inventoryItemId} />
      ) : (
        <input type="hidden" name="catalogComponentId" value={candidate.catalogComponentId} />
      )}

      <button
        type="submit"
        disabled={!verdict.compatible}
        aria-disabled={!verdict.compatible}
        className={cn(
          'flex w-full items-center gap-3 p-2.5 text-left transition-colors',
          verdict.compatible
            ? 'hover:bg-surface-hover'
            : // Greyed out but still readable: the reason is the point.
              'cursor-not-allowed opacity-45',
        )}
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
            {candidate.brand}
            {candidate.condition ? ` · ${CONDITION_LABELS[candidate.condition]}` : ''}
          </span>
          <span className="block truncate font-medium">{candidate.model}</span>
          <span className="block truncate text-xs text-ink-muted">
            {candidate.summary.join(' · ')}
          </span>

          {!verdict.compatible ? (
            <span className="mt-1 block text-xs font-medium text-danger">{verdict.reason}</span>
          ) : null}
          {warning ? (
            <span className="mt-1 block text-xs text-warn">{verdict.warnings[0]?.raison}</span>
          ) : null}
        </span>

        <span className="shrink-0 text-right">
          <span className="block font-medium">{formatPriceCompact(candidate.priceCents)}</span>
          <span className="block text-xs text-ink-muted">
            {candidate.source === 'stock' ? 'payé' : 'à acheter'}
          </span>
        </span>
      </button>
    </form>
  );
}
