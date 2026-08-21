'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import {
  deletePurchaseBatchAction,
  markBatchReceivedAction,
  updatePurchaseBatchAction,
} from '@/actions/batches';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import type { PurchaseBatchDetail } from '@/lib/batches/types';
import {
  CARRIER_LABELS,
  SHIPPING_CARRIERS,
  carrierHasTemplate,
  trackingLink,
  type ShippingCarrier,
} from '@/lib/inventory/tracking';

function Submit({
  label,
  variant,
}: {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className="min-h-10 text-sm">
      {pending ? '…' : label}
    </Button>
  );
}

/**
 * The shared half of the batch: its name, its parcel, its notes. Saving pushes
 * the tracking back onto every unit, which is why a batch is worth a row.
 */
export function BatchMetaForm({ batch }: { batch: PurchaseBatchDetail }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updatePurchaseBatchAction,
    {},
  );

  const [carrier, setCarrier] = useState<ShippingCarrier | ''>(batch.shippingCarrier ?? '');
  const [trackingNumber, setTrackingNumber] = useState(batch.trackingNumber ?? '');
  const [trackingUrlValue, setTrackingUrlValue] = useState(batch.trackingUrl ?? '');

  const preview = trackingLink({
    shippingCarrier: carrier === '' ? null : carrier,
    trackingNumber,
    trackingUrl: trackingUrlValue,
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={batch.id} />

      <Field label="Libellé du lot" htmlFor="label">
        <Input id="label" name="label" defaultValue={batch.label} required maxLength={120} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Transporteur" htmlFor="shippingCarrier">
          <Select
            id="shippingCarrier"
            name="shippingCarrier"
            defaultValue={batch.shippingCarrier ?? ''}
            onChange={(e) => setCarrier(e.target.value as ShippingCarrier | '')}
          >
            <option value="">Aucun / inconnu</option>
            {SHIPPING_CARRIERS.map((value) => (
              <option key={value} value={value}>
                {CARRIER_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Numéro de suivi"
          htmlFor="trackingNumber"
          hint={
            carrier !== '' && !carrierHasTemplate(carrier)
              ? 'Ce transporteur n’a pas de page de suivi directe : collez le lien ci-dessous.'
              : undefined
          }
        >
          <Input
            id="trackingNumber"
            name="trackingNumber"
            inputMode="numeric"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
          />
        </Field>

        <Field
          label="Lien de suivi"
          htmlFor="trackingUrl"
          hint={
            preview ? (
              <a
                href={preview}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4 hover:text-ink"
              >
                Tester le lien de suivi
              </a>
            ) : (
              'Généré depuis le transporteur et le numéro, ou collé à la main.'
            )
          }
        >
          <Input
            id="trackingUrl"
            name="trackingUrl"
            type="url"
            inputMode="url"
            value={trackingUrlValue}
            onChange={(e) => setTrackingUrlValue(e.target.value)}
          />
        </Field>

        <Field label="Livraison prévue le" htmlFor="expectedArrival">
          <Input
            id="expectedArrival"
            name="expectedArrival"
            type="date"
            defaultValue={batch.expectedArrival ?? ''}
          />
        </Field>

        <Field label="Lien de l’annonce" htmlFor="listingUrl">
          <Input
            id="listingUrl"
            name="listingUrl"
            type="url"
            inputMode="url"
            placeholder="https://…"
            defaultValue={batch.listingUrl ?? ''}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={batch.notes ?? ''}
          className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </Field>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div>
        <Submit label="Enregistrer" />
      </div>
    </form>
  );
}

/** One parcel, one arrival: every unit still travelling lands in one tap. */
export function MarkBatchReceived({ id, pending }: { id: string; pending: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    markBatchReceivedAction,
    {},
  );

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <Submit
          label={
            pending > 1
              ? `Marquer les ${pending} unités comme reçues`
              : 'Marquer l’unité comme reçue'
          }
        />
      </form>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
    </div>
  );
}

export function DeleteBatch({ batch }: { batch: PurchaseBatchDetail }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    deletePurchaseBatchAction,
    {},
  );

  return (
    <div className="flex flex-col gap-2">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (
            !confirm(
              `Dissoudre le lot « ${batch.label} » ? Ses ${batch.lines.length} unités restent au stock, mais perdent le lien vers le colis.`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={batch.id} />
        <Submit label="Dissoudre le lot" variant="danger" />
      </form>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </div>
  );
}
