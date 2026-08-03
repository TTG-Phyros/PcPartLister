const indexFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Performance index as the ranking states it: a percentage of the reference card. */
export function formatGpuIndex(index: number): string {
  return `${indexFormat.format(index)} %`;
}
