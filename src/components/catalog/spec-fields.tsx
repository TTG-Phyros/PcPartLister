'use client';

import { Field, Input, Select } from '@/components/ui';
import { CATEGORY_LABELS, type ComponentCategory } from '@/lib/specs';
import { SPEC_FIELDS, type SpecField } from '@/lib/specs/fields';

/**
 * Renders the spec inputs of a category from the SPEC_FIELDS table. Shared by
 * the catalog form and the "unknown model" branch of the stock form, so a new
 * spec appears in both without touching either.
 */

export function SpecInput({
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

export function SpecFieldsSection({
  category,
  valueFor,
  title,
}: {
  category: ComponentCategory;
  valueFor: (path: string) => string | string[] | undefined;
  title?: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-ink-muted">
        {title ?? 'Caractéristiques'} — {CATEGORY_LABELS[category]}
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
              value={valueFor(field.path)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
