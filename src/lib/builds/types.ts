import type { Build } from '@/lib/db/schema';
import type { ItemCondition } from '@/lib/inventory/labels';
import type { ComponentCategory, ComponentSpecs } from '@/lib/specs';

/**
 * Serializable shapes handed to the client configurator. Everything the
 * compatibility engine needs travels with them, so grading a candidate never
 * needs a round trip.
 */

export type BuildStatus = Build['status'];

export type BuildLine = {
  id: string;
  slot: ComponentCategory;
  /** An owned unit, or a catalog model still to be bought. */
  source: 'stock' | 'a_acheter';
  inventoryItemId: string | null;
  catalogComponentId: string;
  brand: string;
  model: string;
  imageUrl: string;
  summary: string[];
  specs: ComponentSpecs;
  /** Real purchase price for owned units, estimate for the ones to buy. */
  priceCents: number | null;
  condition: ItemCondition | null;
  position: number;
};

export type BuildDetail = {
  id: string;
  name: string;
  status: BuildStatus;
  consumablesCents: number;
  /** Day the configuration was listed, and the price asked in the listing. */
  listedAt: string | null;
  askingPriceCents: number | null;
  notes: string | null;
  createdAt: string;
  lines: BuildLine[];
};

export type BuildSummaryRow = {
  id: string;
  name: string;
  status: BuildStatus;
  createdAt: string;
  lineCount: number;
  stockCount: number;
  toBuyCount: number;
  componentsCents: number;
  consumablesCents: number;
};

/** A part offered for a slot, already carrying its specs for client-side grading. */
export type Candidate = {
  /** Unique within a slot listing: an owned unit and its model are distinct rows. */
  key: string;
  source: 'stock' | 'catalogue';
  inventoryItemId: string | null;
  catalogComponentId: string;
  brand: string;
  model: string;
  imageUrl: string;
  summary: string[];
  specs: ComponentSpecs;
  priceCents: number | null;
  condition: ItemCondition | null;
  purchaseDate: string | null;
};

/** The lifecycle of a configuration, in the order the flow shows it. */
export const BUILD_STATUSES = ['brouillon', 'montee', 'en_vente', 'vendue'] as const;

export const BUILD_STATUS_LABELS: Record<BuildStatus, string> = {
  brouillon: 'Brouillon',
  montee: 'Montée',
  en_vente: 'En vente',
  vendue: 'Vendue',
};

export const BUILD_STATUS_TONES: Record<BuildStatus, string> = {
  brouillon: 'bg-surface-hover text-ink-muted',
  montee: 'bg-brand/15 text-brand',
  // Outlined: still owned, already promised to someone else.
  en_vente: 'border border-ok/50 text-ok',
  vendue: 'bg-ok/15 text-ok',
};

/** Slots in the order the configurator shows them. */
export const SLOT_ORDER: ComponentCategory[] = [
  'cpu',
  'motherboard',
  'ram',
  'gpu',
  'storage',
  'psu',
  'case',
  'cooling',
  'misc',
];
