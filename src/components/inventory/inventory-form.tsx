'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { CatalogSearchHit } from '@/app/api/catalog/search/route';
import type { ActionState } from '@/actions/auth';
import { SpecFieldsSection } from '@/components/catalog/spec-fields';
import { CatalogPicker } from '@/components/inventory/catalog-picker';
import { Alert, Button, Field, Input, Select, cn } from '@/components/ui';
import {
  BUILD_DRIVEN_STATUSES,
  CONDITION_LABELS,
  ITEM_CONDITIONS,
  ITEM_STATUSES,
  PLATFORM_LABELS,
  PURCHASE_PLATFORMS,
  STATUS_LABELS,
  type ItemCondition,
  type ItemStatus,
  type PurchasePlatform,
} from '@/lib/inventory/labels';
import { CATEGORY_LABELS, COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';

export type InventoryFormInitial = {
  id?: string;
  purchasePriceEur: string;
  purchaseDate: string;
  platform: PurchasePlatform;
  condition: ItemCondition;
  status: ItemStatus;
  listingUrl: string;
  serialNumber: string;
  notes: string;
};

function SubmitButton({
  label,
  name,
  value,
  variant = 'primary',
}: {
  label: string;
  name?: string;
  value?: string;
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name={name} value={value} variant={variant} disabled={pending}>
      {pending ? 'Enregistrement…' : label}
    </Button>
  );
}

export function InventoryForm({
  action,
  initial,
  submitLabel,
  mode,
  preselected,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: InventoryFormInitial;
  submitLabel: string;
  mode: 'create' | 'edit';
  preselected?: CatalogSearchHit | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [source, setSource] = useState<'catalog' | 'new'>('catalog');
  const [category, setCategory] = useState<ComponentCategory>('cpu');

  const echoed = state.values;
  const defaultFor = (name: string, fallback: string | string[] = ''): string | string[] => {
    const value = echoed?.[name];
    if (value !== undefined) return value;
    return echoed ? '' : fallback;
  };
  const text = (name: string, fallback = ''): string => {
    const value = defaultFor(name, fallback);
    return Array.isArray(value) ? (value[0] ?? '') : value;
  };

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      {mode === 'create' ? (
        <section className="flex flex-col gap-3">
          <input type="hidden" name="source" value={source} />

          <div className="flex gap-2" role="tablist" aria-label="Origine du modèle">
            {(
              [
                ['catalog', 'Modèle du catalogue'],
                ['new', 'Nouveau modèle'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={source === value}
                onClick={() => setSource(value)}
                className={cn(
                  'min-h-11 flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  source === value
                    ? 'border-brand bg-brand/15 text-ink'
                    : 'border-border-subtle text-ink-muted hover:bg-surface-hover',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {source === 'catalog' ? (
            <CatalogPicker name="catalogComponentId" initialSelection={preselected ?? null} />
          ) : (
            <div className="flex flex-col gap-4 rounded-xl border border-border-subtle p-4">
              <p className="text-sm text-ink-muted">
                Le modèle est créé dans le catalogue et l’unité y est rattachée en une seule
                validation.
              </p>

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
                  <Input id="brand" name="brand" defaultValue={text('brand')} />
                </Field>
                <Field label="Modèle" htmlFor="model">
                  <Input id="model" name="model" defaultValue={text('model')} />
                </Field>
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

              <SpecFieldsSection
                category={category}
                valueFor={(path) => defaultFor(`specs.${path}`)}
              />
            </div>
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        {/* The two fields that matter when entering a purchase on a phone. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prix d’achat (€)" htmlFor="purchasePriceEur">
            <Input
              id="purchasePriceEur"
              name="purchasePriceEur"
              type="text"
              inputMode="decimal"
              placeholder="45"
              defaultValue={text('purchasePriceEur', initial.purchasePriceEur)}
              required
              autoFocus={mode === 'edit'}
            />
          </Field>
          <Field label="Date d’achat" htmlFor="purchaseDate">
            <Input
              id="purchaseDate"
              name="purchaseDate"
              type="date"
              defaultValue={text('purchaseDate', initial.purchaseDate)}
              required
            />
          </Field>
          <Field label="Plateforme" htmlFor="platform">
            <Select
              id="platform"
              name="platform"
              defaultValue={text('platform', initial.platform)}
            >
              {PURCHASE_PLATFORMS.map((value) => (
                <option key={value} value={value}>
                  {PLATFORM_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="État" htmlFor="condition">
            <Select
              id="condition"
              name="condition"
              defaultValue={text('condition', initial.condition)}
            >
              {ITEM_CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {CONDITION_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Statut"
            htmlFor="status"
            hint={
              BUILD_DRIVEN_STATUSES.includes(initial.status)
                ? 'Ce statut est normalement piloté par une configuration.'
                : undefined
            }
          >
            <Select id="status" name="status" defaultValue={text('status', initial.status)}>
              {ITEM_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lien de l’annonce" htmlFor="listingUrl">
            <Input
              id="listingUrl"
              name="listingUrl"
              type="url"
              inputMode="url"
              placeholder="https://…"
              defaultValue={text('listingUrl', initial.listingUrl)}
            />
          </Field>
        </div>

        <details className="rounded-lg border border-border-subtle p-3">
          <summary className="cursor-pointer text-sm text-ink-muted">
            Numéro de série et notes
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            <Field label="Numéro de série" htmlFor="serialNumber">
              <Input
                id="serialNumber"
                name="serialNumber"
                defaultValue={text('serialNumber', initial.serialNumber)}
              />
            </Field>
            <Field label="Notes" htmlFor="notes">
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={text('notes', initial.notes)}
                className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </Field>
          </div>
        </details>
      </section>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        <SubmitButton label={submitLabel} />
        {mode === 'create' ? (
          <SubmitButton
            label="Enregistrer et en ajouter un autre"
            name="again"
            value="1"
            variant="secondary"
          />
        ) : null}
      </div>
    </form>
  );
}
