'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { SpecFieldsSection } from '@/components/catalog/spec-fields';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { CATEGORY_LABELS, COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';

export type CatalogFormInitial = {
  id?: string;
  category: ComponentCategory;
  brand: string;
  model: string;
  releaseYear: string;
  msrpEur: string;
  /** Pre-filled spec inputs, keyed by field path. */
  specValues: Record<string, string | string[]>;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Enregistrement…' : label}
    </Button>
  );
}

export function CatalogForm({
  action,
  initial,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: CatalogFormInitial;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  // Drives which spec fields are shown; the identity fields keep their values.
  const [category, setCategory] = useState<ComponentCategory>(initial.category);

  // React resets an uncontrolled form once the action resolves, so a rejected
  // submission is re-rendered from the values the action echoed back.
  const echoed = state.values;
  const defaultFor = (name: string, fallback: string | string[] = ''): string | string[] => {
    const value = echoed?.[name];
    if (value !== undefined) return value;
    // An unchecked checkbox is simply absent from FormData, so once an echo
    // exists a missing key means "off", not "keep the previous value".
    return echoed ? '' : fallback;
  };
  const text = (name: string, fallback = ''): string => {
    const value = defaultFor(name, fallback);
    return Array.isArray(value) ? (value[0] ?? '') : value;
  };

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <section className="flex flex-col gap-4">
        <Field label="Catégorie" htmlFor="category">
          <Select
            id="category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ComponentCategory)}
          >
            {COMPONENT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Marque" htmlFor="brand">
            <Input id="brand" name="brand" defaultValue={text('brand', initial.brand)} required />
          </Field>
          <Field label="Modèle" htmlFor="model">
            <Input id="model" name="model" defaultValue={text('model', initial.model)} required />
          </Field>
          <Field label="Année de sortie" htmlFor="releaseYear">
            <Input
              id="releaseYear"
              name="releaseYear"
              type="number"
              inputMode="numeric"
              min={1990}
              max={2100}
              defaultValue={text('releaseYear', initial.releaseYear)}
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
              defaultValue={text('msrpEur', initial.msrpEur)}
            />
          </Field>
        </div>
      </section>

      <div className="border-t border-border-subtle pt-6">
        <SpecFieldsSection
          category={category}
          valueFor={(path) => defaultFor(`specs.${path}`, initial.specValues[path] ?? '')}
        />
      </div>

      <section className="flex flex-col gap-3 border-t border-border-subtle pt-6">
        <Field
          label="Image"
          htmlFor="image"
          hint="PNG, JPEG, WebP, GIF ou SVG, 5 Mo maximum. Sans image, un visuel de remplacement est utilisé."
        >
          <Input id="image" name="image" type="file" accept="image/*" className="py-2" />
        </Field>
      </section>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div className="flex gap-3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
