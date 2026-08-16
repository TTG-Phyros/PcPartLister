import type { ItemCondition, ItemStatus, PurchasePlatform } from '@/lib/inventory/labels';
import type { ShippingCarrier } from '@/lib/inventory/tracking';
import type { ComponentCategory } from '@/lib/specs';

/**
 * Statuses a freshly entered batch can be in. A batch is an arrival, not a
 * lifecycle: whatever happens to a unit afterwards is decided unit by unit.
 */
export const BATCH_STATUSES = ['en_transit', 'en_stock'] as const satisfies readonly ItemStatus[];

/** One unit of a batch, as shown on the batch page. */
export type BatchLine = {
  inventoryItemId: string;
  category: ComponentCategory;
  brand: string;
  model: string;
  imagePath: string | null;
  summary: string[];
  /** This unit's share of the batch total. */
  priceCents: number;
  condition: ItemCondition;
  status: ItemStatus;
  receivedAt: string | null;
};

export type PurchaseBatchDetail = {
  id: string;
  label: string;
  totalPriceCents: number;
  purchaseDate: string;
  platform: PurchasePlatform;
  listingUrl: string | null;
  shippingCarrier: ShippingCarrier | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  expectedArrival: string | null;
  notes: string | null;
  createdAt: string;
  lines: BatchLine[];
  /**
   * What the units add up to today. Equal to `totalPriceCents` on the day the
   * batch is created, and allowed to drift afterwards — a unit deleted or
   * re-priced by hand is a legitimate correction, not a bug to hide.
   */
  splitTotalCents: number;
};

/**
 * What a list needs to fold a batch into one collapsible row: how to name it,
 * what it cost, and where its parcel is. `itemCount` is the batch's real size,
 * which a filtered or paginated list may well be showing only part of.
 */
export type BatchHeader = {
  id: string;
  label: string;
  totalPriceCents: number;
  purchaseDate: string;
  platform: PurchasePlatform;
  shippingCarrier: ShippingCarrier | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  expectedArrival: string | null;
  itemCount: number;
};

/** What a unit's own page needs to say « it came in with four others ». */
export type BatchMembership = {
  id: string;
  label: string;
  itemCount: number;
  totalPriceCents: number;
  shippingCarrier: ShippingCarrier | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  expectedArrival: string | null;
};
