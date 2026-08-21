'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import {
  deleteBuildAction,
  setBuildStatusAction,
  updateBuildMetaAction,
} from '@/actions/builds';
import { Alert, Button, Field, Input, cn } from '@/components/ui';
import {
  BUILD_STATUSES,
  BUILD_STATUS_LABELS,
  type BuildDetail,
  type BuildStatus,
} from '@/lib/builds/types';

const FLOW: BuildStatus[] = [...BUILD_STATUSES];

const STATUS_HINTS: Record<BuildStatus, string> = {
  brouillon: 'Les unités du stock sont réservées pour cette configuration.',
  montee: 'Les unités sont marquées « montées » dans le stock.',
  en_vente:
    'La configuration est annoncée : ses unités sont « en vente » et la fiche propose de conclure la vente.',
  vendue: 'Les unités sont marquées « vendues ».',
};

function Submit({ label, variant }: { label: string; variant?: 'primary' | 'secondary' | 'danger' }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className="min-h-10 text-sm">
      {pending ? '…' : label}
    </Button>
  );
}

export function BuildStatusFlow({ build }: { build: BuildDetail }) {
  const [state, formAction] = useActionState<ActionState, FormData>(setBuildStatusAction, {});

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {FLOW.map((status) => (
          <form key={status} action={formAction}>
            <input type="hidden" name="id" value={build.id} />
            <input type="hidden" name="status" value={status} />
            <button
              type="submit"
              aria-current={build.status === status ? 'step' : undefined}
              className={cn(
                'min-h-10 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                build.status === status
                  ? 'border-brand bg-brand/15 text-ink'
                  : 'border-border-subtle text-ink-muted hover:bg-surface-hover',
              )}
            >
              {BUILD_STATUS_LABELS[status]}
            </button>
          </form>
        ))}
      </div>
      <p className="text-xs text-ink-muted">{STATUS_HINTS[build.status]}</p>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </div>
  );
}

export function BuildMetaForm({ build }: { build: BuildDetail }) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateBuildMetaAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={build.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom de la configuration" htmlFor="name">
          <Input id="name" name="name" defaultValue={build.name} required />
        </Field>
        <Field
          label="Consommables (€)"
          htmlFor="consumablesEur"
          hint="Pâte thermique, visserie, colliers…"
        >
          <Input
            id="consumablesEur"
            name="consumablesEur"
            type="text"
            inputMode="decimal"
            defaultValue={String(build.consumablesCents / 100)}
          />
        </Field>
        <Field
          label="Prix objectif de vente (€)"
          htmlFor="targetPriceEur"
          hint="Pour simuler la marge. Ne met pas la configuration en vente ; laissez vide si vous n’avez pas d’objectif."
        >
          <Input
            id="targetPriceEur"
            name="targetPriceEur"
            type="text"
            inputMode="decimal"
            placeholder="Non renseigné"
            defaultValue={
              build.targetPriceCents === null ? '' : String(build.targetPriceCents / 100)
            }
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={build.notes ?? ''}
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

export function DeleteBuild({ build }: { build: BuildDetail }) {
  const [state, formAction] = useActionState<ActionState, FormData>(deleteBuildAction, {});

  return (
    <div className="flex flex-col gap-2">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (!confirm(`Supprimer la configuration « ${build.name} » ?`)) event.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={build.id} />
        <Submit label="Supprimer la configuration" variant="danger" />
      </form>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </div>
  );
}
