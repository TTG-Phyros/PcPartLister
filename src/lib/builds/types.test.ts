import { describe, expect, it } from 'vitest';
import { STATUS_LABELS } from '@/lib/inventory/labels';
import { lineBadge } from './types';

describe('lineBadge', () => {
  it('marks a model still to be bought', () => {
    expect(lineBadge({ unit: null }).label).toBe('À acheter');
  });

  it('marks a unit actually on the shelf as being in stock', () => {
    expect(lineBadge({ unit: { status: 'en_stock', receivedAt: '2026-08-01' } }).label).toBe(
      'En stock',
    );
  });

  it('never claims stock for a unit still travelling', () => {
    // The bug this guards: a parcel placed in a configuration used to be shown
    // as stock, because the badge read « an owned unit is attached » rather
    // than « the unit is here ».
    expect(lineBadge({ unit: { status: 'en_transit', receivedAt: null } }).label).toBe(
      STATUS_LABELS.en_transit,
    );
  });

  it('never claims stock for a purchase not collected yet', () => {
    expect(lineBadge({ unit: { status: 'reserve', receivedAt: null } }).label).toBe(
      STATUS_LABELS.reserve,
    );
  });

  it('reads presence off the reception date, not the status', () => {
    // Same status, opposite answers: `reserve` covers both a part waiting at
    // the seller's and one on the shelf held by this very draft.
    expect(lineBadge({ unit: { status: 'reserve', receivedAt: '2026-08-01' } }).label).toBe(
      'En stock',
    );
  });
});
