'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { deleteInventoryItemAction } from '@/actions/inventory';
import { Alert, Button } from '@/components/ui';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending} className="min-h-10 text-sm">
      {pending ? '…' : 'Supprimer cette unité'}
    </Button>
  );
}

export function DeleteInventoryItem({ id, label }: { id: string; label: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    deleteInventoryItemAction,
    {},
  );

  return (
    <div className="flex flex-col gap-3">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!confirm(`Supprimer définitivement cette unité (${label}) ?`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <Submit />
      </form>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </div>
  );
}
