'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { createBuildAction } from '@/actions/builds';
import { Alert, Button, Input } from '@/components/ui';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="shrink-0">
      {pending ? 'Création…' : 'Nouvelle configuration'}
    </Button>
  );
}

export function CreateBuildForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createBuildAction, {});
  const today = new Date().toLocaleDateString('fr-FR');

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="name"
          placeholder={`Config du ${today}`}
          defaultValue={`Config du ${today}`}
          aria-label="Nom de la configuration"
          required
        />
        <Submit />
      </div>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </form>
  );
}
