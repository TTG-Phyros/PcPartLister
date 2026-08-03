import { MULTI_SLOT_CATEGORIES, type ComponentCategory, type ComponentSpecs } from '@/lib/specs';
import { RULES } from './registry';
import type { BuildSelection, EvaluatedRule, RuleResult, SelectedPart } from './types';

/**
 * Runs the rule set over a selection. Pure and synchronous, so the configurator
 * can call it on every keystroke on the client and the server can call it again
 * before saving.
 */
export function evaluate(selection: BuildSelection): EvaluatedRule[] {
  const results: EvaluatedRule[] = [];
  for (const rule of RULES) {
    const result = rule.evaluate(selection);
    if (!result) continue;
    results.push({ ...result, ruleId: rule.id, label: rule.label, slots: rule.slots });
  }
  return results;
}

export function blockingIssues(results: EvaluatedRule[]): EvaluatedRule[] {
  return results.filter((r) => !r.compatible && r.severite === 'bloquant');
}

export function warnings(results: EvaluatedRule[]): EvaluatedRule[] {
  return results.filter((r) => !r.compatible && r.severite === 'avertissement');
}

export type CandidateVerdict = {
  /** False only for blocking issues: a warning never removes a part from the list. */
  compatible: boolean;
  blocking: RuleResult[];
  warnings: RuleResult[];
  /** First message to show next to the greyed-out part. */
  reason?: string;
};

const MULTI = new Set<ComponentCategory>(MULTI_SLOT_CATEGORIES);

/** The selection as it stands without the candidate, used as the baseline. */
function withoutCategory(selection: BuildSelection, category: ComponentCategory): BuildSelection {
  if (MULTI.has(category)) return selection;
  return { ...selection, [category]: undefined };
}

function withCandidate(
  selection: BuildSelection,
  category: ComponentCategory,
  candidate: SelectedPart<ComponentSpecs>,
): BuildSelection {
  if (MULTI.has(category)) {
    const list = selection[category as 'ram' | 'storage' | 'cooling' | 'misc'];
    return { ...selection, [category]: [...list, candidate] };
  }
  return { ...selection, [category]: candidate };
}

/**
 * Decides whether a part can be added to the current selection, reporting only
 * what the candidate itself causes. A problem the build already has elsewhere
 * must not grey out unrelated parts, otherwise a single mistake would make the
 * whole configurator look broken.
 */
export function checkCandidate(
  selection: BuildSelection,
  category: ComponentCategory,
  candidate: SelectedPart<ComponentSpecs>,
): CandidateVerdict {
  const relevant = RULES.filter((rule) => !rule.buildOnly && rule.slots.includes(category));
  const baseline = withoutCategory(selection, category);
  const hypothetical = withCandidate(baseline, category, candidate);

  const preExisting = new Set<string>();
  for (const rule of relevant) {
    const result = rule.evaluate(baseline);
    if (result && !result.compatible) preExisting.add(rule.id);
  }

  const blocking: RuleResult[] = [];
  const warns: RuleResult[] = [];

  for (const rule of relevant) {
    if (preExisting.has(rule.id)) continue;
    const result = rule.evaluate(hypothetical);
    if (!result || result.compatible) continue;
    if (result.severite === 'bloquant') blocking.push(result);
    else warns.push(result);
  }

  return {
    compatible: blocking.length === 0,
    blocking,
    warnings: warns,
    reason: blocking[0]?.raison ?? warns[0]?.raison,
  };
}

export type { BuildSelection, EvaluatedRule, RuleResult, SelectedPart } from './types';
