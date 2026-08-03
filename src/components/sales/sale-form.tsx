'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { deleteSaleAction, recordSaleAction } from '@/actions/sales';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { formatPrice } from '@/lib/catalog/format';
import { PLATFORM_LABELS, SALE_PLATFORMS } from '@/lib/inventory/labels';
import type { SaleForBuild } from '@/lib/sales/queries';
import { computeMargin, platformFeeFromPct } from '@/lib/sales/pricing';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Enregistrement…' : label}
    </Button>
  );
}

function toCents(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
}

function toEuros(cents: number): string {
  return String(cents / 100);
}

/**
 * Sale form with the margin recomputed as you type: the number that decides
 * whether the build was worth it should never be one submit away.
 */
export function SaleForm({
  buildId,
  costCents,
  suggestedPriceCents,
  targetMarginPct,
  defaultPlatformFeePct,
  sale,
}: {
  buildId: string;
  costCents: number;
  suggestedPriceCents: number;
  targetMarginPct: number;
  defaultPlatformFeePct: number;
  sale: SaleForBuild | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(recordSaleAction, {});
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteSaleAction, {});

  const [salePrice, setSalePrice] = useState(
    sale ? toEuros(sale.salePriceCents) : toEuros(suggestedPriceCents),
  );
  const [shipping, setShipping] = useState(sale ? toEuros(sale.shippingCostCents) : '0');
  const [fee, setFee] = useState(sale ? toEuros(sale.platformFeeCents) : '0');

  const margin = computeMargin({
    salePriceCents: toCents(salePrice),
    shippingCostCents: toCents(shipping),
    platformFeeCents: toCents(fee),
    costCents,
  });

  const today = new Date();
  const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="buildId" value={buildId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Prix de vente (€)"
            htmlFor="salePriceEur"
            hint={`Suggestion à ${targetMarginPct} % de marge : ${formatPrice(suggestedPriceCents)}`}
          >
            <Input
              id="salePriceEur"
              name="salePriceEur"
              type="text"
              inputMode="decimal"
              value={salePrice}
              onChange={(event) => setSalePrice(event.target.value)}
              required
            />
          </Field>

          <Field label="Date de vente" htmlFor="saleDate">
            <Input
              id="saleDate"
              name="saleDate"
              type="date"
              defaultValue={sale?.saleDate ?? isoToday}
              required
            />
          </Field>

          <Field label="Plateforme" htmlFor="salePlatform">
            <Select id="salePlatform" name="platform" defaultValue={sale?.platform ?? 'leboncoin'}>
              {SALE_PLATFORMS.map((value) => (
                <option key={value} value={value}>
                  {PLATFORM_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Frais de port (€)" htmlFor="shippingCostEur">
            <Input
              id="shippingCostEur"
              name="shippingCostEur"
              type="text"
              inputMode="decimal"
              value={shipping}
              onChange={(event) => setShipping(event.target.value)}
            />
          </Field>

          <Field label="Commission plateforme (€)" htmlFor="platformFeeEur">
            <div className="flex gap-2">
              <Input
                id="platformFeeEur"
                name="platformFeeEur"
                type="text"
                inputMode="decimal"
                value={fee}
                onChange={(event) => setFee(event.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 whitespace-nowrap"
                onClick={() =>
                  setFee(
                    toEuros(platformFeeFromPct(toCents(salePrice), defaultPlatformFeePct)),
                  )
                }
              >
                {defaultPlatformFeePct} %
              </Button>
            </div>
          </Field>
        </div>

        <Field label="Notes sur l’acheteur / la vente" htmlFor="buyerNotes">
          <textarea
            id="buyerNotes"
            name="buyerNotes"
            rows={2}
            defaultValue={sale?.buyerNotes ?? ''}
            className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </Field>

        <div
          className={`rounded-lg border p-3 ${
            margin.marginCents >= 0
              ? 'border-ok/40 bg-ok/10'
              : 'border-danger/40 bg-danger/10'
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-ink-muted">Marge</span>
            <span
              className={`text-xl font-semibold ${margin.marginCents >= 0 ? 'text-ok' : 'text-danger'}`}
            >
              {formatPrice(margin.marginCents)} ({margin.marginPct.toFixed(1)} %)
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {formatPrice(margin.salePriceCents)} − {formatPrice(margin.shippingCostCents)} de port
            − {formatPrice(margin.platformFeeCents)} de commission −{' '}
            {formatPrice(costCents)} de coût
          </p>
        </div>

        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <div>
          <Submit label={sale ? 'Mettre à jour la vente' : 'Enregistrer la vente'} />
        </div>
      </form>

      {sale ? (
        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (!confirm('Annuler cette vente ? La configuration repassera en « montée ».')) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="buildId" value={buildId} />
          <Button type="submit" variant="ghost" className="min-h-10 text-sm">
            Annuler la vente
          </Button>
          {deleteState.error ? <Alert tone="error">{deleteState.error}</Alert> : null}
        </form>
      ) : null}
    </div>
  );
}
