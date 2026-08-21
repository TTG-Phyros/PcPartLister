import { describe, expect, it } from 'vitest';
import { ITEM_STATUSES } from './labels';
import {
  UNIT_STATUS_FOR_BUILD,
  UNIT_STATUS_FOR_LOT,
  arrival,
  automatic,
  awaitedBlockMessage,
  freed,
  hasParcel,
  initialReceivedAt,
  initialStatus,
  isInHand,
  requiresUnitsInHand,
  stillAwaited,
  type UnitPresence,
} from './status';

const noParcel = { trackingNumber: null, trackingUrl: null, expectedArrival: null };

/** The three shapes a unit can take, as the rest of the app sees them. */
const travelling: UnitPresence = { status: 'en_transit', receivedAt: null };
const toCollect: UnitPresence = { status: 'reserve', receivedAt: null };
const onShelf: UnitPresence = { status: 'en_stock', receivedAt: '2026-08-01' };
const held: UnitPresence = { status: 'reserve', receivedAt: '2026-08-01' };

describe('initialStatus', () => {
  it('starts a purchase with a tracking number in transit', () => {
    expect(initialStatus({ ...noParcel, trackingNumber: '6M12345678901' })).toBe('en_transit');
  });

  it('reserves a purchase with nothing to follow and nothing collected', () => {
    // The default: an agreed sale is not a part in a drawer.
    expect(initialStatus(noParcel)).toBe('reserve');
  });

  it('puts a purchase collected on the spot straight in stock', () => {
    expect(initialStatus(noParcel, 'en_stock')).toBe('en_stock');
  });

  it('lets the parcel win over the hand-over', () => {
    // A tracking number and « déjà récupérée » contradict each other; the
    // parcel is the one that was typed on purpose.
    expect(initialStatus({ ...noParcel, trackingNumber: 'X1' }, 'en_stock')).toBe('en_transit');
  });

  it('takes a pasted tracking link as a parcel of its own', () => {
    // Marketplaces hand out their own tracking page and no number at all.
    expect(initialStatus({ ...noParcel, trackingUrl: 'https://suivi.example/abc' })).toBe(
      'en_transit',
    );
  });

  it('takes an announced delivery day as a parcel', () => {
    expect(initialStatus({ ...noParcel, expectedArrival: '2026-08-25' })).toBe('en_transit');
  });

  it('ignores blank tracking fields left behind by the form', () => {
    expect(
      initialStatus({ trackingNumber: '', trackingUrl: '', expectedArrival: '' } as never),
    ).toBe('reserve');
    expect(hasParcel(noParcel)).toBe(false);
  });
});

describe('initialReceivedAt', () => {
  it('dates a unit picked up on the spot to the day it was bought', () => {
    expect(initialReceivedAt('en_stock', '2026-08-01')).toBe('2026-08-01');
  });

  it('leaves a unit that has not arrived without a date', () => {
    expect(initialReceivedAt('en_transit', '2026-08-01')).toBeNull();
    expect(initialReceivedAt('reserve', '2026-08-01')).toBeNull();
  });
});

describe('isInHand', () => {
  it('reads the reception date, never the status', () => {
    expect(isInHand(onShelf)).toBe(true);
    // Same status, opposite answers: `reserve` says nothing about where a unit
    // is, which is the whole reason the date exists.
    expect(isInHand(held)).toBe(true);
    expect(isInHand(toCollect)).toBe(false);
    expect(isInHand(travelling)).toBe(false);
  });
});

