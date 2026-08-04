import type { Sale } from '@/lib/db/schema';

export type SaleShippingMethod = Sale['shippingMethod'];

/**
 * What is being sold. A configuration goes out as a whole, a lot goes out as
 * one deal to one buyer, a spare part goes out on its own — and the three land
 * in the same history.
 */
export type SaleSubjectKind = 'build' | 'lot' | 'item';

export type SaleSubject = {
  kind: SaleSubjectKind;
  id: string;
  name: string;
};

const SUBJECT_ROOT: Record<SaleSubjectKind, string> = {
  build: '/configs',
  lot: '/lots',
  item: '/stock',
};

/** Page of the subject, so a sale always links back to what it emptied. */
export function subjectHref(subject: SaleSubject): string {
  return `${SUBJECT_ROOT[subject.kind]}/${subject.id}`;
}

export const SUBJECT_LABELS: Record<SaleSubjectKind, string> = {
  build: 'Configuration',
  lot: 'Lot',
  item: 'Composant',
};

/** Ordered for the dropdown: hand delivery first, it is the most common. */
export const SALE_SHIPPING_METHODS = [
  'main_propre',
  'mondial_relay',
  'colissimo',
  'chronopost',
  'relais_colis',
  'shop2shop',
  'lettre_suivie',
  'autre',
] as const;

export const SHIPPING_METHOD_LABELS: Record<SaleShippingMethod, string> = {
  main_propre: 'Remise en main propre',
  mondial_relay: 'Mondial Relay',
  colissimo: 'Colissimo',
  chronopost: 'Chronopost',
  relais_colis: 'Relais Colis',
  shop2shop: 'Shop2Shop',
  lettre_suivie: 'Lettre suivie',
  autre: 'Autre',
};

/** Handing the parcel over in person costs nothing to ship and has no tracking. */
export const IN_PERSON_SHIPPING: SaleShippingMethod[] = ['main_propre'];
