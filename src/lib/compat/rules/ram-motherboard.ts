import { blocking, ok, warning, type Rule } from '../types';
import { sum } from './helpers';

export const ramTypeRule: Rule = {
  id: 'ram-motherboard-type',
  label: 'Type de mémoire',
  slots: ['ram', 'motherboard'],
  evaluate: (selection) => {
    const motherboard = selection.motherboard;
    if (!motherboard || selection.ram.length === 0) return null;

    const expected = motherboard.specs.ramType;
    const wrong = selection.ram.find((kit) => kit.specs.ramType !== expected);

    if (!wrong) return ok(`Mémoire ${expected} conforme à la carte mère.`);
    return blocking(`mémoire ${wrong.specs.ramType} ≠ ${expected} attendu par la carte mère`);
  },
};

export const ramSlotsRule: Rule = {
  id: 'ram-motherboard-slots',
  label: 'Nombre de barrettes',
  slots: ['ram', 'motherboard'],
  evaluate: (selection) => {
    const motherboard = selection.motherboard;
    if (!motherboard || selection.ram.length === 0) return null;

    const sticks = sum(selection.ram.map((kit) => kit.specs.sticks));
    const slots = motherboard.specs.ramSlots;

    if (sticks <= slots) return ok(`${sticks} barrette(s) pour ${slots} slot(s).`);
    return blocking(`${sticks} barrettes pour ${slots} slots sur la carte mère`);
  },
};

export const ramCapacityRule: Rule = {
  id: 'ram-motherboard-capacity',
  label: 'Capacité mémoire maximale',
  slots: ['ram', 'motherboard'],
  evaluate: (selection) => {
    const motherboard = selection.motherboard;
    if (!motherboard || selection.ram.length === 0) return null;

    const total = sum(selection.ram.map((kit) => kit.specs.capacityPerStickGb * kit.specs.sticks));
    const max = motherboard.specs.maxRamGb;

    if (total <= max) return ok(`${total} Go pour un maximum de ${max} Go.`);
    return blocking(`${total} Go de mémoire pour un maximum de ${max} Go supporté`);
  },
};

/**
 * Above the board's rated frequency the kit simply runs slower, so this is an
 * advisory: it must never remove a usable kit from the list.
 */
export const ramSpeedRule: Rule = {
  id: 'ram-motherboard-speed',
  label: 'Fréquence mémoire',
  slots: ['ram', 'motherboard'],
  evaluate: (selection) => {
    const motherboard = selection.motherboard;
    if (!motherboard || selection.ram.length === 0) return null;

    const max = motherboard.specs.maxRamSpeedMhz;
    if (!max) return null;

    const fastest = Math.max(...selection.ram.map((kit) => kit.specs.speedMhz));
    if (fastest <= max) return ok(`${fastest} MHz dans la limite de ${max} MHz.`);

    return warning(
      `mémoire à ${fastest} MHz au-dessus des ${max} MHz supportés — elle fonctionnera bridée`,
    );
  },
};
