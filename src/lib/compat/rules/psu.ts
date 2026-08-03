import { blocking, ok, warning, type Rule } from '../types';
import { joinFr } from './helpers';

/** Headroom the specification asks for on top of the CPU and GPU draw. */
export const PSU_MARGIN_W = 100;
/** Below this ratio above the floor, the supply is flagged as tight. */
const COMFORT_RATIO = 1.2;
/** 8-pin connectors an adapter needs to feed one 12VHPWR plug. */
const ADAPTER_8PIN_PER_12VHPWR = 3;

export const psuWattageRule: Rule = {
  id: 'psu-wattage',
  label: 'Puissance de l’alimentation',
  slots: ['psu', 'cpu', 'gpu'],
  evaluate: (selection) => {
    const psu = selection.psu;
    if (!psu) return null;

    const cpuTdp = selection.cpu?.specs.tdpW ?? 0;
    const gpuTdp = selection.gpu?.specs.tdpW ?? 0;
    const required = cpuTdp + gpuTdp + PSU_MARGIN_W;
    const available = psu.specs.wattage;

    if (available < required) {
      return blocking(
        `${required} W nécessaires (CPU ${cpuTdp} W + GPU ${gpuTdp} W + ${PSU_MARGIN_W} W de marge) pour ${available} W disponibles`,
      );
    }

    if (available < required * COMFORT_RATIO) {
      return warning(
        `alimentation de ${available} W juste au-dessus des ${required} W nécessaires — peu de marge`,
      );
    }

    return ok(`${available} W pour ${required} W nécessaires.`);
  },
};

export const psuCaseFormFactorRule: Rule = {
  id: 'psu-case-format',
  label: 'Format d’alimentation accepté par le boîtier',
  slots: ['psu', 'case'],
  evaluate: (selection) => {
    const psu = selection.psu;
    const pcCase = selection.case;
    if (!psu || !pcCase) return null;

    const format = psu.specs.formFactor;
    const supported = pcCase.specs.psuFormFactors;

    if (supported.includes(format)) return ok(`Alimentation ${format} acceptée par le boîtier.`);
    return blocking(
      `alimentation ${format} — le boîtier n’accepte que ${joinFr([...supported])}`,
    );
  },
};

/**
 * Counts PCIe connectors the way cables actually work: a 6+2 pin lead covers a
 * 6-pin need, and a 12VHPWR plug can be fed by an adapter from three 8-pin leads.
 */
export const psuGpuConnectorsRule: Rule = {
  id: 'psu-gpu-connectors',
  label: 'Connecteurs PCIe pour la carte graphique',
  slots: ['psu', 'gpu'],
  evaluate: (selection) => {
    const psu = selection.psu;
    const gpu = selection.gpu;
    if (!psu || !gpu) return null;

    const need = gpu.specs.powerConnectors;
    if (need.pcie6pin === 0 && need.pcie8pin === 0 && need.pcie12vhpwr === 0) return null;

    const have = psu.specs.pcieConnectors;
    let spare8 = have.pcie8pin;
    let spare6 = have.pcie6pin;

    // 8-pin needs can only be met by 8-pin leads.
    if (need.pcie8pin > spare8) {
      return blocking(
        `${need.pcie8pin} connecteur(s) PCIe 8 broches requis, ${spare8} disponible(s) sur l’alimentation`,
      );
    }
    spare8 -= need.pcie8pin;

    // A 6-pin need is covered by a 6-pin lead or by the 6 pins of a spare 6+2.
    if (need.pcie6pin > spare6 + spare8) {
      return blocking(
        `${need.pcie6pin} connecteur(s) PCIe 6 broches requis, ${spare6 + spare8} disponible(s)`,
      );
    }
    const from6 = Math.min(need.pcie6pin, spare6);
    spare6 -= from6;
    spare8 -= need.pcie6pin - from6;

    if (need.pcie12vhpwr > 0) {
      if (have.pcie12vhpwr >= need.pcie12vhpwr) {
        return ok('Connecteur 12VHPWR natif disponible.');
      }
      const needed8 = need.pcie12vhpwr * ADAPTER_8PIN_PER_12VHPWR;
      if (spare8 >= needed8) {
        return warning(
          `pas de 12VHPWR natif — alimentation via un adaptateur depuis ${needed8} connecteurs 8 broches`,
        );
      }
      return blocking(
        `12VHPWR requis : ni connecteur natif, ni ${needed8} connecteurs 8 broches libres pour un adaptateur`,
      );
    }

    return ok('Connecteurs PCIe suffisants.');
  },
};
