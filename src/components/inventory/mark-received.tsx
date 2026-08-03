'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { setInventoryStatusAction } from '@/actions/inventory';
import { Alert, Button } from '@/components/ui';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Enregistrement…' : 'Marquer comme reçu'}
    </Button>
  );
}

/**
 * The one action a parcel page needs: the unit lands on the shelf and becomes
 * available to the configurator, without a detour through the edit form.
 */
export function MarkReceived({ id }: { id: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    setInventoryStatusAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value="en_stock" />
      <div>
        <Submit />
      </div>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </form>
  );
}
