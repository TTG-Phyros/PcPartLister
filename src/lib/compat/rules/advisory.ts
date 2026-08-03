import { bottleneckMessage, readBottleneck } from '../bottleneck';
import { ok, warning, type Rule } from '../types';

/**
 * Purely advisory: a bottleneck is a judgement call on a use case, never an
 * assembly problem, so it must never remove a part from the list.
 *
 * Only a marked imbalance is reported. The finer readings of the same model are
 * the configurator gauge's business: an alert that fires on a merely imperfect
 * pairing would drown the ones that matter.
 */
export const cpuGpuBottleneckRule: Rule = {
  id: 'cpu-gpu-bottleneck',
  label: 'Équilibre processeur / carte graphique',
  slots: ['cpu', 'gpu'],
  evaluate: (selection) => {
    const cpu = selection.cpu;
    const gpu = selection.gpu;
    if (!cpu || !gpu) return null;

    const cpuIndex = cpu.specs.perfIndex;
    const gpuIndex = gpu.specs.perfIndex;
    if (!cpuIndex || !gpuIndex) return null;

    const reading = readBottleneck(cpuIndex, gpuIndex);
    if (!reading.marked) return ok('Processeur et carte graphique équilibrés.');

    return warning(bottleneckMessage(reading, { cpu: cpu.label, gpu: gpu.label }));
  },
};

/** A build that cannot display anything is almost always a mistake. */
export const displayOutputRule: Rule = {
  id: 'display-output',
  label: 'Sortie vidéo disponible',
  slots: ['cpu', 'gpu'],
  // Fires on an absence, not on a conflict: reported on the build, never used
  // to grey out a processor that simply has no IGP.
  buildOnly: true,
  evaluate: (selection) => {
    const cpu = selection.cpu;
    if (!cpu) return null;

    if (selection.gpu) return ok('Sortie vidéo assurée par la carte graphique.');
    if (cpu.specs.integratedGraphics) return ok('Sortie vidéo assurée par l’IGP du processeur.');

    return warning(
      `aucun affichage possible : le ${cpu.label} n’a pas d’IGP et aucune carte graphique n’est sélectionnée`,
    );
  },
};
