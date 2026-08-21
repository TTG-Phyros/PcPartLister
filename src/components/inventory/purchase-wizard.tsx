'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogSearchHit } from '@/app/api/catalog/search/route';
import { createPurchaseBatchAction } from '@/actions/batches';
import { createInventoryItemAction } from '@/actions/inventory';
import { CardSelect, type CardOption } from '@/components/card-select';
import { CategoryIcon } from '@/components/catalog/category-icon';
import { CatalogPicker } from '@/components/inventory/catalog-picker';
import { WizardNewModel } from '@/components/inventory/wizard-new-model';
import { WizardProgress, type WizardStep } from '@/components/inventory/wizard-progress';
import { WizardActions, WizardSummary } from '@/components/inventory/wizard-summary';
import { Alert, Button, Card, Field, Input, Select, cn } from '@/components/ui';
import { formatPrice } from '@/lib/catalog/format';
import { parseEurosToCents } from '@/lib/forms/fields';
import {
  CONDITION_LABELS,
  ITEM_CONDITIONS,
  PLATFORM_LABELS,
  PURCHASE_PLATFORMS,
  STATUS_LABELS,
  STATUS_TONES,
  type ItemCondition,
  type PurchasePlatform,
} from '@/lib/inventory/labels';
import {
  CARRIER_LABELS,
  SHIPPING_CARRIERS,
  carrierHasTemplate,
  trackingLink,
  type ShippingCarrier,
} from '@/lib/inventory/tracking';
import {
  MAX_UNITS,
  MODE_HINTS,
  MODE_LABELS,
  PURCHASE_MODES,
  emptyPurchase,
  isBatch,
  missingParcel,
  purchaseFields,
  purchaseParcel,
  unitCount,
  wizardStatus,
  type PurchaseMode,
  type WizardArticle,
  type WizardPurchase,
} from '@/lib/inventory/wizard';
import { CATEGORY_LABELS, COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';

/**
 * Guided entry of a purchase, made for the two minutes right after buying:
 * standing in a hallway, phone in one hand, part in the other.
 *
 * Four questions — what kind of part, which model, what the purchase was, and
 * does this look right — and never two of them on screen at once. A simple
 * purchase (in hand, model already catalogued, one copy) is four taps and one
 * price.
 *
 * It writes nothing itself: one article ends up in `createInventoryItemAction`,
 * several in `createPurchaseBatchAction`, exactly as the two long forms do.
 * The status shown at every step is `wizardStatus`, which is `initialStatus`
 * under another name — the wizard can therefore promise what the server will do
 * without knowing how it does it.
 */

const DRAFT_KEY = 'pcpartlister.stock-wizard.v1';

/** The article being answered about, complete only once it reaches step 3. */
type PendingArticle = {
  key: number;
  category: ComponentCategory | null;
  component: CatalogSearchHit | null;
  quantity: number;
};

type Draft = {
  step: WizardStep;
  purchase: WizardPurchase;
  /** Articles already confirmed, in the order they were entered. */
  articles: WizardArticle[];
  editing: PendingArticle | null;
  nextKey: number;
};

function initialDraft(today: string): Draft {
  return {
    step: 1,
    purchase: emptyPurchase(today),
    articles: [],
    editing: { key: 1, category: null, component: null, quantity: 1 },
    nextKey: 2,
  };
}

/**
 * The draft as it was left. Nothing here is trusted: a shape from an older
 * version of the wizard, or a half-written entry, is dropped rather than
 * restored into a form that would then make no sense.
 */
function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.articles) || !parsed.purchase) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft === null) window.localStorage.removeItem(DRAFT_KEY);
    else window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // A private window with storage disabled is not a reason to stop the entry.
  }
}

/** A redirect is how a saved purchase answers; it is not a failure to report. */
function isRedirect(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'digest' in cause &&
    String((cause as { digest: unknown }).digest).startsWith('NEXT_REDIRECT')
  );
}

