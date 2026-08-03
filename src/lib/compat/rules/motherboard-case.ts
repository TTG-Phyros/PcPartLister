import { blocking, ok, type Rule } from '../types';
import { joinFr } from './helpers';

export const motherboardCaseFormFactorRule: Rule = {
  id: 'motherboard-case-format',
  label: 'Format carte mère / boîtier',
  slots: ['motherboard', 'case'],
  evaluate: (selection) => {
    const motherboard = selection.motherboard;
    const pcCase = selection.case;
    if (!motherboard || !pcCase) return null;

    const format = motherboard.specs.formFactor;
    const supported = pcCase.specs.supportedFormFactors;

    if (supported.includes(format)) {
      return ok(`Format ${format} accepté par le boîtier.`);
    }
    return blocking(
      `carte mère ${format} — le boîtier n’accepte que ${joinFr([...supported])}`,
    );
  },
};
