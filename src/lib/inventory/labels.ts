import type { InventoryItem } from '@/lib/db/schema';

export type ItemStatus = InventoryItem['status'];
export type ItemCondition = InventoryItem['condition'];
export type PurchasePlatform = InventoryItem['platform'];

export const ITEM_STATUSES = ['en_stock', 'reserve', 'monte', 'vendu', 'hs'] as const;
export const ITEM_CONDITIONS = ['neuf', 'tres_bon', 'bon', 'defectueux', 'a_tester'] as const;
export const PURCHASE_PLATFORMS = ['vinted', 'leboncoin', 'facebook', 'autre'] as const;

export const STATUS_LABELS: Record<ItemStatus, string> = {
  en_stock: 'En stock',
  reserve: 'Réservé',
  monte: 'Monté',
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
  autre: 'Autre',
};

/** Tailwind classes for the status pill, kept next to the labels. */
export const STATUS_TONES: Record<ItemStatus, string> = {
  en_stock: 'bg-ok/15 text-ok',
  reserve: 'bg-warn/15 text-warn',
  monte: 'bg-brand/15 text-brand',
  vendu: 'bg-surface-hover text-ink-muted',
  hs: 'bg-danger/15 text-danger',
};

/**
 * Statuses driven by a build rather than by hand. Editing them directly is
 * allowed but flagged, so the stock never silently contradicts a configuration.
 */
export const BUILD_DRIVEN_STATUSES: ItemStatus[] = ['reserve', 'monte', 'vendu'];

/** Statuses that still represent owned, usable hardware. */
export const AVAILABLE_STATUSES: ItemStatus[] = ['en_stock'];
