import { blocking, ok, type Rule } from '../types';

export const storageSataPortsRule: Rule = {
  id: 'storage-motherboard-sata',
  label: 'Ports SATA disponibles',
  slots: ['storage', 'motherboard'],
  evaluate: (selection) => {
    const motherboard = selection.motherboard;
    if (!motherboard || selection.storage.length === 0) return null;

    const drives = selection.storage.filter((d) => d.specs.storageType === 'SATA').length;
    if (drives === 0) return null;

    const ports = motherboard.specs.sataPorts;
    if (drives <= ports) return ok(`${drives} disque(s) SATA pour ${ports} port(s).`);
    return blocking(`${drives} disques SATA pour ${ports} port(s) sur la carte mère`);
  },
};

export const storageM2SlotsRule: Rule = {
  id: 'storage-motherboard-m2',
  label: 'Slots M.2 disponibles',
  slots: ['storage', 'motherboard'],
  evaluate: (selection) => {
    const motherboard = selection.motherboard;
    if (!motherboard || selection.storage.length === 0) return null;

    const drives = selection.storage.filter((d) => d.specs.storageType === 'NVMe').length;
    if (drives === 0) return null;

    const slots = motherboard.specs.m2Slots;
    if (drives <= slots) return ok(`${drives} disque(s) NVMe pour ${slots} slot(s) M.2.`);
    return blocking(`${drives} disques NVMe pour ${slots} slot(s) M.2 sur la carte mère`);
  },
};
