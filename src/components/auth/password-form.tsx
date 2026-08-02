'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { Alert, Button, Field, Input } from '@/components/ui';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Enregistrement…' : label}
    </Button>
  );
}

export function PasswordForm({
  action,
  submitLabel = 'Changer le mot de passe',
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Mot de passe actuel" htmlFor="currentPassword">
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Field
        label="Nouveau mot de passe"
        htmlFor="newPassword"
        hint="10 caractères minimum."
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>

      <Field label="Confirmer le nouveau mot de passe" htmlFor="confirmPassword">
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
