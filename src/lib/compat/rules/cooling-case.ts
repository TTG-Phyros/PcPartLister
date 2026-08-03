import { blocking, ok, type Rule } from '../types';
import { cpuCoolers } from './helpers';

export const coolerCaseHeightRule: Rule = {
  id: 'cooler-case-height',
  label: 'Hauteur du ventirad',
  slots: ['cooling', 'case'],
  evaluate: (selection) => {
    const pcCase = selection.case;
    if (!pcCase) return null;

    // Only tower coolers have a height constraint; case fans and AIO blocks do not.
    const towers = cpuCoolers(selection).filter(
      (cooler) => cooler.specs.coolingType === 'air' && cooler.specs.heightMm,
    );
    if (towers.length === 0) return null;

    const max = pcCase.specs.maxCoolerHeightMm;
    const tooTall = towers.find((cooler) => (cooler.specs.heightMm ?? 0) > max);

    if (!tooTall) return ok(`Ventirad dans la limite de ${max} mm.`);
    return blocking(
      `ventirad de ${tooTall.specs.heightMm} mm pour ${max} mm maximum dans le boîtier`,
    );
  },
};

export const aioRadiatorCaseRule: Rule = {
  id: 'aio-radiator-case',
  label: 'Emplacement du radiateur AIO',
  slots: ['cooling', 'case'],
  evaluate: (selection) => {
    const pcCase = selection.case;
    if (!pcCase) return null;

    const aios = selection.cooling.filter(
      (cooler) => cooler.specs.coolingType === 'aio' && cooler.specs.radiatorSizeMm,
    );
    if (aios.length === 0) return null;

    const supported = pcCase.specs.radiatorSupportMm ?? [];
    const unsupported = aios.find(
      (cooler) => !supported.includes(cooler.specs.radiatorSizeMm as number),
    );

    if (!unsupported) return ok('Radiateur compatible avec les emplacements du boîtier.');

    if (supported.length === 0) {
      return blocking(
        `radiateur de ${unsupported.specs.radiatorSizeMm} mm — le boîtier n’accepte aucun watercooling`,
      );
    }
    return blocking(
      `radiateur de ${unsupported.specs.radiatorSizeMm} mm — le boîtier n’accepte que ${supported.join(', ')} mm`,
    );
  },
};
