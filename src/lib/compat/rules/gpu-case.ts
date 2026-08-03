import { blocking, ok, type Rule } from '../types';

export const gpuCaseLengthRule: Rule = {
  id: 'gpu-case-length',
  label: 'Longueur de la carte graphique',
  slots: ['gpu', 'case'],
  evaluate: (selection) => {
    const gpu = selection.gpu;
    const pcCase = selection.case;
    if (!gpu || !pcCase) return null;

    const length = gpu.specs.lengthMm;
    const max = pcCase.specs.maxGpuLengthMm;

    if (length <= max) return ok(`${length} mm pour ${max} mm disponibles.`);
    return blocking(`carte graphique de ${length} mm pour ${max} mm maximum dans le boîtier`);
  },
};
