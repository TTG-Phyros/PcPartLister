'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { ensureCatalogModelAction, type EnsureModelState } from '@/actions/catalog';
import { SpecFieldsSection } from '@/components/catalog/spec-fields';
import { Alert, Button, Field, Input } from '@/components/ui';
import type { CatalogSearchHit } from '@/app/api/catalog/search/route';
import { CATEGORY_LABELS, type ComponentCategory } from '@/lib/specs';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Ajout au catalogue…' : 'Ajouter et continuer'}
    </Button>
  );
}

/**
 * The escape hatch of step 2: the part in hand is not catalogued yet.
 *
 * The model is created straight away rather than at the end of the wizard,
 * because a purchase of several parts is written as a batch and a batch only
 * knows how to point at catalog ids. Creating it twice is harmless — the action
 * reuses an identical model — so a tap repeated on a bad connection cannot
 * litter the catalogue.
 *
 * The category comes from step 1 and is not asked again; the specs are the very
 * fields of the catalog form, so nothing about a model differs by the door it
 * came in through.
 */
export function WizardNewModel({
  category,
  onCreated,
  onCancel,
}: {
  category: ComponentCategory;
  onCreated: (hit: CatalogSearchHit) => void;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState<EnsureModelState, FormData>(
    ensureCatalogModelAction,
    {},
  );

  // Handing the hit back moves the wizard on, which unmounts this form.
  useEffect(() => {
    if (state.hit) onCreated(state.hit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hit]);

  const echoed = state.values;
  const valueFor = (name: string): string | string[] => echoed?.[name] ?? '';
  const text = (name: string): string => {
    const value = valueFor(name);
    return Array.isArray(value) ? (value[0] ?? '') : value;
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="category" value={category} />

      <p className="text-sm text-ink-muted">
        Nouveau modèle de {CATEGORY_LABELS[category].toLowerCase()}. Il rejoint le catalogue et
        sera proposé aux prochaines saisies.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Marque" htmlFor="brand">
          <Input id="brand" name="brand" defaultValue={text('brand')} required autoFocus />
        </Field>
        <Field label="Modèle" htmlFor="model">
          <Input id="model" name="model" defaultValue={text('model')} required />
        </Field>
      </div>

      <SpecFieldsSection category={category} valueFor={(path) => valueFor(`specs.${path}`)} />

      <details className="rounded-lg border border-border-subtle p-3">
        <summary className="cursor-pointer text-sm text-ink-muted">Prix neuf et année</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Année de sortie" htmlFor="releaseYear">
            <Input
              id="releaseYear"
              name="releaseYear"
              type="number"
              inputMode="numeric"
              min={1990}
              max={2100}
              defaultValue={text('releaseYear')}
            />
          </Field>
          <Field label="Prix neuf indicatif (€)" htmlFor="msrpEur">
            <Input
              id="msrpEur"
              name="msrpEur"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              defaultValue={text('msrpEur')}
            />
          </Field>
        </div>
      </details>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        <SubmitButton />
        <Button type="button" variant="secondary" onClick={onCancel}>
          Revenir à la recherche
        </Button>
      </div>
    </form>
  );
}
