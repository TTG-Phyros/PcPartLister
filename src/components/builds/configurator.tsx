'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ActionState } from '@/actions/auth';
import { removeBuildItemAction, updateLinePriceAction } from '@/actions/builds';
import { BottleneckIndicator } from '@/components/builds/bottleneck-indicator';
import { SlotPicker } from '@/components/builds/slot-picker';
import { Alert, Button, Card, Input, cn } from '@/components/ui';
import {
  computeBuildCost,
  computeTargetMargin,
  headlinePrice,
  suggestedSalePriceCents,
} from '@/lib/builds/pricing';
import { selectionFromLines } from '@/lib/builds/selection';
import { SLOT_ORDER, lineBadge, type BuildDetail, type BuildLine } from '@/lib/builds/types';
import { formatPrice, formatPriceCompact } from '@/lib/catalog/format';
import { blockingIssues, evaluate, warnings } from '@/lib/compat/engine';
import { cpuGpuBottleneckRule } from '@/lib/compat/rules/advisory';
import { CONDITION_LABELS } from '@/lib/inventory/labels';
import { stillAwaited } from '@/lib/inventory/status';
import { CATEGORY_LABELS, MULTI_SLOT_CATEGORIES, type ComponentCategory } from '@/lib/specs';
import type { TierListKind } from '@/lib/tier-list/kinds';
import type { TierRow } from '@/lib/tier-list/types';

const MULTI = new Set<ComponentCategory>(MULTI_SLOT_CATEGORIES);

/** The suggestion is left out: its label carries the margin objective inline. */
const HEADLINE_LABELS: Record<'sale' | 'asking' | 'target', string> = {
  sale: 'Prix de vente',
  asking: 'Prix demandé',
  target: 'Prix objectif',
};

/**
 * Slots a finished configuration may legitimately leave empty. Everything else
 * is required hardware: a PC without one of them is not a PC.
 */
const OPTIONAL_SLOTS = new Set<ComponentCategory>(['misc']);

