import type {
  CaseSpecs,
  ComponentCategory,
  CoolingSpecs,
  CpuSpecs,
  GpuSpecs,
  MiscSpecs,
  MotherboardSpecs,
  PsuSpecs,
  RamSpecs,
  StorageSpecs,
} from '@/lib/specs';

/**
 * Compatibility engine — public contract.
 *
 * Nothing here imports the database, React or Next.js: a rule is a pure
 * function of a selection, which is what makes it runnable on the server and in
 * the browser, and testable without any fixture beyond plain objects.
 */

export type Severity = 'bloquant' | 'avertissement';

/** The shape every rule returns, as specified. */
export type RuleResult = {
  compatible: boolean;
  raison: string;
  severite: Severity;
};

/** A part placed in a slot. `label` is only used to build readable messages. */
export type SelectedPart<S> = {
  id: string;
  label: string;
  specs: S;
};

/**
 * One CPU, motherboard, GPU, PSU and case at most; several RAM kits, drives,
 * cooling units and accessories.
 */
export type BuildSelection = {
  cpu?: SelectedPart<CpuSpecs>;
  motherboard?: SelectedPart<MotherboardSpecs>;
  gpu?: SelectedPart<GpuSpecs>;
  psu?: SelectedPart<PsuSpecs>;
  case?: SelectedPart<CaseSpecs>;
  ram: SelectedPart<RamSpecs>[];
  storage: SelectedPart<StorageSpecs>[];
  cooling: SelectedPart<CoolingSpecs>[];
  misc: SelectedPart<MiscSpecs>[];
};

export type Rule = {
  /** Stable identifier, used in tests and to deduplicate results. */
  id: string;
  /** Short human-readable name of what the rule checks. */
  label: string;
  /** Slots the rule reads. Drives which candidates it can disqualify. */
  slots: ComponentCategory[];
  /**
   * Set when the rule judges what the build is *missing* rather than a conflict
   * between two chosen parts. Such rules are reported on the build but skipped
   * while filtering candidates: a half-assembled selection is missing plenty of
   * things, and saying so next to every part would be pure noise.
   */
  buildOnly?: boolean;
  /**
   * Returns null when the rule does not apply — typically because one of the
   * parts it compares has not been chosen yet.
   */
  evaluate: (selection: BuildSelection) => RuleResult | null;
};

export type EvaluatedRule = RuleResult & {
  ruleId: string;
  label: string;
  slots: ComponentCategory[];
};

export function emptySelection(): BuildSelection {
  return { ram: [], storage: [], cooling: [], misc: [] };
}

/** Convenience for a rule that found nothing wrong. */
export function ok(raison: string): RuleResult {
  return { compatible: true, raison, severite: 'avertissement' };
}

export function blocking(raison: string): RuleResult {
  return { compatible: false, raison, severite: 'bloquant' };
}

export function warning(raison: string): RuleResult {
  return { compatible: false, raison, severite: 'avertissement' };
}
