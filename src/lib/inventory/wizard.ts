import type { CatalogSearchHit } from '@/app/api/catalog/search/route';
import type { ComponentCategory } from '@/lib/specs';
import type { ItemCondition, ItemStatus, PurchasePlatform } from './labels';
import { sharesByLine } from './split';
import {
  hasParcel,
  initialStatus,
  type ParcelFields,
  type PurchaseHandover,
} from './status';
import type { ShippingCarrier } from './tracking';

/**
 * The wizard's own vocabulary, and the whole of it. Everything below turns the
 * one question it asks about a purchase — *how did the part change hands?* —
 * into the fields `status.ts` already knows how to read, so the wizard decides
 * nothing on its own: it shows, live, exactly what the server will write.
 */

/** How the purchase changed hands, asked as one question instead of three fields. */
export const PURCHASE_MODES = ['emporte', 'a_recuperer', 'envoi'] as const;
export type PurchaseMode = (typeof PURCHASE_MODES)[number];

export const MODE_LABELS: Record<PurchaseMode, string> = {
  emporte: 'Récupéré en main propre',
  a_recuperer: 'Réservé, à récupérer',
  envoi: 'Envoi avec suivi',
};

export const MODE_HINTS: Record<PurchaseMode, string> = {
  emporte: 'La pièce est déjà dans votre sac.',
  a_recuperer: 'Payée ou promise, mais pas encore en main.',
  envoi: 'Un colis part chez vous, avec un numéro à suivre.',
};

/** A hand-over already done means the shelf; anything else is still waiting. */
export function handoverForMode(mode: PurchaseMode): PurchaseHandover {
  return mode === 'emporte' ? 'en_stock' : 'reserve';
}

/**
 * The parcel as the chosen mode allows it. A tracking number left behind by a
 * mode the user changed their mind about must not keep declaring a delivery:
 * only `envoi` carries a parcel.
 */
export function parcelForMode(mode: PurchaseMode, parcel: ParcelFields): ParcelFields {
  if (mode === 'envoi') return parcel;
  return { trackingNumber: null, trackingUrl: null, expectedArrival: null };
}

/**
 * Where the units of this purchase are born — the same answer `initialStatus`
 * gives the action, from the same two inputs.
 */
export function wizardStatus(mode: PurchaseMode, parcel: ParcelFields): ItemStatus {
  return initialStatus(parcelForMode(mode, parcel), handoverForMode(mode));
}

/**
 * Why an `envoi` cannot be saved yet. A parcel is recognised by a number, a
 * link or an announced day — nothing typed means the purchase would quietly
 * land as merely reserved, which is not what the chosen card says.
 */
export function missingParcel(mode: PurchaseMode, parcel: ParcelFields): boolean {
  return mode === 'envoi' && !hasParcel(parcel);
}

/** One article of the purchase: a catalog model and how many copies of it. */
export type WizardArticle = {
  /** Stable across edits, so a re-entered article replaces itself rather than doubling. */
  key: number;
  category: ComponentCategory;
  component: CatalogSearchHit;
  quantity: number;
};

/**
 * What the whole purchase shares, whatever it holds. One price, one day, one
 * parcel: the wizard asks these once and keeps them across articles, which is
 * the point of adding a second one under the same tracking number.
 */
export type WizardPurchase = {
  mode: PurchaseMode;
  /** In euros, as typed. Empty until answered; « 0 » is a gift or a trade. */
  priceEur: string;
  purchaseDate: string;
  platform: PurchasePlatform;
  condition: ItemCondition;
  shippingCarrier: ShippingCarrier | '';
  trackingNumber: string;
  trackingUrl: string;
  expectedArrival: string;
  listingUrl: string;
  label: string;
  notes: string;
};

export function emptyPurchase(today: string): WizardPurchase {
  return {
    mode: 'emporte',
    priceEur: '',
    purchaseDate: today,
    platform: 'vinted',
    condition: 'bon',
    shippingCarrier: '',
    trackingNumber: '',
    trackingUrl: '',
    expectedArrival: '',
    listingUrl: '',
    label: '',
    notes: '',
  };
}

/** The parcel a purchase declares, as `status.ts` reads it. */
export function purchaseParcel(purchase: WizardPurchase): ParcelFields {
  return parcelForMode(purchase.mode, {
    trackingNumber: purchase.trackingNumber,
    trackingUrl: purchase.trackingUrl,
    expectedArrival: purchase.expectedArrival,
  });
}

/**
 * The fields a purchase posts, identical for a single unit and for a batch:
 * both actions read the same names, and both derive the status from the same
 * `handover` plus parcel pair. The wizard therefore ships no status of its own.
 *
 * A parcel dropped by a change of mode is posted empty rather than omitted:
 * leaving a stale tracking number in the payload would silently put the unit
 * back on the road.
 */
export function purchaseFields(purchase: WizardPurchase): Record<string, string> {
  const parcel = purchaseParcel(purchase);
  return {
    purchaseDate: purchase.purchaseDate,
    platform: purchase.platform,
    condition: purchase.condition,
    listingUrl: purchase.listingUrl.trim(),
    notes: purchase.notes.trim(),
    handover: handoverForMode(purchase.mode),
    shippingCarrier: purchase.mode === 'envoi' ? purchase.shippingCarrier : '',
    trackingNumber: parcel.trackingNumber ?? '',
    trackingUrl: parcel.trackingUrl ?? '',
    expectedArrival: parcel.expectedArrival ?? '',
  };
}

/** Guard against a slip of the quantity field, same ceiling as the batch action. */
export const MAX_UNITS = 100;

export function unitCount(articles: readonly { quantity: number }[]): number {
  return articles.reduce((total, article) => total + article.quantity, 0);
}

/**
 * What each article will have cost, once the price paid is spread over the
 * units it bought. Delegated whole to `sharesByLine`, so the recap shows the
 * cents the action is about to write and not a second opinion on them.
 */
export function articleShares(
  totalCents: number | null,
  articles: readonly { quantity: number }[],
): number[][] {
  if (totalCents === null || articles.length === 0) return articles.map(() => []);
  return sharesByLine(
    totalCents,
    articles.map((article) => article.quantity),
  );
}

/**
 * Whether this purchase is a batch. One unit is an ordinary stock entry; two or
 * more shared a price and a parcel, which is exactly what a batch is — and what
 * the batch action refuses to be called with fewer than two of.
 */
export function isBatch(articles: readonly { quantity: number }[]): boolean {
  return unitCount(articles) > 1;
}