describe('automatic', () => {
  it('lets a unit in hand follow the event', () => {
    expect(automatic(onShelf, 'reserve')).toBe('reserve');
    expect(automatic(held, 'monte')).toBe('monte');
    expect(automatic({ status: 'monte', receivedAt: '2026-08-01' }, 'en_vente')).toBe('en_vente');
    expect(automatic({ status: 'en_vente', receivedAt: '2026-08-01' }, 'vendu')).toBe('vendu');
  });

  it('never moves a unit that has not arrived, whatever is asked', () => {
    for (const target of ITEM_STATUSES) {
      expect(automatic(travelling, target)).toBe('en_transit');
      expect(automatic(toCollect, target)).toBe('reserve');
    }
  });

  it('refuses the jumps a configuration used to make', () => {
    // Marking a build assembled, listed or sold moved its parts along with it,
    // reception date and all, even the ones still in a parcel.
    expect(automatic(travelling, UNIT_STATUS_FOR_BUILD.montee)).toBe('en_transit');
    expect(automatic(travelling, UNIT_STATUS_FOR_BUILD.en_vente)).toBe('en_transit');
    expect(automatic(travelling, UNIT_STATUS_FOR_BUILD.vendue)).toBe('en_transit');
    expect(automatic(toCollect, UNIT_STATUS_FOR_LOT.en_vente)).toBe('reserve');
    expect(automatic(toCollect, UNIT_STATUS_FOR_LOT.vendu)).toBe('reserve');
  });
});

describe('freed', () => {
  it('puts a unit in hand back on the shelf', () => {
    expect(freed(held)).toBe('en_stock');
    expect(freed({ status: 'monte', receivedAt: '2026-08-01' })).toBe('en_stock');
    expect(freed({ status: 'en_vente', receivedAt: '2026-08-01' })).toBe('en_stock');
  });

  it('leaves a unit that has not arrived waiting for it', () => {
    expect(freed(travelling)).toBe('en_transit');
    // The one a plain « back to stock » used to get wrong: a purchase never
    // collected came out of a configuration as if it were on the shelf.
    expect(freed(toCollect)).toBe('reserve');
  });

  it('does not repair a dead unit by taking it out of a configuration', () => {
    expect(freed({ status: 'hs', receivedAt: '2026-08-01' })).toBe('hs');
  });
});

describe('arrival', () => {
  it('is the one way out of waiting, for a parcel and for a pickup alike', () => {
    expect(arrival(travelling)).toBe('en_stock');
    expect(arrival(toCollect)).toBe('en_stock');
  });

  it('has nothing to do to a unit that is already here', () => {
    expect(arrival(onShelf)).toBeNull();
    expect(arrival(held)).toBeNull();
    for (const status of ITEM_STATUSES) {
      expect(arrival({ status, receivedAt: '2026-08-01' })).toBeNull();
    }
  });

  it('lands every awaited unit of a shared purchase and leaves the others alone', () => {
    // One batch, one parcel: three units bought together, one already received.
    const batch: UnitPresence[] = [travelling, travelling, onShelf];
    expect(batch.map((unit) => arrival(unit) ?? unit.status)).toEqual([
      'en_stock',
      'en_stock',
      'en_stock',
    ]);
    expect(batch.filter((unit) => arrival(unit) !== null)).toHaveLength(2);
  });
});

describe('requiresUnitsInHand', () => {
  it('lets a draft hold parts that have not arrived', () => {
    expect(requiresUnitsInHand('brouillon')).toBe(false);
  });

  it('claims something physical once assembled, announced or sold', () => {
    expect(requiresUnitsInHand('montee')).toBe(true);
    expect(requiresUnitsInHand('en_vente')).toBe(true);
    expect(requiresUnitsInHand('vendue')).toBe(true);
    expect(requiresUnitsInHand('vendu')).toBe(true);
  });
});

describe('stillAwaited', () => {
  it('counts what a configuration is waiting on, parcels and pickups alike', () => {
    expect(stillAwaited([onShelf, travelling, held, toCollect])).toBe(2);
  });

  it('clears a configuration whose parts are all in hand', () => {
    expect(stillAwaited([onShelf, held])).toBe(0);
    expect(stillAwaited([])).toBe(0);
  });
});

describe('awaitedBlockMessage', () => {
  it('speaks of one unit in the singular', () => {
    expect(awaitedBlockMessage(1)).toBe(
      '1 unité n’est pas encore arrivée : marquez-la comme reçue d’abord.',
    );
  });

  it('speaks of several in the plural', () => {
    expect(awaitedBlockMessage(3)).toBe(
      '3 unités ne sont pas encore arrivées : marquez-les comme reçues d’abord.',
    );
  });
});
