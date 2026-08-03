'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ActionState } from '@/actions/auth';
import { removeBuildItemAction, updateLineEstimateAction } from '@/actions/builds';
import { BottleneckIndicator } from '@/components/builds/bottleneck-indicator';
import { SlotPicker } from '@/components/builds/slot-picker';
import { Alert, Button, Card, Input, cn } from '@/components/ui';
import { computeBuildCost, suggestedSalePriceCents } from '@/lib/builds/pricing';
import { selectionFromLines } from '@/lib/builds/selection';
import { SLOT_ORDER, type BuildDetail, type BuildLine } from '@/lib/builds/types';
import { formatPrice, formatPriceCompact } from '@/lib/catalog/format';
import { blockingIssues, evaluate, warnings } from '@/lib/compat/engine';
import { cpuGpuBottleneckRule } from '@/lib/compat/rules/advisory';
import { CONDITION_LABELS } from '@/lib/inventory/labels';
import { CATEGORY_LABELS, MULTI_SLOT_CATEGORIES, type ComponentCategory } from '@/lib/specs';
import type { TierListKind } from '@/lib/tier-list/kinds';
import type { TierRow } from '@/lib/tier-list/types';

const MULTI = new Set<ComponentCategory>(MULTI_SLOT_CATEGORIES);

