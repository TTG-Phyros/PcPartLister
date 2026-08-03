import type { BuildSelection, SelectedPart } from '@/lib/compat/engine';
import { emptySelection } from '@/lib/compat/types';
import type { ComponentCategory, ComponentSpecs } from '@/lib/specs';
import type { BuildLine, Candidate } from './types';

/**
 * Bridges the persisted build to the compatibility engine. The engine knows
 * nothing about builds, inventory or the catalog: it only ever sees labelled
 * specs, which is what keeps it testable in isolation.
 */

function label(brand: string, model: string): string {
  return `${brand} ${model}`.trim();
}

export function lineToPart(line: BuildLine): SelectedPart<ComponentSpecs> {
  return { id: line.id, label: label(line.brand, line.model), specs: line.specs };
}

export function candidateToPart(candidate: Candidate): SelectedPart<ComponentSpecs> {
  return {
    id: candidate.key,
    label: label(candidate.brand, candidate.model),
    specs: candidate.specs,
  };
}

/** Builds the engine input from the lines of a configuration. */
export function selectionFromLines(lines: BuildLine[]): BuildSelection {
  const selection = emptySelection();

  for (const line of lines) {
    const part = lineToPart(line);
    switch (line.slot) {
      case 'cpu':
      case 'motherboard':
      case 'gpu':
      case 'psu':
      case 'case':
        // Single-part slots: the last one wins, which cannot happen in practice
        // because the UI replaces instead of appending.
        Object.assign(selection, { [line.slot]: part });
        break;
      default:
        selection[line.slot as 'ram' | 'storage' | 'cooling' | 'misc'].push(part as never);
    }
  }

  return selection;
}

/** Same, but excluding one slot — used to judge a replacement candidate. */
export function selectionWithoutSlot(
  lines: BuildLine[],
  slot: ComponentCategory,
): BuildSelection {
  return selectionFromLines(lines.filter((line) => line.slot !== slot));
}
