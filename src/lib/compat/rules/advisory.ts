import { ok, warning, type Rule } from '../types';

/** Below this CPU/GPU index ratio, the processor holds the card back. */
const CPU_LIMITS_BELOW = 0.6;
/** Above it, the card is the one being wasted. */
const GPU_LIMITS_ABOVE = 1.7;

/**
 * Purely advisory: a bottleneck is a judgement call on a use case, never an
 * assembly problem, so it must never remove a part from the list.
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

    const ratio = cpuIndex / gpuIndex;

    if (ratio < CPU_LIMITS_BELOW) {
      return warning(
        `le processeur ${cpu.label} risque de brider la ${gpu.label} en jeu — goulot d’étranglement probable`,
      );
    }
    if (ratio > GPU_LIMITS_ABOVE) {
      return warning(
        `la carte graphique ${gpu.label} est nettement en retrait du processeur ${cpu.label} — le CPU sera sous-exploité`,
      );
    }

    return ok('Processeur et carte graphique équilibrés.');
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
