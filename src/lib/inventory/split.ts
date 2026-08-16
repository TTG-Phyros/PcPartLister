/**
 * Splitting what a batch cost across the units it brought in. Prices are stored
 * in cents everywhere, so the split can be exact: no euro amount is ever
 * divided, only an integer number of cents.
 */

/**
 * Shares of `totalCents` over `count` units, equal to the cent. The remainder —
 * always fewer cents than there are units — goes to the first ones, so the sum
 * of the shares is exactly the amount paid.
 *
 * That last point is the whole reason this is not `Math.round(total / count)`:
 * a margin is computed from these per-unit prices, and a batch whose parts add
 * up to a centime less than the transfer is a batch that never reconciles.
 */
export function splitEvenly(totalCents: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}
