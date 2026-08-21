import type { BuildStatus } from '@/lib/builds/types';
import type { LotStatus } from '@/lib/lots/types';
import type { ItemStatus } from './labels';

/**
 * The one place that decides where a unit's status goes. Three questions, and
 * nothing else in the app answers them on its own:
 *
 *   — where is a unit born?            `initialStatus`
 *   — what may an event do to it?      `automatic`, `freed`
 *   — how does it stop waiting?        `arrival`
 *
 * The rule that shapes all three: **a unit that is not here does not move.** A
 * parcel does not land, and a hand-over does not happen, because a
 * configuration was assembled, a lot announced or a sale recorded. It happens
 * when someone says it happened. Every automatic transition therefore leaves a
 * unit that has not arrived exactly where it is, and the containers that need
 * their hardware in hand refuse to move instead of dragging it along — see
 * `stillAwaited`.
 *
 * Note where « being here » is read from: `receivedAt`, never the status. Two
 * statuses mean waiting — `en_transit` for a parcel, `reserve` for a purchase
 * not collected yet — and `reserve` also covers a unit sitting on the shelf and
 * held by a draft configuration. The reception date is what tells them apart,
 * and it is written by exactly two places: the purchase, and the arrival.
 *
 * `transitions.ts` is the SQL twin of this file: same rules, expressed as the
 * update patches the actions apply. Keep the two in step.
 */

/** What a form says about a parcel, whatever else it holds. */
export type ParcelFields = {
  trackingNumber: string | null;
  trackingUrl: string | null;
  expectedArrival: string | null;
};

/** Where a unit stands: what it says it is, and whether it is actually here. */
export type UnitPresence = {
  status: ItemStatus;
  receivedAt: string | null;
};

/**
 * How a purchase without a parcel changes hands. Reserved is the default: an
 * agreed sale is not a part in a drawer, and most of them are collected days
 * later. `en_stock` is the flea-market case — paid and pocketed on the spot.
 */
export const PURCHASE_HANDOVERS = ['reserve', 'en_stock'] as const;
export type PurchaseHandover = (typeof PURCHASE_HANDOVERS)[number];

export const HANDOVER_LABELS: Record<PurchaseHandover, string> = {
  reserve: 'Réservée, pas encore récupérée',
  en_stock: 'Déjà récupérée en main propre',
};

/**
 * Whether anything is on its way. The carrier is deliberately left out: it is a
 * dropdown that keeps its value, not a statement that a parcel exists — while a
 * number, a link or an announced day are only ever typed for a real one.
 */
export function hasParcel(parcel: ParcelFields): boolean {
  return Boolean(parcel.trackingNumber || parcel.trackingUrl || parcel.expectedArrival);
}

/**
 * Where a unit is born. A parcel to follow means it is on the road; otherwise
 * it is a hand-over, done on the spot or still to come. Never a free dropdown:
 * the status of a purchase is a fact about the purchase.
 */
export function initialStatus(
  parcel: ParcelFields,
  handover: PurchaseHandover = 'reserve',
): ItemStatus {
  return hasParcel(parcel) ? 'en_transit' : handover;
}

/**
 * The reception date a purchase is entered with. Only a unit already in hand
 * has one, and it is the day it was bought — the two others are still waiting,
 * each for its own reason.
 */
export function initialReceivedAt(status: ItemStatus, purchaseDate: string): string | null {
  return status === 'en_stock' ? purchaseDate : null;
}

/**
 * Whether the unit is physically here. The single question every automatic
 * transition asks, and the reason it is read off the date rather than the
 * status: `reserve` alone cannot tell « set aside for me at the seller's » from
 * « on my shelf, promised to a build ».
 */
export function isInHand(unit: UnitPresence): boolean {
  return unit.receivedAt !== null;
}

/**
 * A unit placed in a configuration is no longer freely available. Its status
 * follows the configuration: reserved while the build is a draft, mounted once
 * assembled, on sale once announced, sold once the build is sold.
 */
export const UNIT_STATUS_FOR_BUILD: Record<BuildStatus, ItemStatus> = {
  brouillon: 'reserve',
  montee: 'monte',
  en_vente: 'en_vente',
  vendue: 'vendu',
};

/**
 * The same idea for a lot, minus the assembly step: a lot is gathered, then
 * announced, then sold.
 */
export const UNIT_STATUS_FOR_LOT: Record<LotStatus, ItemStatus> = {
  brouillon: 'reserve',
  en_vente: 'en_vente',
  vendu: 'vendu',
};

/**
 * What an automatic event may do to a unit. Everything a configuration, a lot
 * or a sale asks for passes through here, and a unit that has not arrived comes
 * out untouched — the event is recorded, the wait goes on.
 */
export function automatic(unit: UnitPresence, target: ItemStatus): ItemStatus {
  return isInHand(unit) ? target : unit.status;
}

/**
 * Where a unit lands when whatever held it lets go — a line removed, a
 * configuration or a lot deleted. Back to the shelf, unless it never reached it
 * or was written off in the meantime: freeing a part is not a repair, and it is
 * not a delivery either.
 */
export function freed(unit: UnitPresence): ItemStatus {
  if (!isInHand(unit)) return unit.status;
  return unit.status === 'hs' ? 'hs' : 'en_stock';
}

/**
 * The one exit from waiting, and it is always somebody's explicit doing: the
 * parcel is marked received, or the hand-over is marked done — on a unit, or on
 * a whole batch sharing one purchase. Returns null when the unit was already
 * here, which is the caller's cue that there is nothing to announce.
 */
export function arrival(unit: UnitPresence): ItemStatus | null {
  return isInHand(unit) ? null : 'en_stock';
}

/**
 * Container statuses that mean the hardware is in hand. A draft is a plan and
 * may hold parts not collected yet; assembled, announced and sold all claim
 * something physical.
 */
export function requiresUnitsInHand(status: BuildStatus | LotStatus): boolean {
  return status !== 'brouillon';
}

/** How many of these units have not arrived yet. */
export function stillAwaited(units: readonly UnitPresence[]): number {
  return units.filter((unit) => !isInHand(unit)).length;
}

/**
 * Why a configuration or a lot cannot move yet. Spelled out rather than a bare
 * refusal: the way out is one tap away on the unit, and the message says so.
 */
export function awaitedBlockMessage(count: number): string {
  if (count > 1) {
    return `${count} unités ne sont pas encore arrivées : marquez-les comme reçues d’abord.`;
  }
  return '1 unité n’est pas encore arrivée : marquez-la comme reçue d’abord.';
}
