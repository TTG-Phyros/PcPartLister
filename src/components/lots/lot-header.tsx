'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { createLotAction, deleteLotAction, updateLotMetaAction } from '@/actions/lots';
import { Alert, Button, Field, Input } from '@/components/ui';
import type { LotDetail } from '@/lib/lots/types';

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

/** Opens a lot from the sales page, ready to receive units. */
export function CreateLotForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createLotAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Field label="Nom du lot" htmlFor="lotName">
            <Input
              id="lotName"
              name="name"
              placeholder="Lot bureautique, pièces AM4…"
              required
              maxLength={120}
            />
          </Field>
        </div>
        <Submit label="Créer le lot" />
      </div>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </form>
  );
}

export function LotMetaForm({ lot }: { lot: LotDetail }) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateLotMetaAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={lot.id} />

      <Field label="Nom du lot" htmlFor="name">
        <Input id="name" name="name" defaultValue={lot.name} required maxLength={120} />
      </Field>

      <Field label="Notes" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={lot.notes ?? ''}
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

export function DeleteLot({ lot }: { lot: LotDetail }) {
  const [state, formAction] = useActionState<ActionState, FormData>(deleteLotAction, {});

  return (
    <div className="flex flex-col gap-2">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (!confirm(`Supprimer le lot « ${lot.name} » ? Ses unités reviennent au stock.`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={lot.id} />
        <Submit label="Supprimer le lot" variant="danger" />
      </form>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </div>
  );
}
