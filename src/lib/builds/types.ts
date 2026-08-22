import type { Build } from '@/lib/db/schema';
import {
  STATUS_LABELS,
  STATUS_TONES,
  type ItemCondition,
  type ItemStatus,
} from '@/lib/inventory/labels';
import { isInHand, type UnitPresence } from '@/lib/inventory/status';
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
  /**
   * What the line costs this configuration: the real purchase price for owned
   * units, the estimate for the ones to buy — or the adjusted cost when one was
   * entered.
   */
  priceCents: number | null;
  /**
   * What the unit actually cost, kept only when an adjusted cost replaces it in
   * `priceCents`. NULL the rest of the time: nothing was overridden.
   */
  originalPriceCents: number | null;
  condition: ItemCondition | null;
  /**
   * Where the owned unit stands, and whether it has actually arrived. NULL for
   * a model still to be bought: nothing is awaited that was never purchased.
   * Carried rather than deduced from `source`, because holding a unit and
   * having it in hand are two different things — see `@/lib/inventory/status`.
   */
  unit: UnitPresence | null;
  position: number;
};

export type BuildDetail = {
  id: string;
  name: string;
  status: BuildStatus;
  consumablesCents: number;
  /** What the configuration aims to fetch; NULL while no objective is set. */
  targetPriceCents: number | null;
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
  /** Units already in hand: what the configuration can be built with today. */
  stockCount: number;
  /** Units bought but not arrived yet — owned, and still no use for assembly. */
  awaitedCount: number;
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
  /** Where the unit stands today — NULL for a catalog model nobody owns yet. */
  status: ItemStatus | null;
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

/**
 * What a line says about itself in the configurator. « En stock » is a claim
 * about the shelf, so only a unit actually there gets it: one still travelling,
 * or bought and not collected, wears its own status — the same badge the picker
 * showed before it was placed here. Presence is read off the reception date,
 * never the status, which alone cannot tell a parcel held by a draft from a
 * part on the shelf held by the same draft.
 */
export function lineBadge(line: Pick<BuildLine, 'unit'>): { label: string; tone: string } {
  if (line.unit === null) return { label: 'À acheter', tone: 'bg-warn/15 text-warn' };
  if (isInHand(line.unit)) return { label: 'En stock', tone: STATUS_TONES.en_stock };
  return { label: STATUS_LABELS[line.unit.status], tone: STATUS_TONES[line.unit.status] };
}

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
