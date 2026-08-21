import { computeTargetMargin, type BuildCost } from '@/lib/builds/pricing';
import { formatPrice } from '@/lib/catalog/format';
import { computeMargin } from '@/lib/sales/pricing';
import type { SaleRecord } from '@/lib/sales/queries';

/**
 * What the configuration would make at the price it aims for, next to what it
 * actually made once sold. The objective is a simulation and stops at « price
 * minus cost »; the concluded sale nets out postage and commission, so the two
 * columns are labelled rather than silently compared.
 */
export function MarginSummary({
  cost,
  targetPriceCents,
  sale,
}: {
  cost: BuildCost;
  targetPriceCents: number | null;
  sale: SaleRecord | null;
}) {
  const target = computeTargetMargin(targetPriceCents, cost.totalCents);
  const real = sale
    ? computeMargin({
        salePriceCents: sale.salePriceCents,
        shippingCostCents: sale.shippingCostCents,
        platformFeeCents: sale.platformFeeCents,
        costCents: cost.totalCents,
      })
    : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-hover p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Marge</h3>
        <span className="text-xs text-ink-muted">
          Coût de revient : {formatPrice(cost.totalCents)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MarginColumn
          title="Objectif"
          priceLabel="Prix objectif"
          figures={
            target && {
              priceCents: target.targetPriceCents,
              marginCents: target.marginCents,
              marginPct: target.marginPct,
            }
          }
          note={
            target === null
              ? 'Renseignez un prix objectif dans « Informations » pour simuler la marge.'
              : 'Hors frais de port et commission.'
          }
        />

        {/* Only once a sale exists: before that there is nothing real to compare. */}
        {real ? (
          <MarginColumn
            title="Réel"
            priceLabel="Prix de vente"
            figures={{
              priceCents: real.salePriceCents,
              marginCents: real.marginCents,
              marginPct: real.marginPct,
            }}
            note={`Net de ${formatPrice(real.shippingCostCents)} de port et ${formatPrice(
              real.platformFeeCents,
            )} de commission.`}
          />
        ) : null}
      </div>

      {target && real ? (
        <p className="border-t border-border-subtle pt-2 text-xs text-ink-muted">
          Écart objectif → réel : {real.marginCents >= target.marginCents ? '+' : '−'}
          {formatPrice(Math.abs(real.marginCents - target.marginCents))}.
        </p>
      ) : null}

      {cost.missingEstimates > 0 ? (
        <p className="text-xs text-warn">
          {cost.missingEstimates} composant(s) à acheter sans estimation : le coût est sous-évalué,
          donc la marge est surévaluée.
        </p>
      ) : null}
    </div>
  );
}

/** `figures` absent — no objective set — is what « non renseigné » stands for. */
function MarginColumn({
  title,
  priceLabel,
  figures,
  note,
}: {
  title: string;
  priceLabel: string;
  figures: { priceCents: number; marginCents: number; marginPct: number } | null;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{title}</p>
      {figures === null ? (
        <p className="text-lg font-semibold text-ink-muted">Non renseigné</p>
      ) : (
        <>
          <p
            className={`text-lg font-semibold ${
              figures.marginCents >= 0 ? 'text-ok' : 'text-danger'
            }`}
          >
            {formatPrice(figures.marginCents)} ({figures.marginPct.toFixed(1)} %)
          </p>
          <p className="text-xs text-ink-muted">
            {priceLabel} : {formatPrice(figures.priceCents)}
          </p>
        </>
      )}
      <p className="text-xs text-ink-muted">{note}</p>
    </div>
  );
}
