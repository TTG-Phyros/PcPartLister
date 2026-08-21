import { describe, expect, it } from 'vitest';
import {
  articleShares,
  emptyPurchase,
  handoverForMode,
  isBatch,
  missingParcel,
  parcelForMode,
  purchaseFields,
  unitCount,
  wizardStatus,
  type WizardPurchase,
} from './wizard';

const NO_PARCEL = { trackingNumber: null, trackingUrl: null, expectedArrival: null };
const PARCEL = { trackingNumber: '1234', trackingUrl: null, expectedArrival: null };

function purchase(overrides: Partial<WizardPurchase> = {}): WizardPurchase {
  return { ...emptyPurchase('2026-08-21'), ...overrides };
}

describe('wizardStatus', () => {
  it('puts a part picked up on the spot straight on the shelf', () => {
    expect(wizardStatus('emporte', NO_PARCEL)).toBe('en_stock');
  });

  it('leaves a part still to collect waiting', () => {
    expect(wizardStatus('a_recuperer', NO_PARCEL)).toBe('reserve');
  });

  it('sends a parcel on the road', () => {
    expect(wizardStatus('envoi', PARCEL)).toBe('en_transit');
  });

  it('ignores a parcel left behind by a change of mind', () => {
    // The tracking number was typed, then « main propre » was chosen: the unit
    // is in hand, and nothing must claim it is travelling.
    expect(wizardStatus('emporte', PARCEL)).toBe('en_stock');
    expect(parcelForMode('emporte', PARCEL)).toEqual(NO_PARCEL);
  });
});

describe('missingParcel', () => {
  it('holds back an envoi that names no parcel at all', () => {
    expect(missingParcel('envoi', NO_PARCEL)).toBe(true);
  });

  it('is happy with any one of the three answers', () => {
    expect(missingParcel('envoi', PARCEL)).toBe(false);
    expect(missingParcel('envoi', { ...NO_PARCEL, trackingUrl: 'https://x' })).toBe(false);
    expect(missingParcel('envoi', { ...NO_PARCEL, expectedArrival: '2026-08-30' })).toBe(false);
  });

  it('asks nothing of a hand-over', () => {
    expect(missingParcel('emporte', NO_PARCEL)).toBe(false);
    expect(missingParcel('a_recuperer', NO_PARCEL)).toBe(false);
  });
});

describe('purchaseFields', () => {
  it('posts the hand-over the mode implies', () => {
    expect(purchaseFields(purchase({ mode: 'emporte' })).handover).toBe('en_stock');
    expect(purchaseFields(purchase({ mode: 'a_recuperer' })).handover).toBe('reserve');
    expect(handoverForMode('envoi')).toBe('reserve');
  });

  it('blanks a parcel the mode no longer carries, rather than omitting it', () => {
    const fields = purchaseFields(
      purchase({
        mode: 'emporte',
        shippingCarrier: 'colissimo',
        trackingNumber: '1234',
        trackingUrl: 'https://x',
        expectedArrival: '2026-08-30',
      }),
    );
    expect(fields.trackingNumber).toBe('');
    expect(fields.trackingUrl).toBe('');
    expect(fields.expectedArrival).toBe('');
    expect(fields.shippingCarrier).toBe('');
  });

  it('keeps the parcel of an envoi', () => {
    const fields = purchaseFields(
      purchase({ mode: 'envoi', shippingCarrier: 'colissimo', trackingNumber: '1234' }),
    );
    expect(fields.shippingCarrier).toBe('colissimo');
    expect(fields.trackingNumber).toBe('1234');
  });
});

describe('articleShares', () => {
  it('gives every article the cents of its own units', () => {
    // 100,00 € over three units: the leftover cent goes to the first one, which
    // is the first article — the very order the batch action posts them in.
    expect(articleShares(10_000, [{ quantity: 1 }, { quantity: 2 }])).toEqual([
      [3334],
      [3333, 3333],
    ]);
  });

  it('answers nothing while the price is not a usable amount', () => {
    expect(articleShares(null, [{ quantity: 2 }])).toEqual([[]]);
  });

  it('spends exactly what was paid', () => {
    const articles = [{ quantity: 3 }, { quantity: 1 }, { quantity: 5 }];
    const spent = articleShares(4999, articles)
      .flat()
      .reduce((sum, cents) => sum + cents, 0);
    expect(spent).toBe(4999);
    expect(unitCount(articles)).toBe(9);
  });

  it('sends a gift or a trade through at zero', () => {
    expect(articleShares(0, [{ quantity: 2 }])).toEqual([[0, 0]]);
  });
});

describe('isBatch', () => {
  it('keeps a lone unit out of the batch machinery', () => {
    expect(isBatch([{ quantity: 1 }])).toBe(false);
  });

  it('counts copies of one model as a batch, like several models', () => {
    // The batch action refuses fewer than two units, and is the only thing that
    // knows how to split a price: both shapes have to reach it.
    expect(isBatch([{ quantity: 2 }])).toBe(true);
    expect(isBatch([{ quantity: 1 }, { quantity: 1 }])).toBe(true);
  });
});
