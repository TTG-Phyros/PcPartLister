'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { CATEGORY_LABELS, COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';
import { SPEC_FIELDS, type SpecField } from '@/lib/specs/fields';

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

function SpecInput({
  field,
  value,
}: {
  field: SpecField;
  value: string | string[] | undefined;
}) {
  const name = `specs.${field.path}`;
  const single = Array.isArray(value) ? '' : (value ?? '');

  if (field.type === 'boolean') {
    return (
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          name={name}
          defaultChecked={single === 'true' || single === 'on'}
          className="size-5 accent-brand"
        />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === 'multiselect') {
    const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
    return (
      <Field label={field.label} hint={field.hint}>
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm has-checked:border-brand has-checked:bg-brand/15"
            >
              <input
                type="checkbox"
                name={name}
                value={option}
                defaultChecked={selected.has(option)}
                className="size-4 accent-brand"
              />
              {option}
            </label>
          ))}
        </div>
      </Field>
    );
  }

  if (field.type === 'select' && !field.freeText) {
    return (
      <Field label={field.label} htmlFor={name} hint={field.hint}>
        <Select id={name} name={name} defaultValue={single} required={field.required}>
          {!field.required ? <option value="">—</option> : null}
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  // Free text with suggestions: a socket or chipset absent from the list stays typable.
  const listId = field.freeText ? `${name}-options` : undefined;

  return (
    <Field
      label={field.unit ? `${field.label} (${field.unit})` : field.label}
      htmlFor={name}
      hint={field.hint}
    >
      <Input
        id={name}
        name={name}
        type={field.type === 'number' ? 'number' : 'text'}
        step={field.type === 'number' ? (field.step ?? 1) : undefined}
        inputMode={field.type === 'number' ? 'decimal' : undefined}
        defaultValue={single}
        required={field.required}
        list={listId}
      />
      {listId ? (
        <datalist id={listId}>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
    </Field>
  );
}

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

      <section className="flex flex-col gap-4 border-t border-border-subtle pt-6">
        <h2 className="text-sm font-medium text-ink-muted">
          Caractéristiques — {CATEGORY_LABELS[category]}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {SPEC_FIELDS[category].map((field) => (
            <div
              key={field.path}
              className={
                field.type === 'multiselect' || field.type === 'tags' ? 'sm:col-span-2' : undefined
              }
            >
              {/* Remount on category change so defaults follow the selected type. */}
              <SpecInput
                key={`${category}:${field.path}`}
                field={field}
                value={defaultFor(`specs.${field.path}`, initial.specValues[field.path] ?? '')}
              />
            </div>
          ))}
        </div>
      </section>

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
