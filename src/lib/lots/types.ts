import type { Lot } from '@/lib/db/schema';
import type { ItemCondition, ItemStatus } from '@/lib/inventory/labels';
import type { ComponentCategory } from '@/lib/specs';

export type LotStatus = Lot['status'];

/** One unit in a lot, with everything the list needs to show it. */
export type LotLine = {
  id: string;
  inventoryItemId: string;
  category: ComponentCategory;
  brand: string;
  model: string;
  imagePath: string | null;
  summary: string[];
  /** What the unit cost: a lot is priced against the sum of these. */
  priceCents: number;
  condition: ItemCondition;
  purchaseDate: string;
  position: number;
};

export type LotDetail = {
  id: string;
  name: string;
  status: LotStatus;
  listedAt: string | null;
  askingPriceCents: number | null;
  notes: string | null;
  createdAt: string;
  lines: LotLine[];
};

export type LotSummaryRow = {
  id: string;
  name: string;
  status: LotStatus;
  createdAt: string;
  lineCount: number;
  costCents: number;
  askingPriceCents: number | null;
  listedAt: string | null;
};

/** A unit free to join a lot, offered by the picker. */
export type LotCandidate = {
  id: string;
  category: ComponentCategory;
  brand: string;
  model: string;
  imageUrl: string;
  summary: string[];
  priceCents: number;
  condition: ItemCondition;
  purchaseDate: string;
};

export const LOT_STATUSES = ['brouillon', 'en_vente', 'vendu'] as const;

/**
 * A unit placed in a lot is no longer freely available, exactly as in a
 * configuration: reserved while the lot is assembled, on sale once announced,
 * sold once the lot is sold.
 */
export const UNIT_STATUS_FOR_LOT: Record<LotStatus, ItemStatus> = {
  brouillon: 'reserve',
  en_vente: 'en_vente',
  vendu: 'vendu',
};

export const LOT_STATUS_LABELS: Record<LotStatus, string> = {
  brouillon: 'En préparation',
  en_vente: 'En vente',
  vendu: 'Vendu',
};

export const LOT_STATUS_TONES: Record<LotStatus, string> = {
  brouillon: 'bg-surface-hover text-ink-muted',
  en_vente: 'border border-ok/50 text-ok',
  vendu: 'bg-ok/15 text-ok',
};
