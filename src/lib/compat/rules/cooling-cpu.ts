import { normalizeSocket } from '@/lib/specs';
import { blocking, ok, warning, type Rule } from '../types';
import { cpuCoolers } from './helpers';

export const coolerCpuSocketRule: Rule = {
  id: 'cooler-cpu-socket',
  label: 'Socket supporté par le refroidissement',
  slots: ['cooling', 'cpu'],
  evaluate: (selection) => {
    const cpu = selection.cpu;
    if (!cpu) return null;

    const coolers = cpuCoolers(selection).filter(
      (cooler) => cooler.specs.supportedSockets.length > 0,
    );
    if (coolers.length === 0) return null;

    const socket = normalizeSocket(cpu.specs.socket);
    const incompatible = coolers.find(
      (cooler) => !cooler.specs.supportedSockets.some((s) => normalizeSocket(s) === socket),
    );

    if (!incompatible) return ok(`Socket ${cpu.specs.socket} supporté par le refroidissement.`);
    return blocking(`${incompatible.label} ne supporte pas le socket ${cpu.specs.socket}`);
  },
};

/**
 * Under-rated cooling is a noise and throttling problem, not an assembly
 * problem, so it warns rather than blocks.
 */
export const coolerCpuTdpRule: Rule = {
  id: 'cooler-cpu-tdp',
  label: 'Dissipation suffisante pour le processeur',
  slots: ['cooling', 'cpu'],
  evaluate: (selection) => {
    const cpu = selection.cpu;
    if (!cpu) return null;

    const rated = cpuCoolers(selection)
      .map((cooler) => cooler.specs.maxTdpW)
      .filter((value): value is number => typeof value === 'number');
    if (rated.length === 0) return null;

    // Several coolers selected: the build is cooled by the best of them.
    const best = Math.max(...rated);
    const tdp = cpu.specs.tdpW;

    if (best >= tdp) return ok(`Refroidissement noté ${best} W pour un TDP de ${tdp} W.`);
    return warning(
      `TDP processeur de ${tdp} W pour un refroidissement noté ${best} W — throttling probable en charge`,
    );
  },
};
