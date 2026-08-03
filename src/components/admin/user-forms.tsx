'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import {
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
} from '@/actions/users';
import { Alert, Button, Field, Input, Select } from '@/components/ui';

function Submit({ label, variant }: { label: string; variant?: 'primary' | 'danger' }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? '…' : label}
    </Button>
  );
}

/** Suggests a strong password so the admin never invents a weak one. */
function generatePassword(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint32Array(16));
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
}

export function CreateUserForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createUserAction, {});
  const [password, setPassword] = useState('');

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Adresse email" htmlFor="new-email">
        <Input id="new-email" name="email" type="email" inputMode="email" required />
      </Field>

      <Field label="Rôle" htmlFor="new-role">
        <Select id="new-role" name="role" defaultValue="user">
          <option value="user">Utilisateur</option>
          <option value="admin">Administrateur</option>
        </Select>
      </Field>

      <Field
        label="Mot de passe initial"
        htmlFor="new-password"
        hint="10 caractères minimum. Transmettez-le au titulaire du compte."
      >
        <div className="flex gap-2">
          <Input
            id="new-password"
            name="password"
            type="text"
            minLength={10}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            onClick={() => setPassword(generatePassword())}
          >
            Générer
          </Button>
        </div>
      </Field>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Submit label="Créer le compte" />
    </form>
  );
}

export function UserRowActions({ userId, email }: { userId: string; email: string }) {
  const [deleteState, deleteFormAction] = useActionState<ActionState, FormData>(
    deleteUserAction,
    {},
  );
  const [resetState, resetFormAction] = useActionState<ActionState, FormData>(
    resetUserPasswordAction,
    {},
  );
  const [resetOpen, setResetOpen] = useState(false);
  const [password, setPassword] = useState('');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="min-h-9 px-3 py-1 text-xs"
          onClick={() => {
            setResetOpen((v) => !v);
            if (!password) setPassword(generatePassword());
          }}
        >
          Réinitialiser le mot de passe
        </Button>

        <form
          action={deleteFormAction}
          onSubmit={(e) => {
            if (!confirm(`Supprimer définitivement le compte ${email} ?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" variant="danger" className="min-h-9 px-3 py-1 text-xs">
            Supprimer
          </Button>
        </form>
      </div>

      {resetOpen ? (
        <form action={resetFormAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="userId" value={userId} />
          <Input
            name="password"
            type="text"
            minLength={10}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="max-w-xs"
          />
          <Submit label="Appliquer" />
        </form>
      ) : null}

      {deleteState.error ? <Alert tone="error">{deleteState.error}</Alert> : null}
      {resetState.error ? <Alert tone="error">{resetState.error}</Alert> : null}
      {resetState.success ? <Alert tone="success">{resetState.success}</Alert> : null}
    </div>
  );
}
