import type { CoolingSpecs } from '@/lib/specs';
import type { BuildSelection, SelectedPart } from '../types';

/** Coolers that mount on the CPU, as opposed to plain case fans. */
export function cpuCoolers(selection: BuildSelection): SelectedPart<CoolingSpecs>[] {
  return selection.cooling.filter(
    (item) => item.specs.coolingType === 'air' || item.specs.coolingType === 'aio',
  );
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** French list joining: "A, B et C". */
export function joinFr(values: string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} et ${values.at(-1)}`;
}