export function Configurator({
  build,
  targetMarginPct,
  salePriceCents,
  editable,
  tierRows,
}: {
  build: BuildDetail;
  targetMarginPct: number;
  /** Price the sale concluded at, once there is one: the last word on the panel. */
  salePriceCents: number | null;
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
  const headline = headlinePrice({
    status: build.status,
    targetMargin: computeTargetMargin(build.targetPriceCents, cost.totalCents),
    askingPriceCents: build.askingPriceCents,
    salePriceCents,
    suggestedCents: suggested,
  });
  // Owned units counted at something other than what they cost: worth saying,
  // since the total no longer matches the stock prices.
  const adjusted = build.lines.filter((line) => line.originalPriceCents !== null).length;

  // Units held by the configuration that are still on their way. Read off the
  // reception date, like everywhere else: the status alone would call a parcel
  // set aside for a draft « réservée » and leave it looking available.
  const awaited = stillAwaited(
    build.lines.map((line) => line.unit).filter((unit) => unit !== null),
  );

  // Required slots with nothing in them: what the configuration still needs.
  const missingSlots = SLOT_ORDER.filter(
    (slot) => !OPTIONAL_SLOTS.has(slot) && !build.lines.some((line) => line.slot === slot),
  );

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

        {missingSlots.length > 0 && editable ? (
          <Alert tone="error">
            <p className="font-medium">
              {missingSlots.length} composant{missingSlots.length > 1 ? 's' : ''} manquant
              {missingSlots.length > 1 ? 's' : ''}
            </p>
            <p className="mt-1">
              {missingSlots.map((slot) => CATEGORY_LABELS[slot]).join(', ')} : sans eux la machine
              ne démarre pas.
            </p>
          </Alert>
        ) : null}

        <ul className="flex flex-col gap-3">
          {SLOT_ORDER.map((slot) => {
            const lines = build.lines.filter((line) => line.slot === slot);
            const multi = MULTI.has(slot);
            // A slot left empty is flagged in red, except the optional ones:
            // « Divers » holds the extras, a configuration is complete without it.
            const missing = editable && lines.length === 0 && !OPTIONAL_SLOTS.has(slot);
            return (
              <li key={slot}>
                <Card className={cn('flex flex-col gap-3 p-3', missing && 'border-danger')}>
                  <div className="flex items-center justify-between gap-3">
                    <h2
                      className={cn(
                        'text-sm font-medium',
                        missing ? 'text-danger' : 'text-ink-muted',
                      )}
                    >
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
                    <p className={cn('text-sm', missing ? 'text-danger' : 'text-ink-muted')}>
                      {missing ? 'Composant manquant.' : 'Aucun composant sélectionné.'}
                    </p>
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
              {headline.kind === 'suggested'
                ? `Prix de vente pour ${targetMarginPct} % de marge`
                : HEADLINE_LABELS[headline.kind]}
            </p>
            <p className="text-lg font-semibold">{formatPrice(headline.priceCents)}</p>
            {headline.margin ? (
              <p
                className={cn(
                  'text-xs',
                  headline.margin.marginCents >= 0 ? 'text-ok' : 'text-danger',
                )}
              >
                Marge estimée : {formatPrice(headline.margin.marginCents)} (
                {headline.margin.marginPct.toFixed(1)} %)
              </p>
            ) : null}
          </div>

          <p className="text-xs text-ink-muted">
            {build.lines.filter((l) => l.source === 'stock').length} pièce(s) déjà possédée(s),{' '}
            {build.lines.filter((l) => l.source === 'a_acheter').length} à acheter.
            {/* Owned is not the same as usable: a parcel counts among the
                pieces above and still keeps the configuration waiting. */}
            {awaited > 0
              ? ` ${awaited} n’${awaited > 1 ? 'ont' : 'a'} pas encore été reçue${
                  awaited > 1 ? 's' : ''
                }.`
              : ''}
          </p>

          {adjusted > 0 ? (
            <p className="text-xs text-ink-muted">
              {adjusted} pièce(s) comptée(s) à un coût ajusté ; leur prix d’achat en stock reste
              inchangé.
            </p>
          ) : null}
        </Card>

        <BottleneckIndicator selection={selection} />
      </aside>

      {openSlot ? (
        <SlotPicker
          buildId={build.id}
          buildStatus={build.status}
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
  const [priceState, priceAction] = useActionState<ActionState, FormData>(
    updateLinePriceAction,
    {},
  );

  const owned = line.source === 'stock';

  const badge = lineBadge(line);

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
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', badge.tone)}>
              {badge.label}
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
          {/* An adjusted cost says nothing without the price it replaces. */}
          {line.originalPriceCents !== null ? (
            <p className="text-xs text-ink-muted">
              au lieu de{' '}
              <span className="line-through">{formatPriceCompact(line.originalPriceCents)}</span>
            </p>
          ) : null}
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

          {/* The same field on both kinds of line: what this configuration is
              charged for the part. An estimate for one still to buy, the cost
              actually borne for a unit already owned — zero for a gift, the
              agreed share for a part salvaged from an old machine. Blank it and
              the purchase price applies again. */}
          <form action={priceAction} className="flex items-center gap-2">
            <input type="hidden" name="lineId" value={line.id} />
            <label className="text-xs text-ink-muted" htmlFor={`price-${line.id}`}>
              {owned ? 'Coût réel €' : 'Estimation €'}
            </label>
            <div className="w-24">
              <Input
                // Remounted when the stored figure changes, so blanking the
                // field shows the price it fell back to instead of staying empty.
                key={line.priceCents ?? 'vide'}
                id={`price-${line.id}`}
                name="priceEur"
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
        </div>
      ) : null}

      {removeState.error ? <Alert tone="error">{removeState.error}</Alert> : null}
      {priceState.error ? <Alert tone="error">{priceState.error}</Alert> : null}
    </div>
  );
}