const CATEGORY_OPTIONS: Array<CardOption<ComponentCategory>> = COMPONENT_CATEGORIES.map(
  (category) => ({
    value: category,
    label: CATEGORY_LABELS[category],
    icon: <CategoryIcon category={category} />,
  }),
);

const MODE_OPTIONS: Array<CardOption<PurchaseMode>> = PURCHASE_MODES.map((mode) => ({
  value: mode,
  label: MODE_LABELS[mode],
  hint: MODE_HINTS[mode],
}));

export function PurchaseWizard({ today }: { today: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(today));
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingModel, setCreatingModel] = useState(false);
  const [saving, startSaving] = useTransition();

  // Read once, on the client only: the server renders an empty wizard, and a
  // draft left on this phone comes back right after.
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const stored = readDraft();
    if (stored && (stored.articles.length > 0 || stored.editing?.component)) {
      setDraft(stored);
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    writeDraft(draft);
  }, [draft]);

  const { step, purchase, articles, editing } = draft;
  const totalCents = parseEurosToCents(purchase.priceEur);
  const parcel = purchaseParcel(purchase);

  // What the purchase would hold if the article being answered about were
  // confirmed: what the price is split over, and what the buttons count.
  const inHand: WizardArticle | null =
    editing && editing.category && editing.component
      ? {
          key: editing.key,
          category: editing.category,
          component: editing.component,
          quantity: editing.quantity,
        }
      : null;

  const projected: WizardArticle[] =
    inHand === null
      ? articles
      : articles.some((article) => article.key === inHand.key)
        ? articles.map((article) => (article.key === inHand.key ? inHand : article))
        : [...articles, inHand];

  const projectedUnits = unitCount(projected);

  const reachable: WizardStep = editing?.component
    ? 3
    : editing?.category
      ? 2
      : articles.length > 0
        ? 4
        : 1;
  // Step 4 stays open as soon as something has been confirmed, whatever the
  // article in hand is worth.
  const furthest: WizardStep = articles.length > 0 ? 4 : reachable;

  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));
  const patchPurchase = (next: Partial<WizardPurchase>) =>
    setDraft((current) => ({ ...current, purchase: { ...current.purchase, ...next } }));
  const patchEditing = (next: Partial<PendingArticle>) =>
    setDraft((current) =>
      current.editing ? { ...current, editing: { ...current.editing, ...next } } : current,
    );

  const chooseCategory = (category: ComponentCategory) => {
    setError(null);
    setCreatingModel(false);
    setDraft((current) => {
      const previous = current.editing;
      return {
        ...current,
        step: 2,
        editing: {
          key: previous?.key ?? current.nextKey,
          category,
          // Changing the type disowns the model: it belonged to the other one.
          component: previous?.category === category ? (previous.component ?? null) : null,
          quantity: previous?.quantity ?? 1,
        },
        nextKey: previous ? current.nextKey : current.nextKey + 1,
      };
    });
  };

  const chooseComponent = (hit: CatalogSearchHit | null) => {
    setError(null);
    if (!hit) {
      patchEditing({ component: null });
      return;
    }
    setCreatingModel(false);
    setDraft((current) =>
      current.editing
        ? { ...current, step: 3, editing: { ...current.editing, component: hit } }
        : current,
    );
  };

  /** Everything step 3 must be sure of before the article joins the purchase. */
  const step3Problem = (): string | null => {
    if (totalCents === null) {
      return 'Indiquez le prix payé — 0 pour un don ou un troc.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchase.purchaseDate)) {
      return 'Indiquez la date de l’achat.';
    }
    if (missingParcel(purchase.mode, parcel)) {
      return 'Un envoi a besoin d’un numéro de suivi, d’un lien ou d’une date de livraison — sans quoi l’achat serait enregistré comme réservé, pas en transit.';
    }
    if (projectedUnits > MAX_UNITS) {
      return `Un achat est limité à ${MAX_UNITS} unités (${projectedUnits} demandées).`;
    }
    return null;
  };

  const confirmArticle = () => {
    const problem = step3Problem();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setDraft((current) => ({
      ...current,
      step: 4,
      articles: projected,
      editing: null,
    }));
  };

  const addAnother = () => {
    setError(null);
    setCreatingModel(false);
    setDraft((current) => ({
      ...current,
      step: 1,
      editing: { key: current.nextKey, category: null, component: null, quantity: 1 },
      nextKey: current.nextKey + 1,
    }));
  };

  const editArticle = (key: number, target: WizardStep = 2) => {
    setError(null);
    setCreatingModel(false);
    setDraft((current) => {
      const article = current.articles.find((entry) => entry.key === key);
      if (!article) return current;
      return {
        ...current,
        step: target,
        editing: {
          key: article.key,
          category: article.category,
          component: article.component,
          quantity: article.quantity,
        },
      };
    });
  };

  const removeArticle = (key: number) => {
    setError(null);
    setDraft((current) => ({
      ...current,
      articles: current.articles.filter((article) => article.key !== key),
    }));
  };

  const goTo = (target: WizardStep) => {
    setError(null);
    setCreatingModel(false);

    if (target === 4) {
      // An article answered far enough joins the purchase on the way to the
      // recap; one still missing its model is simply abandoned, which is what
      // leaving it unanswered meant.
      if (!editing?.component) {
        if (articles.length > 0) patch({ step: 4, editing: null });
        return;
      }
      const problem = step3Problem();
      if (problem) {
        setError(problem);
        patch({ step: 3 });
        return;
      }
      confirmArticle();
      return;
    }

    if (!editing) {
      // Coming back from the recap: the last article becomes the one in hand.
      if (articles.length === 0) return;
      editArticle(articles[articles.length - 1]!.key, target);
      return;
    }

    // A step only opens on the answers it needs; asking for a later one lands
    // on the first question still unanswered.
    let step = target;
    if (step === 3 && !editing.component) step = 2;
    if (step === 2 && !editing.category) step = 1;
    patch({ step });
  };

  const startOver = () => {
    setError(null);
    setRestored(false);
    setCreatingModel(false);
    writeDraft(null);
    setDraft(initialDraft(today));
  };

  /**
   * One purchase, written the way the app already writes purchases: a lone unit
   * through the stock action, two or more through the batch action, which is
   * the one that knows how to split a price and copy a parcel onto every unit.
   */
  const finish = () => {
    if (articles.length === 0) return;
    const problem = step3Problem();
    if (problem) {
      setError(problem);
      patch({ step: 3 });
      return;
    }

    const formData = new FormData();
    for (const [name, value] of Object.entries(purchaseFields(purchase))) {
      formData.set(name, value);
    }
    // Where the wizard lands once the purchase exists: the stock list, having
    // already shown its own recap of it.
    formData.set('apres', 'stock');

    const batch = isBatch(articles);
    if (batch) {
      formData.set('totalPriceEur', purchase.priceEur);
      if (purchase.label.trim()) formData.set('label', purchase.label.trim());
      for (const article of articles) {
        formData.append(
          'line',
          JSON.stringify({ componentId: article.component.id, quantity: article.quantity }),
        );
      }
    } else {
      formData.set('source', 'catalog');
      formData.set('catalogComponentId', articles[0]!.component.id);
      formData.set('purchasePriceEur', purchase.priceEur);
    }

    // Cleared up front: a saved purchase navigates away and must not leave a
    // draft behind that would offer to enter it a second time. Put back below
    // if the save never happened.
    const snapshot = draft;
    writeDraft(null);
    setError(null);

    startSaving(async () => {
      try {
        const result = batch
          ? await createPurchaseBatchAction({}, formData)
          : await createInventoryItemAction({}, formData);
        if (result?.error) {
          writeDraft(snapshot);
          setError(result.error);
        }
      } catch (cause) {
        if (isRedirect(cause)) return;
        writeDraft(snapshot);
        setError(
          'Enregistrement impossible — connexion perdue ? Votre saisie est conservée, réessayez.',
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-col gap-4">
        <WizardProgress current={step} reachable={furthest} onGoTo={goTo} />

        {restored ? (
          <Alert tone="info">
            Saisie en cours restaurée depuis ce téléphone.{' '}
            <button
              type="button"
              onClick={startOver}
              className="underline underline-offset-4 hover:text-ink"
            >
              Repartir de zéro
            </button>
          </Alert>
        ) : null}

        {/* key on the step: the light slide replays at each change, and never
            while a field of the same step is being typed in. */}
        <Card key={step} className="wizard-step flex flex-col gap-4">
          {step === 1 ? (
            <StepType value={editing?.category ?? null} onChoose={chooseCategory} />
          ) : null}

          {step === 2 && editing?.category ? (
            <StepComponent
              category={editing.category}
              selection={editing.component}
              creating={creatingModel}
              onCreatingChange={setCreatingModel}
              onChoose={chooseComponent}
            />
          ) : null}

          {step === 3 && editing?.component ? (
            <StepPurchase
              purchase={purchase}
              onPurchaseChange={patchPurchase}
              quantity={editing.quantity}
              onQuantityChange={(quantity) => patchEditing({ quantity })}
              model={editing.component}
              units={projectedUnits}
              totalCents={totalCents}
            />
          ) : null}

          {step === 4 ? (
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="font-medium">Récapitulatif</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Rien n’est encore enregistré. Un dernier coup d’œil, puis c’est au stock.
                </p>
              </div>
              <WizardSummary
                articles={articles}
                purchase={purchase}
                totalCents={totalCents}
                onEdit={(key) => editArticle(key)}
                onRemove={articles.length > 1 ? removeArticle : undefined}
              />
              {isBatch(articles) ? (
                <Field
                  label="Libellé de l’arrivage"
                  htmlFor="label"
                  hint="Facultatif : à défaut, la plateforme et la date."
                >
                  <Input
                    id="label"
                    value={purchase.label}
                    onChange={(e) => patchPurchase({ label: e.target.value })}
                    placeholder="5 barrettes DDR4 Vinted"
                  />
                </Field>
              ) : null}
            </section>
          ) : null}

          {error ? <Alert tone="error">{error}</Alert> : null}

          <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-2 border-t border-border-subtle bg-surface-raised/95 px-5 py-3 backdrop-blur">
            {step === 4 ? (
              <WizardActions
                units={unitCount(articles)}
                pending={saving}
                onAddAnother={addAnother}
                onFinish={finish}
              />
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (step > 1) goTo((step - 1) as WizardStep);
                    // Back from the first question: to the recap when there is
                    // one to go back to, out of the wizard otherwise.
                    else if (articles.length > 0) goTo(4);
                    else router.back();
                  }}
                >
                  Retour
                </Button>
                {step === 3 ? (
                  <Button type="button" onClick={confirmArticle} className="flex-1">
                    Continuer
                  </Button>
                ) : (
                  <p className="flex flex-1 items-center justify-end text-sm text-ink-muted">
                    {step === 1
                      ? 'Choisissez un type pour continuer'
                      : 'Choisissez un modèle pour continuer'}
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Wide screens keep the recap open alongside the question being asked,
          so nothing about the purchase has to be remembered from a step ago. */}
      <aside className="hidden lg:block lg:sticky lg:top-20">
        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-ink-muted">Cet achat</h2>
          <WizardSummary
            articles={projected}
            purchase={purchase}
            totalCents={totalCents}
            compact
          />
        </Card>
      </aside>
    </div>
  );
}

/* ─────────────────────────── Step 1 — type ─────────────────────────── */

function StepType({
  value,
  onChoose,
}: {
  value: ComponentCategory | null;
  onChoose: (category: ComponentCategory) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Quel type de pièce ?</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Un tap suffit : la recherche du modèle est ensuite filtrée sur ce type.
        </p>
      </div>
      <CardSelect
        label="Type de pièce"
        options={CATEGORY_OPTIONS}
        value={value}
        onChange={onChoose}
        columns={3}
      />
    </section>
  );
}

/* ──────────────────────── Step 2 — the model ──────────────────────── */

function StepComponent({
  category,
  selection,
  creating,
  onCreatingChange,
  onChoose,
}: {
  category: ComponentCategory;
  selection: CatalogSearchHit | null;
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
  onChoose: (hit: CatalogSearchHit | null) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Quel modèle de {CATEGORY_LABELS[category].toLowerCase()} ?</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Tapez les premières lettres : specs et image viennent du catalogue, rien à ressaisir.
        </p>
      </div>

      {creating ? (
        <WizardNewModel
          category={category}
          onCreated={onChoose}
          onCancel={() => onCreatingChange(false)}
        />
      ) : (
        <>
          <CatalogPicker
            key={category}
            initialCategory={category}
            hideCategoryFilter
            initialSelection={selection}
            emptyHint="Aucun modèle trouvé pour ce type."
            onSelect={onChoose}
          />
          <Button type="button" variant="secondary" onClick={() => onCreatingChange(true)}>
            Composant absent du catalogue
          </Button>
        </>
      )}
    </section>
  );
}

/* ────────────────────── Step 3 — the purchase ────────────────────── */

function StepPurchase({
  purchase,
  onPurchaseChange,
  quantity,
  onQuantityChange,
  model,
  units,
  totalCents,
}: {
  purchase: WizardPurchase;
  onPurchaseChange: (next: Partial<WizardPurchase>) => void;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  model: CatalogSearchHit;
  units: number;
  totalCents: number | null;
}) {
  const parcel = purchaseParcel(purchase);
  const status = wizardStatus(purchase.mode, parcel);
  const link = trackingLink({
    shippingCarrier: purchase.shippingCarrier === '' ? null : purchase.shippingCarrier,
    trackingNumber: purchase.trackingNumber,
    trackingUrl: purchase.trackingUrl,
  });
  const perUnit = totalCents === null || units === 0 ? null : Math.floor(totalCents / units);

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-medium">Comment l’avez-vous acheté ?</h2>
        {/* The model already chosen, restated small: on a phone, step 2 is
            already scrolled out of memory. */}
        <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
          {model.brand} {model.model}
          {model.summary.length > 0 ? ` · ${model.summary.join(' · ')}` : ''}
        </p>
      </div>

      <CardSelect
        label="Mode d’achat"
        options={MODE_OPTIONS}
        value={purchase.mode}
        onChange={(mode) => onPurchaseChange({ mode })}
        columns={1}
      />

      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        Statut à l’enregistrement :
        <span
          className={cn(
            'inline-flex items-center rounded-lg px-2.5 py-1 font-medium',
            STATUS_TONES[status],
          )}
        >
          {STATUS_LABELS[status]}
        </span>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={units > 1 ? 'Prix total de l’achat (€)' : 'Prix payé (€)'}
          htmlFor="priceEur"
          hint={
            units > 1
              ? `Port compris. Réparti entre les ${units} unités${
                  perUnit === null ? '' : ` — environ ${formatPrice(perUnit)} chacune`
                }.`
              : undefined
          }
        >
          <div className="flex gap-2">
            <Input
              id="priceEur"
              type="text"
              inputMode="decimal"
              placeholder="45"
              value={purchase.priceEur}
              onChange={(e) => onPurchaseChange({ priceEur: e.target.value })}
              autoFocus
              required
            />
            {/* A part given or swapped costs nothing, and that zero has to be
                as easy to enter as any other price. */}
            <Button
              type="button"
              variant="secondary"
              onClick={() => onPurchaseChange({ priceEur: '0' })}
              className="shrink-0 px-3 text-xs"
            >
              Don / troc
            </Button>
          </div>
        </Field>

        <Field label="Exemplaires identiques" htmlFor="quantity">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
              aria-label="Un exemplaire de moins"
              className="w-12 shrink-0 px-0 text-lg"
            >
              −
            </Button>
            <Input
              id="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_UNITS}
              value={quantity}
              onChange={(e) =>
                onQuantityChange(Math.min(MAX_UNITS, Math.max(1, Number(e.target.value) || 1)))
              }
              className="text-center"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => onQuantityChange(Math.min(MAX_UNITS, quantity + 1))}
              aria-label="Un exemplaire de plus"
              className="w-12 shrink-0 px-0 text-lg"
            >
              +
            </Button>
          </div>
        </Field>

        <Field label="Date d’achat" htmlFor="purchaseDate">
          <Input
            id="purchaseDate"
            type="date"
            value={purchase.purchaseDate}
            onChange={(e) => onPurchaseChange({ purchaseDate: e.target.value })}
            required
          />
        </Field>

        <Field label="Plateforme" htmlFor="platform">
          <Select
            id="platform"
            value={purchase.platform}
            onChange={(e) => onPurchaseChange({ platform: e.target.value as PurchasePlatform })}
          >
            {PURCHASE_PLATFORMS.map((value) => (
              <option key={value} value={value}>
                {PLATFORM_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="État" htmlFor="condition" hint="Appliqué à chaque unité de cet achat.">
          <Select
            id="condition"
            value={purchase.condition}
            onChange={(e) => onPurchaseChange({ condition: e.target.value as ItemCondition })}
          >
            {ITEM_CONDITIONS.map((value) => (
              <option key={value} value={value}>
                {CONDITION_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {purchase.mode === 'envoi' ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border-subtle p-4">
          <div>
            <h3 className="text-sm font-medium">Suivi du colis</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Un numéro, un lien ou une date de livraison suffit. Le colis se suit ensuite en un
              tap depuis le stock, et « Marquer comme reçu » fera atterrir l’achat.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Transporteur" htmlFor="shippingCarrier">
              <Select
                id="shippingCarrier"
                value={purchase.shippingCarrier}
                onChange={(e) =>
                  onPurchaseChange({ shippingCarrier: e.target.value as ShippingCarrier | '' })
                }
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
                purchase.shippingCarrier !== '' && !carrierHasTemplate(purchase.shippingCarrier)
                  ? 'Ce transporteur n’a pas de page de suivi directe : collez le lien ci-dessous.'
                  : undefined
              }
            >
              <Input
                id="trackingNumber"
                inputMode="numeric"
                placeholder="12345678901234"
                value={purchase.trackingNumber}
                onChange={(e) => onPurchaseChange({ trackingNumber: e.target.value })}
              />
            </Field>

            <Field
              label="Lien de suivi"
              htmlFor="trackingUrl"
              hint={
                link ? (
                  <a
                    href={link}
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
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={purchase.trackingUrl}
                onChange={(e) => onPurchaseChange({ trackingUrl: e.target.value })}
              />
            </Field>

            <Field label="Livraison prévue le" htmlFor="expectedArrival">
              <Input
                id="expectedArrival"
                type="date"
                value={purchase.expectedArrival}
                onChange={(e) => onPurchaseChange({ expectedArrival: e.target.value })}
              />
            </Field>
          </div>
        </div>
      ) : null}

      <details className="rounded-lg border border-border-subtle p-3">
        <summary className="cursor-pointer text-sm text-ink-muted">Annonce et notes</summary>
        <div className="mt-3 flex flex-col gap-4">
          <Field label="Lien de l’annonce" htmlFor="listingUrl">
            <Input
              id="listingUrl"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={purchase.listingUrl}
              onChange={(e) => onPurchaseChange({ listingUrl: e.target.value })}
            />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <textarea
              id="notes"
              rows={2}
              value={purchase.notes}
              onChange={(e) => onPurchaseChange({ notes: e.target.value })}
              className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
          </Field>
        </div>
      </details>
    </section>
  );
}
