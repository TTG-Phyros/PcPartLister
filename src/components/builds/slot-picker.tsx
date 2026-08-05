'use client';

import { useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionState } from '@/actions/auth';
import { addBuildItemAction } from '@/actions/builds';
import {
  facetOptions,
  facetsFor,
  filterCandidates,
  hasActiveFilters,
  sortCandidates,
  sortOptionsFor,
  type FacetSelection,
  type SortKey,
} from '@/lib/builds/browse';
import { candidateToPart } from '@/lib/builds/selection';
import type { Candidate } from '@/lib/builds/types';
import { formatPriceCompact } from '@/lib/catalog/format';
import { checkCandidate, type BuildSelection, type CandidateVerdict } from '@/lib/compat/engine';
import { CONDITION_LABELS, STATUS_LABELS, STATUS_TONES } from '@/lib/inventory/labels';
import { CATEGORY_LABELS, type ComponentCategory } from '@/lib/specs';
import { TIER_LIST_CONFIG, tierListKindFor, type TierListKind } from '@/lib/tier-list/kinds';
import { buildTierIndex, findTierEntry } from '@/lib/tier-list/parse';
import type { TierEntry, TierRow } from '@/lib/tier-list/types';
import { TierEntryBadge } from '@/components/tier-list/tier-badge';
import { TierList } from '@/components/tier-list/tier-list';
import { Alert, Button, Input, Select, cn } from '@/components/ui';

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
  tierRows,
  onClose,
}: {
  buildId: string;
  slot: ComponentCategory;
  selection: BuildSelection;
  /** Every ranking, so the picker can badge whichever ranked slot it opens. */
  tierRows: Record<TierListKind, TierRow[]>;
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

  // Ranking lookups happen here rather than on the server: the candidate list is
  // already in the browser, and matching a part name is pure string work.
  const tierKind = tierListKindFor(slot);
  const ranking = tierKind ? tierRows[tierKind] : [];
  const tierIndex = useMemo(() => buildTierIndex(ranking), [ranking]);
  const tierEntryFor = (candidate: Candidate): TierEntry | null =>
    tierKind
      ? findTierEntry(tierIndex, {
          model: candidate.model,
          chipset: candidate.specs.category === 'gpu' ? candidate.specs.chipset : null,
          vramGb: candidate.specs.category === 'gpu' ? candidate.specs.vramGb : null,
        })
      : null;

  // Ordering and filtering are per slot: opening another one starts clean.
  const facets = useMemo(() => facetsFor(slot), [slot]);
  const sortOptions = useMemo(
    () => sortOptionsFor(slot, { ranked: ranking.length > 0 }),
    [slot, ranking],
  );
  const [sort, setSort] = useState<SortKey>('pertinence');
  const [filters, setFilters] = useState<FacetSelection>({});
  useEffect(() => {
    setSort('pertinence');
    setFilters({});
  }, [slot]);

  // Both groups feed the selects, so a value is offered whether the part is
  // owned or still to buy.
  const all = useMemo(() => (data ? [...data.stock, ...data.catalog] : []), [data]);

  /** Narrow, order, then grade: incompatible parts stay visible, at the bottom. */
  const arrange = (list: Candidate[]): GradedCandidate[] =>
    sortCandidates(filterCandidates(list, facets, filters), sort, { slot, tierEntryFor })
      .map((candidate) => ({
        ...candidate,
        verdict: checkCandidate(selection, slot, candidateToPart(candidate)),
      }))
      // Stable, so the chosen order survives inside each group.
      .sort((a, b) => Number(b.verdict.compatible) - Number(a.verdict.compatible));

  const stock = useMemo(
    () => arrange(data ? data.stock : []),
    [data, selection, slot, sort, filters],
  );
  const catalog = useMemo(
    () => arrange(data ? data.catalog : []),
    [data, selection, slot, sort, filters],
  );

  const filtered = hasActiveFilters(filters);

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
              Vos unités disponibles d’abord, puis les modèles à acheter.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} type="button">
            Fermer
          </Button>
        </header>

        <div className="flex flex-col gap-3 border-b border-border-subtle p-4">
          <Input
            type="search"
            placeholder="Filtrer par marque, modèle, puce…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Filtrer les composants"
            autoFocus
          />

          <div className="flex flex-wrap items-end gap-2">
            <Picker
              id="tri"
              label="Trier par"
              value={sort}
              onChange={(value) => setSort(value as SortKey)}
            >
              {sortOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Picker>

            {facets.map((facet) => {
              const selected = filters[facet.id] ?? '';
              const options = facetOptions(facet, all);
              // A single value narrows nothing, so the select stays out of the
              // way — unless it is the one currently narrowing the list.
              if (options.length < 2 && selected === '') return null;
              const values =
                selected !== '' && !options.includes(selected) ? [selected, ...options] : options;

              return (
                <Picker
                  key={facet.id}
                  id={`facette-${facet.id}`}
                  label={facet.label}
                  value={selected}
                  onChange={(value) =>
                    setFilters((current) => ({ ...current, [facet.id]: value }))
                  }
                >
                  <option value="">Indifférent</option>
                  {values.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Picker>
              );
            })}

            {filtered ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-9 px-2 py-1 text-xs"
                onClick={() => setFilters({})}
              >
                Tout afficher
              </Button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          {tierKind && ranking.length > 0 ? (
            <details className="mb-4 rounded-lg border border-border-subtle">
              <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium marker:content-none">
                {TIER_LIST_CONFIG[tierKind].labels.panel}{' '}
                <span className="font-normal text-ink-muted">— comparer avant de choisir</span>
              </summary>
              <div className="border-t border-border-subtle p-3">
                <TierList kind={tierKind} rows={ranking} compact />
              </div>
            </details>
          ) : null}

          <Group
            title={`Mon stock (${stock.length})`}
            hint="Prix d’achat réel, déjà payé — en transit et réservées comprises."
            empty={
              loading
                ? 'Chargement…'
                : filtered
                  ? 'Aucune unité ne correspond aux filtres.'
                  : 'Aucune unité disponible dans cette catégorie.'
            }
            candidates={stock}
            buildId={buildId}
            slot={slot}
            formAction={formAction}
            tierEntryFor={tierEntryFor}
          />

          <Group
            title={`À acheter (${catalog.length})`}
            hint="Modèles du catalogue, au prix neuf indicatif."
            empty={
              loading
                ? 'Chargement…'
                : filtered
                  ? 'Aucun modèle ne correspond aux filtres.'
                  : 'Aucun modèle au catalogue.'
            }
            candidates={catalog}
            buildId={buildId}
            slot={slot}
            formAction={formAction}
            tierEntryFor={tierEntryFor}
            className="mt-6"
          />
        </div>
      </div>
    </div>
  );
}

/** A labelled select of the toolbar, sized to sit several per row on a phone. */
function Picker({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-w-38 flex-1">
      <label htmlFor={id} className="mb-1 block text-xs text-ink-muted">
        {label}
      </label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-9 py-1 text-sm"
      >
        {children}
      </Select>
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
  tierEntryFor,
  className,
}: {
  title: string;
  hint: string;
  empty: string;
  candidates: GradedCandidate[];
  buildId: string;
  slot: ComponentCategory;
  formAction: (formData: FormData) => void;
  tierEntryFor: (candidate: Candidate) => TierEntry | null;
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
                tierEntry={tierEntryFor(candidate)}
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
  tierEntry,
}: {
  candidate: GradedCandidate;
  buildId: string;
  slot: ComponentCategory;
  formAction: (formData: FormData) => void;
  tierEntry: TierEntry | null;
}) {
  const { verdict } = candidate;
  const warning = verdict.compatible && verdict.warnings.length > 0;
  const tierKind = tierListKindFor(slot);

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
          <span className="block truncate font-medium">
            {candidate.model}
            {/* Only when it is not simply on the shelf: a badge on every line
                would say nothing. */}
            {candidate.status && candidate.status !== 'en_stock' ? (
              <span
                className={cn(
                  'ml-2 rounded-md px-1.5 py-0.5 align-middle text-[11px] font-medium',
                  STATUS_TONES[candidate.status],
                )}
              >
                {STATUS_LABELS[candidate.status]}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-ink-muted">
            {candidate.summary.join(' · ')}
          </span>

          {tierKind && tierEntry ? (
            <TierEntryBadge kind={tierKind} entry={tierEntry} className="mt-1" />
          ) : null}

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
