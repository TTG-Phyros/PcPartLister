'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { changeInventoryModelAction } from '@/actions/inventory';
import { CatalogPicker } from '@/components/inventory/catalog-picker';
import { Alert, Button } from '@/components/ui';
import type { ComponentCategory } from '@/lib/specs';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="min-h-10 text-sm">
      {pending ? '…' : 'Rattacher à ce modèle'}
    </Button>
  );
}

/**
 * Corrects the model a unit points at, when the wrong reference was picked at
 * entry. Collapsed by default: the fiche is read first, edited rarely.
 */
export function ChangeInventoryModel({
  id,
  category,
  lockedToCategory,
}: {
  id: string;
  category: ComponentCategory;
  /** Engaged in a configuration: the slot only accepts its own category. */
  lockedToCategory?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    changeInventoryModelAction,
    {},
  );
  const [open, setOpen] = useState(false);

  // The page re-renders with the new model once the action succeeds; leaving the
  // picker open would show a stale search next to it.
  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <div>
          <Button
            type="button"
            variant="secondary"
            className="min-h-10 text-sm"
            onClick={() => setOpen(true)}
          >
            Changer le modèle
          </Button>
        </div>
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border-subtle p-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-ink-muted">
        L’unité garde son prix, ses dates et son historique : seule la référence du catalogue
        change.
        {lockedToCategory
          ? ' Utilisée dans une configuration, elle ne peut être rattachée qu’à un modèle de la même catégorie.'
          : ''}
      </p>

      <CatalogPicker name="catalogComponentId" initialCategory={category} />

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <Submit />
        <Button
          type="button"
          variant="ghost"
          className="min-h-10 text-sm"
          onClick={() => setOpen(false)}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
