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
  IN_PERSON_PLATFORMS,
  ITEM_CONDITIONS,
  ITEM_STATUSES,
  PLATFORM_LABELS,
  PURCHASE_PLATFORMS,
  STATUS_LABELS,
  type ItemCondition,
  type ItemStatus,
  type PurchasePlatform,
} from '@/lib/inventory/labels';
import {
  CARRIER_LABELS,
  SHIPPING_CARRIERS,
  carrierHasTemplate,
  trackingLink,
  type ShippingCarrier,
} from '@/lib/inventory/tracking';
import { CATEGORY_LABELS, COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';

export type InventoryFormInitial = {
  id?: string;
  purchasePriceEur: string;
  purchaseDate: string;
  platform: PurchasePlatform;
  condition: ItemCondition;
  status: ItemStatus;
  listingUrl: string;
  shippingCarrier: ShippingCarrier | '';
  trackingNumber: string;
  trackingUrl: string;
  expectedArrival: string;
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
  buildLineId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: InventoryFormInitial;
  submitLabel: string;
  mode: 'create' | 'edit';
  preselected?: CatalogSearchHit | null;
  /** Build line this purchase fills, when the form was opened to complete one. */
  buildLineId?: string | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

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

  const [source, setSource] = useState<'catalog' | 'new'>('catalog');
  const [category, setCategory] = useState<ComponentCategory>('cpu');

  // Mirrors of the fields the parcel section reacts to. The inputs stay
  // uncontrolled — only what drives the preview lives in state.
  const [status, setStatus] = useState<ItemStatus>(initial.status);
  const [platform, setPlatform] = useState<PurchasePlatform>(initial.platform);
  const [carrier, setCarrier] = useState<ShippingCarrier | ''>(initial.shippingCarrier);
  const [trackingNumber, setTrackingNumber] = useState(initial.trackingNumber);
  const [trackingUrlValue, setTrackingUrlValue] = useState(initial.trackingUrl);

  const inTransit = status === 'en_transit';
  const inPerson = IN_PERSON_PLATFORMS.includes(platform);
  const hasTracking = Boolean(
    initial.shippingCarrier ||
      initial.trackingNumber ||
      initial.trackingUrl ||
      initial.expectedArrival,
  );
  const [trackingOpen, setTrackingOpen] = useState(inTransit || hasTracking);

  const preview = trackingLink({
    shippingCarrier: carrier === '' ? null : carrier,
    trackingNumber,
    trackingUrl: trackingUrlValue,
  });

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {buildLineId ? <input type="hidden" name="buildLineId" value={buildLineId} /> : null}

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
              onChange={(e) => setPlatform(e.target.value as PurchasePlatform)}
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
              inTransit
                ? 'Colis en cours : l’unité n’est pas proposée aux configurations tant qu’elle n’est pas reçue.'
                : BUILD_DRIVEN_STATUSES.includes(initial.status)
                  ? 'Ce statut est normalement piloté par une configuration.'
                  : undefined
            }
          >
            <Select
              id="status"
              name="status"
              defaultValue={text('status', initial.status)}
              onChange={(e) => {
                const next = e.target.value as ItemStatus;
                setStatus(next);
                // Switching to « en transit » is exactly when the tracking
                // fields are needed: open them rather than hide them one click away.
                if (next === 'en_transit') setTrackingOpen(true);
              }}
            >
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

        <details
          className="rounded-lg border border-border-subtle p-3"
          open={trackingOpen}
          onToggle={(e) => setTrackingOpen(e.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm text-ink-muted">
            Suivi du colis{inTransit ? ' — en cours de livraison' : ''}
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {inPerson ? (
              <p className="text-sm text-ink-muted">
                Achat en main propre : il n’y a normalement pas de colis à suivre.
              </p>
            ) : (
              <p className="text-sm text-ink-muted">
                Pour un achat pas encore arrivé, passez le statut en « En transit » et
                renseignez le suivi. Le lien s’ouvre en un tap depuis la fiche.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Transporteur" htmlFor="shippingCarrier">
                <Select
                  id="shippingCarrier"
                  name="shippingCarrier"
                  defaultValue={text('shippingCarrier', initial.shippingCarrier)}
                  onChange={(e) => setCarrier(e.target.value as ShippingCarrier | '')}
                >
                  <option value="">Aucun / inconnu</option>
                  {SHIPPING_CARRIERS.map((value) => (
                    <option key={value} value={value}>
                      {CARRIER_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Numéro de suivi"
                htmlFor="trackingNumber"
                hint={
                  carrier !== '' && !carrierHasTemplate(carrier)
                    ? 'Ce transporteur n’a pas de page de suivi directe : collez le lien ci-dessous.'
                    : undefined
                }
              >
                <Input
                  id="trackingNumber"
                  name="trackingNumber"
                  inputMode="numeric"
                  placeholder="12345678901234"
                  defaultValue={text('trackingNumber', initial.trackingNumber)}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
              </Field>

              <Field
                label="Lien de suivi"
                htmlFor="trackingUrl"
                hint={
                  preview ? (
                    <a
                      href={preview}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline underline-offset-4 hover:text-ink"
                    >
                      Tester le lien de suivi
                    </a>
                  ) : (
                    'Généré depuis le transporteur et le numéro, ou collé à la main.'
                  )
                }
              >
                <Input
                  id="trackingUrl"
                  name="trackingUrl"
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  defaultValue={text('trackingUrl', initial.trackingUrl)}
                  onChange={(e) => setTrackingUrlValue(e.target.value)}
                />
              </Field>

              <Field label="Livraison prévue le" htmlFor="expectedArrival">
                <Input
                  id="expectedArrival"
                  name="expectedArrival"
                  type="date"
                  defaultValue={text('expectedArrival', initial.expectedArrival)}
                />
              </Field>
            </div>
          </div>
        </details>

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
        {/* Filling one named line is a one-shot errand: chaining entries here
            would leave the following units with nowhere to go. */}
        {mode === 'create' && !buildLineId ? (
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