export function Configurator({
  build,
  targetMarginPct,
  editable,
  tierRows,
}: {
  build: BuildDetail;
  targetMarginPct: number;
  editable: boolean;
  /** Handed straight to the slot picker, which needs the ranking of the slot it opens. */
  tierRows: Record<TierListKind, TierRow[]>;
}) {
  const [openSlot, setOpenSlot] = useState<ComponentCategory | null>(null);

  // The engine runs on the current lines: every add or removal re-grades the
  // whole configuration without a server round trip.
  const selection = useMemo(() => selectionFromLines(build.lines), [build.lines]);
  const results = useMemo(() => evaluate(selection), [selection]);
  const blocking = blockingIssues(results);
  // The bottleneck has its own panel, which says more than a bullet point ever
  // could — leaving it here too would only say the same thing twice.
  const advisories = warnings(results).filter(
    (issue) => issue.ruleId !== cpuGpuBottleneckRule.id,
  );

  const cost = computeBuildCost(build.lines, build.consumablesCents);
  const suggested = suggestedSalePriceCents(cost.totalCents, targetMarginPct);

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {blocking.length > 0 ? (
          <Alert tone="error">
            <p className="font-medium">
              {blocking.length} incompatibilité{blocking.length > 1 ? 's' : ''} bloquante
              {blocking.length > 1 ? 's' : ''}
            </p>
            <ul className="mt-1 list-inside list-disc">
              {blocking.map((issue) => (
                <li key={issue.ruleId}>
                  {issue.label} : {issue.raison}
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}

        {advisories.length > 0 ? (
          <Alert tone="warning">
            <p className="font-medium">Points de vigilance</p>
            <ul className="mt-1 list-inside list-disc">
              {advisories.map((issue) => (
                <li key={issue.ruleId}>{issue.raison}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        <ul className="flex flex-col gap-3">
          {SLOT_ORDER.map((slot) => {
            const lines = build.lines.filter((line) => line.slot === slot);
            const multi = MULTI.has(slot);
            return (
              <li key={slot}>
                <Card className="flex flex-col gap-3 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-medium text-ink-muted">
                      {CATEGORY_LABELS[slot]}
                      {multi ? <span className="ml-1 text-xs">(plusieurs possibles)</span> : null}
                    </h2>
                    {editable && (multi || lines.length === 0) ? (
                      <Button
                        variant="secondary"
                        type="button"
                        className="min-h-9 px-3 py-1 text-xs"
                        onClick={() => setOpenSlot(slot)}
                      >
                        Ajouter
                      </Button>
                    ) : null}
                  </div>

                  {lines.length === 0 ? (
                    <p className="text-sm text-ink-muted">Aucun composant sélectionné.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {lines.map((line) => (
                        <li key={line.id}>
                          <LineRow
                            line={line}
                            editable={editable}
                            onReplace={() => setOpenSlot(slot)}
                            replaceable={!multi}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-3 lg:sticky lg:top-24 lg:w-80">
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium">Coût de la configuration</h2>

          <dl className="flex flex-col gap-1.5 text-sm">
            <Row label="Composants du stock" value={formatPrice(cost.stockCents)} />
            <Row label="Composants à acheter" value={formatPrice(cost.toBuyCents)} />
            <Row label="Consommables" value={formatPrice(cost.consumablesCents)} />
            <div className="mt-1 border-t border-border-subtle pt-2">
              <Row label="Coût total" value={formatPrice(cost.totalCents)} strong />
            </div>
          </dl>

          {cost.missingEstimates > 0 ? (
            <Alert tone="warning">
              {cost.missingEstimates} composant(s) à acheter sans estimation : le total est
              sous-évalué.
            </Alert>
          ) : null}

          <div className="rounded-lg bg-surface-hover p-3">
            <p className="text-xs text-ink-muted">
              Prix de vente pour {targetMarginPct} % de marge
            </p>
            <p className="text-lg font-semibold">{formatPrice(suggested)}</p>
          </div>

          <p className="text-xs text-ink-muted">
            {build.lines.filter((l) => l.source === 'stock').length} pièce(s) déjà possédée(s),{' '}
            {build.lines.filter((l) => l.source === 'a_acheter').length} à acheter.
          </p>
        </Card>

        <BottleneckIndicator selection={selection} />
      </aside>

      {openSlot ? (
        <SlotPicker
          buildId={build.id}
          slot={openSlot}
          selection={selection}
          tierRows={tierRows}
          onClose={() => setOpenSlot(null)}
        />
      ) : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={strong ? 'font-semibold' : undefined}>{value}</dd>
    </div>
  );
}

function LineRow({
  line,
  editable,
  onReplace,
  replaceable,
}: {
  line: BuildLine;
  editable: boolean;
  onReplace: () => void;
  replaceable: boolean;
}) {
  const [removeState, removeAction] = useActionState<ActionState, FormData>(
    removeBuildItemAction,
    {},
  );
  const [estimateState, estimateAction] = useActionState<ActionState, FormData>(
    updateLineEstimateAction,
    {},
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-2.5">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={line.imageUrl}
          alt=""
          loading="lazy"
          className="size-14 shrink-0 rounded-md bg-surface object-contain"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] font-medium',
                line.source === 'stock' ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn',
              )}
            >
              {line.source === 'stock' ? 'En stock' : 'À acheter'}
            </span>
            <span className="text-xs text-ink-muted">
              {line.brand}
              {line.condition ? ` · ${CONDITION_LABELS[line.condition]}` : ''}
            </span>
          </div>
          <p className="font-medium break-words">{line.model}</p>
          <p className="line-clamp-1 text-xs text-ink-muted">{line.summary.join(' · ')}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-medium">{formatPriceCompact(line.priceCents)}</p>
          <Link
            href={
              line.inventoryItemId
                ? `/stock/${line.inventoryItemId}`
                : `/catalogue/${line.catalogComponentId}`
            }
            className="text-xs text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            Fiche
          </Link>
        </div>
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          {replaceable ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-9 px-3 py-1 text-xs"
              onClick={onReplace}
            >
              Remplacer
            </Button>
          ) : null}

          <form action={removeAction}>
            <input type="hidden" name="lineId" value={line.id} />
            <Button type="submit" variant="ghost" className="min-h-9 px-3 py-1 text-xs">
              Retirer
            </Button>
          </form>

          {line.source === 'a_acheter' ? (
            <form action={estimateAction} className="flex items-center gap-2">
              <input type="hidden" name="lineId" value={line.id} />
              <label className="text-xs text-ink-muted" htmlFor={`estimate-${line.id}`}>
                Estimation €
              </label>
              <div className="w-24">
                <Input
                  id={`estimate-${line.id}`}
                  name="estimatedPriceEur"
                  type="text"
                  inputMode="decimal"
                  defaultValue={line.priceCents !== null ? String(line.priceCents / 100) : ''}
                  className="min-h-9 py-1 text-sm"
                />
              </div>
              <Button type="submit" variant="ghost" className="min-h-9 px-2 py-1 text-xs">
                OK
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {removeState.error ? <Alert tone="error">{removeState.error}</Alert> : null}
      {estimateState.error ? <Alert tone="error">{estimateState.error}</Alert> : null}
    </div>
  );
}
