'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { markItemReceivedAction } from '@/actions/inventory';
import { Alert, Button } from '@/components/ui';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Enregistrement…' : label}
    </Button>
  );
}

/**
 * The one action a waiting unit needs, and the only way out of waiting: the
 * unit lands on the shelf and becomes available to the configurator, without a
 * detour through the edit form. Same action for a parcel and for a hand-over —
 * only the wording differs.
 */
export function MarkReceived({ id, label = 'Marquer comme reçu' }: { id: string; label?: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(markItemReceivedAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <div>
        <Submit label={label} />
      </div>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </form>
  );
}
