'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { clearCatalogImageAction, deleteCatalogComponentAction } from '@/actions/catalog';
import { Alert, Button } from '@/components/ui';

function Submit({ label, variant }: { label: string; variant: 'secondary' | 'danger' }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className="min-h-10 text-sm">
      {pending ? '…' : label}
    </Button>
  );
}

export function CatalogDangerZone({
  id,
  model,
  hasImage,
}: {
  id: string;
  model: string;
  hasImage: boolean;
}) {
  const [deleteState, deleteFormAction] = useActionState<ActionState, FormData>(
    deleteCatalogComponentAction,
    {},
  );
  const [imageState, imageFormAction] = useActionState<ActionState, FormData>(
    clearCatalogImageAction,
    {},
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {hasImage ? (
          <form action={imageFormAction}>
            <input type="hidden" name="id" value={id} />
            <Submit label="Retirer l’image" variant="secondary" />
          </form>
        ) : null}

        <form
          action={deleteFormAction}
          onSubmit={(e) => {
            if (!confirm(`Supprimer « ${model} » du catalogue ?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <Submit label="Supprimer du catalogue" variant="danger" />
        </form>
      </div>

      {deleteState.error ? <Alert tone="error">{deleteState.error}</Alert> : null}
      {imageState.success ? <Alert tone="success">{imageState.success}</Alert> : null}
      {imageState.error ? <Alert tone="error">{imageState.error}</Alert> : null}
    </div>
  );
}
