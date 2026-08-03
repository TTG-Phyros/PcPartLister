import type { InventoryItem } from '@/lib/db/schema';

export type ShippingCarrier = NonNullable<InventoryItem['shippingCarrier']>;

export const SHIPPING_CARRIERS = [
  'mondial_relay',
  'colissimo',
  'chronopost',
  'relais_colis',
  'dpd',
  'gls',
  'ups',
  'dhl',
  'fedex',
  'autre',
] as const;

export const CARRIER_LABELS: Record<ShippingCarrier, string> = {
  mondial_relay: 'Mondial Relay',
  colissimo: 'Colissimo / La Poste',
  chronopost: 'Chronopost',
  relais_colis: 'Relais Colis',
  dpd: 'DPD',
  gls: 'GLS',
  ups: 'UPS',
  dhl: 'DHL',
  fedex: 'FedEx',
  autre: 'Autre',
};

/**
 * Public tracking pages, `{n}` standing for the tracking number. A carrier
 * without a template (Relais Colis posts its form, « Autre » is unknown) simply
 * needs the link pasted by hand.
 */
const TRACKING_URL_TEMPLATES: Partial<Record<ShippingCarrier, string>> = {
  mondial_relay: 'https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition={n}',
  colissimo: 'https://www.laposte.fr/outils/suivre-vos-envois?code={n}',
  chronopost: 'https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT={n}',
  dpd: 'https://www.dpd.fr/trace/{n}',
  gls: 'https://gls-group.com/FR/fr/suivi-colis?match={n}',
  ups: 'https://www.ups.com/track?loc=fr_FR&tracknum={n}',
  dhl: 'https://www.dhl.com/fr-fr/home/tracking/tracking-parcel.html?tracking-id={n}',
  fedex: 'https://www.fedex.com/fedextrack/?trknbr={n}',
};

/** Carriers whose tracking page can be reached from the number alone. */
export function carrierHasTemplate(carrier: ShippingCarrier | null): boolean {
  return carrier !== null && TRACKING_URL_TEMPLATES[carrier] !== undefined;
}

/**
 * The link to follow the parcel. An explicit URL always wins: a marketplace
 * often hands out its own tracking page, which knows more than the carrier's.
 */
export function trackingLink(input: {
  shippingCarrier: ShippingCarrier | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
}): string | null {
  const explicit = input.trackingUrl?.trim();
  if (explicit) return explicit;

  const number = input.trackingNumber?.trim();
  if (!number || !input.shippingCarrier) return null;

  const template = TRACKING_URL_TEMPLATES[input.shippingCarrier];
  if (!template) return null;
  // Spaces are common when a number is copied off a label.
  return template.replace('{n}', encodeURIComponent(number.replace(/\s+/g, '')));
}

/** Days until the announced delivery; negative once the parcel is late. */
export function daysUntil(isoDay: string, now: Date = new Date()): number {
  const [year, month, day] = isoDay.split('-').map(Number);
  const target = new Date(year!, month! - 1, day!).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

/** A parcel is late when its announced date is past and it has not arrived. */
export function isLate(
  item: { status: InventoryItem['status']; expectedArrival: string | null },
  now: Date = new Date(),
): boolean {
  if (item.status !== 'en_transit' || !item.expectedArrival) return false;
  return daysUntil(item.expectedArrival, now) < 0;
}
