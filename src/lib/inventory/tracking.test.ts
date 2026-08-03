import { describe, expect, it } from 'vitest';
import { carrierHasTemplate, daysUntil, isLate, trackingLink } from './tracking';

const none = { shippingCarrier: null, trackingNumber: null, trackingUrl: null };

describe('trackingLink', () => {
  it('builds the carrier link from the tracking number', () => {
    expect(
      trackingLink({ ...none, shippingCarrier: 'mondial_relay', trackingNumber: '12345678' }),
    ).toBe('https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=12345678');
  });

  it('strips the spaces a label number is copied with', () => {
    expect(
      trackingLink({ ...none, shippingCarrier: 'colissimo', trackingNumber: '6A 1234 5678 9' }),
    ).toBe('https://www.laposte.fr/outils/suivre-vos-envois?code=6A123456789');
  });

  it('escapes a number that would break the query string', () => {
    expect(trackingLink({ ...none, shippingCarrier: 'ups', trackingNumber: 'a&b=c' })).toBe(
      'https://www.ups.com/track?loc=fr_FR&tracknum=a%26b%3Dc',
    );
  });

  it('prefers an explicit link, which knows more than the carrier page', () => {
    expect(
      trackingLink({
        shippingCarrier: 'mondial_relay',
        trackingNumber: '12345678',
        trackingUrl: 'https://www.vinted.fr/suivi/42',
      }),
    ).toBe('https://www.vinted.fr/suivi/42');
  });

  it('has nothing to offer without a carrier or a link', () => {
    expect(trackingLink({ ...none, trackingNumber: '12345678' })).toBeNull();
    expect(trackingLink({ ...none, shippingCarrier: 'colissimo' })).toBeNull();
    expect(trackingLink(none)).toBeNull();
  });

  it('falls back to the pasted link for a carrier without a tracking page', () => {
    expect(
      trackingLink({ ...none, shippingCarrier: 'relais_colis', trackingNumber: '12345678' }),
    ).toBeNull();
    expect(carrierHasTemplate('relais_colis')).toBe(false);
    expect(carrierHasTemplate('chronopost')).toBe(true);
  });
});

describe('daysUntil', () => {
  const now = new Date(2026, 7, 3, 22, 30); // 3 August 2026, late evening

  it('counts calendar days, not 24-hour slices', () => {
    expect(daysUntil('2026-08-04', now)).toBe(1);
    expect(daysUntil('2026-08-03', now)).toBe(0);
    expect(daysUntil('2026-08-01', now)).toBe(-2);
  });

  it('crosses a DST change without drifting', () => {
    // 25 October 2026 is the end of summer time in France.
    expect(daysUntil('2026-10-26', new Date(2026, 9, 24, 12))).toBe(2);
  });
});

describe('isLate', () => {
  const now = new Date(2026, 7, 3);

  it('flags a parcel past its announced date', () => {
    expect(isLate({ status: 'en_transit', expectedArrival: '2026-08-01' }, now)).toBe(true);
  });

  it('leaves a parcel due today alone', () => {
    expect(isLate({ status: 'en_transit', expectedArrival: '2026-08-03' }, now)).toBe(false);
  });

  it('says nothing about a unit that already arrived or has no date', () => {
    expect(isLate({ status: 'en_stock', expectedArrival: '2026-08-01' }, now)).toBe(false);
    expect(isLate({ status: 'en_transit', expectedArrival: null }, now)).toBe(false);
  });
});
