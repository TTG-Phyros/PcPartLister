'use client';

import { useActionState } from 'react';
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
 * Puts a configuration or a component on sale. The asking price is optional —
 * announcing the part first and pricing it later is a normal way to work — but
 * it is pre-filled at the price that reaches the margin objective.
 */
export function ListForSale({
  subject,
  suggestedPriceCents,
  askingPriceCents,
  targetMarginPct,
  costCents,
}: {
  subject: SaleSubject;
  suggestedPriceCents: number;
  /** Price asked the last time it was listed, if it has been listed before. */
  askingPriceCents?: number | null;
  targetMarginPct: number;
  costCents: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(listForSaleAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="subjectKind" value={subject.kind} />
      <input type="hidden" name="subjectId" value={subject.id} />

      <div className="sm:max-w-xs">
        <Field
          label="Prix demandé (€)"
          htmlFor={`askingPriceEur-${subject.id}`}
          hint={`Coût de revient ${formatPrice(costCents)} · ${targetMarginPct} % de marge à ${formatPrice(suggestedPriceCents)}`}
        >
          <Input
            id={`askingPriceEur-${subject.id}`}
            name="askingPriceEur"
            type="text"
            inputMode="decimal"
            defaultValue={String((askingPriceCents ?? suggestedPriceCents) / 100)}
          />
        </Field>
      </div>

      <div>
        <Submit label="Mettre en vente" pendingLabel="Mise en vente…" />
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
