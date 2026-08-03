import { normalizeSocket } from '@/lib/specs';
import { blocking, ok, warning, type Rule } from '../types';

export const cpuMotherboardSocketRule: Rule = {
  id: 'cpu-motherboard-socket',
  label: 'Socket processeur / carte mère',
  slots: ['cpu', 'motherboard'],
  evaluate: (selection) => {
    const cpu = selection.cpu;
    const motherboard = selection.motherboard;
    if (!cpu || !motherboard) return null;

    const cpuSocket = normalizeSocket(cpu.specs.socket);
    const boardSocket = normalizeSocket(motherboard.specs.socket);

    if (cpuSocket === boardSocket) {
      return ok(`Socket ${cpu.specs.socket} commun au processeur et à la carte mère.`);
    }
    return blocking(`socket ${cpu.specs.socket} ≠ ${motherboard.specs.socket}`);
  },
};

/**
 * A chipset the CPU does not list is usually a BIOS update away from working
 * (B450 with a Ryzen 5000, for instance), so this warns instead of blocking.
 * The socket rule above already catches the truly impossible pairings.
 */
export const cpuMotherboardChipsetRule: Rule = {
  id: 'cpu-motherboard-chipset',
  label: 'Chipset compatible avec le processeur',
  slots: ['cpu', 'motherboard'],
  evaluate: (selection) => {
    const cpu = selection.cpu;
    const motherboard = selection.motherboard;
    if (!cpu || !motherboard) return null;

    const supported = cpu.specs.supportedChipsets;
    if (!supported || supported.length === 0) return null;

    const chipset = motherboard.specs.chipset.trim().toLowerCase();
    const listed = supported.some((value) => value.trim().toLowerCase() === chipset);

    if (listed) {
      return ok(`Chipset ${motherboard.specs.chipset} supporté par le ${cpu.label}.`);
    }
    return warning(
      `chipset ${motherboard.specs.chipset} non listé pour ce processeur — mise à jour du BIOS probablement nécessaire`,
    );
  },
};
