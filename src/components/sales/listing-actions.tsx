'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { listForSaleAction, unlistAction } from '@/actions/sales';
import { Alert, Button, Field, Input } from '@/components/ui';
import { formatPrice } from '@/lib/catalog/format';
import type { SaleSubject } from '@/lib/sales/labels';

function Submit({
  label,
  pendingLabel,
  variant,
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className="shrink-0">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Puts a configuration, a lot or a component on sale, and re-prices it once it
 * is announced. The asking price is free — the field simply opens at the price
 * that reaches the margin objective, which is the answer most of the time.
 */
export function ListForSale({
  subject,
  suggestedPriceCents,
  askingPriceCents,
  targetMarginPct,
  costCents,
  listed = false,
}: {
  subject: SaleSubject;
  suggestedPriceCents: number;
  /** Price asked the last time it was listed, if it has been listed before. */
  askingPriceCents?: number | null;
  targetMarginPct: number;
  costCents: number;
  /** Already announced: the form then only moves the price. */
  listed?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(listForSaleAction, {});

  // Adding a part moves the cost, so it must move the price the field opens on:
  // the state follows the recommendation until the user overrides it again.
  const opening = String((askingPriceCents ?? suggestedPriceCents) / 100);
  const [price, setPrice] = useState(opening);
  const [lastOpening, setLastOpening] = useState(opening);
  if (opening !== lastOpening) {
    setLastOpening(opening);
    setPrice(opening);
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="subjectKind" value={subject.kind} />
      <input type="hidden" name="subjectId" value={subject.id} />

      <div className="sm:max-w-sm">
        <Field
          label="Prix demandé (€)"
          htmlFor={`askingPriceEur-${subject.id}`}
          hint={`Coût de revient ${formatPrice(costCents)} · laissez vide pour annoncer sans prix.`}
        >
          <div className="flex gap-2">
            <Input
              id={`askingPriceEur-${subject.id}`}
              name="askingPriceEur"
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
            {/* One tap back to the recommendation, after any amount of tweaking. */}
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 whitespace-nowrap"
              onClick={() => setPrice(String(suggestedPriceCents / 100))}
              title={`Prix conseillé pour ${targetMarginPct} % de marge`}
            >
              {targetMarginPct} % : {formatPrice(suggestedPriceCents)}
            </Button>
          </div>
        </Field>
      </div>

      <div>
        {listed ? (
          <Submit
            label="Mettre à jour le prix"
            pendingLabel="Mise à jour…"
            variant="secondary"
          />
        ) : (
          <Submit label="Mettre en vente" pendingLabel="Mise en vente…" />
        )}
      </div>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
    </form>
  );
}

/** Takes the listing back without recording any sale. */
export function Unlist({ subject }: { subject: SaleSubject }) {
  const [state, formAction] = useActionState<ActionState, FormData>(unlistAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="subjectKind" value={subject.kind} />
      <input type="hidden" name="subjectId" value={subject.id} />
      <div>
        <Submit label="Retirer de la vente" pendingLabel="Retrait…" variant="ghost" />
      </div>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </form>
  );
}
