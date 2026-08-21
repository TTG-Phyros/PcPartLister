import { describe, expect, it } from 'vitest';
import { sharesByLine, splitEvenly } from './split';

describe('splitEvenly', () => {
  it('divides an amount that falls right', () => {
    expect(splitEvenly(9000, 3)).toEqual([3000, 3000, 3000]);
  });

  it('hands the leftover cents to the first units', () => {
    expect(splitEvenly(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it('never loses nor invents a cent', () => {
    for (const total of [0, 1, 7, 999, 10_000, 123_457]) {
      for (const count of [1, 2, 3, 5, 7, 11]) {
        const shares = splitEvenly(total, count);
        expect(shares).toHaveLength(count);
        expect(shares.reduce((sum, share) => sum + share, 0)).toBe(total);
      }
    }
  });

  it('spreads a remainder smaller than the unit count one cent at a time', () => {
    // 2 cents over 5 units: two units pay one cent more, nobody pays two.
    expect(splitEvenly(2, 5)).toEqual([1, 1, 0, 0, 0]);
  });

  it('gives a single unit the whole amount', () => {
    expect(splitEvenly(4599, 1)).toEqual([4599]);
  });

  it('handles a free batch', () => {
    expect(splitEvenly(0, 4)).toEqual([0, 0, 0, 0]);
  });

  it('returns nothing for an empty batch rather than dividing by zero', () => {
    expect(splitEvenly(1000, 0)).toEqual([]);
  });
});

describe('sharesByLine', () => {
  it('hands each line the cents of its own units, in order', () => {
    expect(sharesByLine(10000, [1, 2])).toEqual([[3334], [3333, 3333]]);
  });

  it('adds up to the amount paid, whatever the lines look like', () => {
    for (const quantities of [[1, 1], [3, 1, 5], [7], [2, 2, 2, 2]]) {
      const total = 12_345;
      const spent = sharesByLine(total, quantities)
        .flat()
        .reduce((sum, cents) => sum + cents, 0);
      expect(spent).toBe(total);
    }
  });

  it('gives an empty batch nothing to share', () => {
    expect(sharesByLine(5000, [])).toEqual([]);
  });
});
