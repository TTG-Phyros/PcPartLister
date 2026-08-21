'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/actions/auth';
import { createPurchaseBatchAction } from '@/actions/batches';
import { CatalogPicker } from '@/components/inventory/catalog-picker';
import { Alert, Button, Card, Field, Input, Select, cn } from '@/components/ui';
import type { CatalogSearchHit } from '@/app/api/catalog/search/route';
import { formatPrice } from '@/lib/catalog/format';
import {
  CONDITION_LABELS,
  IN_PERSON_PLATFORMS,
  ITEM_CONDITIONS,
  PLATFORM_LABELS,
  PURCHASE_PLATFORMS,
  STATUS_LABELS,
  STATUS_TONES,
  type PurchasePlatform,
} from '@/lib/inventory/labels';
import { parseEurosToCents } from '@/lib/forms/fields';
import { sharesByLine, splitEvenly } from '@/lib/inventory/split';
import {
  HANDOVER_LABELS,
  PURCHASE_HANDOVERS,
  initialStatus,
  type PurchaseHandover,
} from '@/lib/inventory/status';
import {
  CARRIER_LABELS,
  SHIPPING_CARRIERS,
  carrierHasTemplate,
  trackingLink,
  type ShippingCarrier,
} from '@/lib/inventory/tracking';
import { CATEGORY_LABELS } from '@/lib/specs';

/** A form row: one catalog model and how many copies of it the parcel held. */
type Line = { key: number; selection: CatalogSearchHit | null; quantity: number };

const MAX_QUANTITY = 100;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Enregistrement…' : label}
    </Button>
  );
}

