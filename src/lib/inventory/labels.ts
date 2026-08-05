import type { InventoryItem } from '@/lib/db/schema';

export type ItemStatus = InventoryItem['status'];
export type ItemCondition = InventoryItem['condition'];
export type PurchasePlatform = InventoryItem['platform'];

/** Ordered for the dropdowns, from « pas encore là » to « fin de vie ». */
export const ITEM_STATUSES = [
  'en_transit',
  'en_stock',
  'reserve',
  'monte',
  'en_vente',
  'vendu',
  'hs',
] as const;
export const ITEM_CONDITIONS = ['neuf', 'tres_bon', 'bon', 'defectueux', 'a_tester'] as const;
export const PURCHASE_PLATFORMS = [
  'vinted',
  'leboncoin',
  'facebook',
  'main_propre',
  'amazon',
  'autre',
] as const;

/** Amazon does not resell for you: the sale form offers a narrower list. */
export const SALE_PLATFORMS = [
  'vinted',
  'leboncoin',
  'facebook',
  'main_propre',
  'autre',
] as const;

export const STATUS_LABELS: Record<ItemStatus, string> = {
  en_transit: 'En transit',
  en_stock: 'En stock',
  reserve: 'Réservé',
  monte: 'Monté',
  en_vente: 'En vente',
  vendu: 'Vendu',
  hs: 'HS',
};

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  neuf: 'Neuf',
  tres_bon: 'Très bon',
  bon: 'Bon',
  defectueux: 'Défectueux',
  a_tester: 'À tester',
};

export const PLATFORM_LABELS: Record<PurchasePlatform, string> = {
  vinted: 'Vinted',
  leboncoin: 'Leboncoin',
  facebook: 'Facebook Marketplace',
  main_propre: 'Main propre',
  amazon: 'Amazon',
  autre: 'Autre',
};

/** Buying in person means there is no parcel to follow. */
export const IN_PERSON_PLATFORMS: PurchasePlatform[] = ['main_propre'];

/** Tailwind classes for the status pill, kept next to the labels. */
export const STATUS_TONES: Record<ItemStatus, string> = {
  // Outlined rather than filled: the unit is not physically there yet.
  en_transit: 'border border-brand/50 text-brand',
  en_stock: 'bg-ok/15 text-ok',
  reserve: 'bg-warn/15 text-warn',
  monte: 'bg-brand/15 text-brand',
  // Outlined like `en_transit`, the other status where the unit is on its way:
  // owned today, gone tomorrow.
  en_vente: 'border border-ok/50 text-ok',
  vendu: 'bg-surface-hover text-ink-muted',
  hs: 'bg-danger/15 text-danger',
};

/**
 * Statuses driven by a build rather than by hand. Editing them directly is
 * allowed but flagged, so the stock never silently contradicts a configuration.
 */
export const BUILD_DRIVEN_STATUSES: ItemStatus[] = ['reserve', 'monte', 'vendu'];

/**
 * Statuses a unit can still be engaged from — owned hardware that is not
 * already promised to a buyer. A parcel on its way counts: a configuration is
 * planned well before it is assembled. Out: `en_vente` and `vendu`, promised or
 * gone, and `hs`, which no configuration should be built on.
 */
export const AVAILABLE_STATUSES: ItemStatus[] = ['en_stock', 'reserve', 'monte', 'en_transit'];
