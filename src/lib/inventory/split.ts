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

/**
 * The same split, read line by line: `quantities` are the copies each line of a
 * batch brought in, and the answer gives each line the cents its units got.
 *
 * Lines are served in order, which is what makes this shareable — the form
 * previewing the split and the action writing it must hand the leftover cents
 * to the very same units, or the preview lies.
 */
export function sharesByLine(totalCents: number, quantities: readonly number[]): number[][] {
  const total = quantities.reduce((sum, quantity) => sum + quantity, 0);
  const shares = splitEvenly(totalCents, total);

  let cursor = 0;
  return quantities.map((quantity) => {
    const slice = shares.slice(cursor, cursor + quantity);
    cursor += quantity;
    return slice;
  });
}