export function BatchForm({ today }: { today: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createPurchaseBatchAction,
    {},
  );

  // Two lines to start with: a batch takes at least two units, and the shape of
  // the form should say so before the server has to.
  const nextKey = useRef(2);
  const [lines, setLines] = useState<Line[]>([
    { key: 0, selection: null, quantity: 1 },
    { key: 1, selection: null, quantity: 1 },
  ]);

  const [totalEur, setTotalEur] = useState('');
  const [platform, setPlatform] = useState<PurchasePlatform>('vinted');
  const [carrier, setCarrier] = useState<ShippingCarrier | ''>('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrlValue, setTrackingUrlValue] = useState('');
  const [expectedArrival, setExpectedArrival] = useState('');
  const [handover, setHandover] = useState<PurchaseHandover>('reserve');

  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  const addLine = () =>
    setLines((current) => [
      ...current,
      { key: nextKey.current++, selection: null, quantity: 1 },
    ]);

  const removeLine = (key: number) =>
    setLines((current) =>
      current.length === 1 ? current : current.filter((line) => line.key !== key),
    );

  // Only a line with a model chosen counts: an empty one is a row waiting to be
  // filled, not a unit that was bought.
  const unitCount = lines.reduce(
    (total, line) => total + (line.selection ? line.quantity : 0),
    0,
  );
  const totalCents = parseEurosToCents(totalEur);
  const shares =
    totalCents === null || unitCount === 0 ? [] : splitEvenly(totalCents, unitCount);

  // Each filled line takes the next slice of the shares, in the order the lines
  // are posted — exactly what the server does with the same helper. An empty
  // line is a row waiting to be filled, so it takes no slice at all.
  const filled = lines.filter((line) => line.selection);
  const filledShares = sharesByLine(
    totalCents ?? 0,
    filled.map((line) => line.quantity),
  );
  const lineShares = lines.map((line) =>
    totalCents === null || !line.selection ? null : (filledShares[filled.indexOf(line)] ?? null),
  );

  const baseShare = shares.at(-1) ?? 0;
  const remainder = shares.filter((share) => share > baseShare).length;

  // One purchase for the whole batch, so one status for all its units — read
  // off the parcel, or off the hand-over. Same rule, same function as a
  // purchase entered on its own.
  const status = initialStatus(
    { trackingNumber, trackingUrl: trackingUrlValue, expectedArrival },
    handover,
  );
  const inTransit = status === 'en_transit';
  const inPerson = IN_PERSON_PLATFORMS.includes(platform);
  const preview = trackingLink({
    shippingCarrier: carrier === '' ? null : carrier,
    trackingNumber,
    trackingUrl: trackingUrlValue,
  });

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* Posted one field per line so a model never drifts away from its
          quantity, whatever gets left empty in between. */}
      {lines.map((line) =>
        line.selection ? (
          <input
            key={line.key}
            type="hidden"
            name="line"
            value={JSON.stringify({
              componentId: line.selection.id,
              quantity: line.quantity,
            })}
          />
        ) : null,
      )}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Contenu du lot</h2>
          <span className="text-sm text-ink-muted">
            {unitCount} unité{unitCount > 1 ? 's' : ''}
          </span>
        </div>

        <ul className="flex flex-col gap-3">
          {lines.map((line, index) => (
            <li
              key={line.key}
              className="flex flex-col gap-3 rounded-xl border border-border-subtle p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink-muted">
                  Ligne {index + 1}
                  {line.selection ? ` · ${CATEGORY_LABELS[line.selection.category]}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  disabled={lines.length === 1}
                  className="rounded-lg px-2 py-1 text-sm text-ink-muted hover:bg-surface-hover hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Retirer
                </button>
              </div>

              <CatalogPicker onSelect={(hit) => updateLine(line.key, { selection: hit })} />

              <div className="flex flex-wrap items-end gap-4">
                <div className="w-32">
                  <Field label="Exemplaires" htmlFor={`quantity-${line.key}`}>
                    <Input
                      id={`quantity-${line.key}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_QUANTITY}
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(line.key, {
                          quantity: Math.min(
                            MAX_QUANTITY,
                            Math.max(1, Number(e.target.value) || 1),
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
                {lineShares[index] && lineShares[index]!.length > 0 ? (
                  <p className="pb-2.5 text-sm text-ink-muted">
                    Part du prix :{' '}
                    <span className="font-medium text-ink">
                      {formatPrice(lineShares[index]!.reduce((sum, share) => sum + share, 0))}
                    </span>
                    {line.quantity > 1 ? ` · ${line.quantity} unités` : ''}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <div>
          <Button type="button" variant="secondary" onClick={addLine}>
            + Ajouter une ligne
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-medium">Achat</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Prix total du lot (€)"
            htmlFor="totalPriceEur"
            hint="Prix payé, frais de port compris. Il est réparti entre les unités."
          >
            <Input
              id="totalPriceEur"
              name="totalPriceEur"
              type="text"
              inputMode="decimal"
              placeholder="120"
              value={totalEur}
              onChange={(e) => setTotalEur(e.target.value)}
              required
            />
          </Field>
          <Field label="Date d’achat" htmlFor="purchaseDate">
            <Input id="purchaseDate" name="purchaseDate" type="date" defaultValue={today} required />
          </Field>
          <Field label="Plateforme" htmlFor="platform">
            <Select
              id="platform"
              name="platform"
              defaultValue="vinted"
              onChange={(e) => setPlatform(e.target.value as PurchasePlatform)}
            >
              {PURCHASE_PLATFORMS.map((value) => (
                <option key={value} value={value}>
                  {PLATFORM_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="État" htmlFor="condition" hint="Appliqué à chaque unité du lot.">
            <Select id="condition" name="condition" defaultValue="bon">
              {ITEM_CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {CONDITION_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          {/* One purchase, one answer, for every unit of the batch at once.
              « Marquer les N unités comme reçues » is then the one thing that
              puts them on the shelf. */}
          {inTransit ? (
            <Field
              label="Statut"
              hint="Un suivi est renseigné : les unités attendent le colis et comptent dans l’immobilisé, pas dans le stock disponible."
            >
              <p
                className={cn(
                  'inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium',
                  STATUS_TONES[status],
                )}
              >
                {STATUS_LABELS[status]}
              </p>
            </Field>
          ) : (
            <Field
              label="Récupération"
              htmlFor="handover"
              hint={
                handover === 'en_stock'
                  ? 'Statut : En stock. Les unités sont sur l’étagère, disponibles pour une configuration.'
                  : 'Statut : Réservées. Achetées mais pas encore en main : elles comptent dans l’immobilisé, pas dans le stock disponible.'
              }
            >
              <Select
                id="handover"
                name="handover"
                value={handover}
                onChange={(e) => setHandover(e.target.value as PurchaseHandover)}
              >
                {PURCHASE_HANDOVERS.map((value) => (
                  <option key={value} value={value}>
                    {HANDOVER_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Lien de l’annonce" htmlFor="listingUrl">
            <Input
              id="listingUrl"
              name="listingUrl"
              type="url"
              inputMode="url"
              placeholder="https://…"
            />
          </Field>
          <Field
            label="Libellé du lot"
            htmlFor="label"
            hint="Facultatif : à défaut, la plateforme et la date."
          >
            <Input id="label" name="label" placeholder="5 barrettes DDR4 Vinted" />
          </Field>
        </div>

        <SplitPreview
          totalCents={totalCents}
          unitCount={unitCount}
          baseShare={baseShare}
          remainder={remainder}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="font-medium">Suivi du colis</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {inPerson
              ? 'Achat en main propre : il n’y a normalement pas de colis à suivre.'
              : 'Un seul numéro pour tout le lot. Il est reporté sur chaque unité, et se corrige ensuite depuis la fiche du lot.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Transporteur" htmlFor="shippingCarrier">
            <Select
              id="shippingCarrier"
              name="shippingCarrier"
              defaultValue=""
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
              value={trackingNumber}
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
              value={trackingUrlValue}
              onChange={(e) => setTrackingUrlValue(e.target.value)}
            />
          </Field>

          <Field label="Livraison prévue le" htmlFor="expectedArrival">
            <Input
              id="expectedArrival"
              name="expectedArrival"
              type="date"
              onChange={(e) => setExpectedArrival(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor="notes" hint="Reprises sur chaque unité du lot.">
          <textarea
            id="notes"
            name="notes"
            rows={2}
            className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </Field>
      </Card>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        <SubmitButton
          label={
            unitCount === 0
              ? 'Enregistrer le lot'
              : `Enregistrer ${unitCount} unité${unitCount > 1 ? 's' : ''}`
          }
        />
      </div>
    </form>
  );
}

/**
 * The whole point of the batch, shown before it is saved: what each unit will
 * end up having cost. The remainder is named rather than hidden — a few
 * centimes appearing on the first units is a decision, not a rounding accident.
 */
function SplitPreview({
  totalCents,
  unitCount,
  baseShare,
  remainder,
}: {
  totalCents: number | null;
  unitCount: number;
  baseShare: number;
  remainder: number;
}) {
  if (totalCents === null || unitCount === 0) {
    return (
      <p className="rounded-lg bg-surface-hover px-3 py-2 text-sm text-ink-muted">
        Choisissez les modèles et saisissez le prix total : la part de chaque unité s’affiche ici.
      </p>
    );
  }

  return (
    <p className="rounded-lg bg-surface-hover px-3 py-2 text-sm text-ink-muted">
      {formatPrice(totalCents)} pour {unitCount} unité{unitCount > 1 ? 's' : ''} ={' '}
      <span className="font-medium text-ink">{formatPrice(baseShare)}</span> par unité
      {remainder > 0
        ? ` · le reliquat de ${remainder} centime${remainder > 1 ? 's' : ''} va ${
            remainder > 1 ? `aux ${remainder} premières unités` : 'à la première unité'
          }`
        : ''}
      .
    </p>
  );
}
