import type { Rule } from './types';
import { cpuGpuBottleneckRule, displayOutputRule } from './rules/advisory';
import { aioRadiatorCaseRule, coolerCaseHeightRule } from './rules/cooling-case';
import { coolerCpuSocketRule, coolerCpuTdpRule } from './rules/cooling-cpu';
import { cpuMotherboardChipsetRule, cpuMotherboardSocketRule } from './rules/cpu-motherboard';
import { gpuCaseLengthRule } from './rules/gpu-case';
import { motherboardCaseFormFactorRule } from './rules/motherboard-case';
import { psuCaseFormFactorRule, psuGpuConnectorsRule, psuWattageRule } from './rules/psu';
import {
  ramCapacityRule,
  ramSlotsRule,
  ramSpeedRule,
  ramTypeRule,
} from './rules/ram-motherboard';
import { storageM2SlotsRule, storageSataPortsRule } from './rules/storage-motherboard';

/**
 * The complete rule set. Adding a rule means writing one file under rules/ and
 * adding one line here — no UI code is involved, the configurator reads this
 * list and nothing else.
 *
 * Order only affects the order messages are displayed in.
 */
export const RULES: Rule[] = [
  cpuMotherboardSocketRule,
  cpuMotherboardChipsetRule,
  ramTypeRule,
  ramSlotsRule,
  ramCapacityRule,
  ramSpeedRule,
  motherboardCaseFormFactorRule,
  gpuCaseLengthRule,
  coolerCaseHeightRule,
  aioRadiatorCaseRule,
  coolerCpuSocketRule,
  coolerCpuTdpRule,
  psuWattageRule,
  psuCaseFormFactorRule,
  psuGpuConnectorsRule,
  storageSataPortsRule,
  storageM2SlotsRule,
  cpuGpuBottleneckRule,
  displayOutputRule,
];
