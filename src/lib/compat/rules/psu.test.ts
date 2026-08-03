import { describe, expect, it } from 'vitest';
import { cpu, gpu, psu, selection } from '../fixtures';
import { psuGpuConnectorsRule, psuWattageRule } from './psu';

describe('psuWattageRule', () => {
  it('does not apply without a power supply', () => {
    expect(psuWattageRule.evaluate(selection({ cpu: cpu(), gpu: gpu() }))).toBeNull();
  });

  it('accepts a supply comfortably above CPU + GPU + 100 W', () => {
    // 65 + 170 + 100 = 335 W required, 650 W available.
    const result = psuWattageRule.evaluate(
      selection({ cpu: cpu({ tdpW: 65 }), gpu: gpu({ tdpW: 170 }), psu: psu({ wattage: 650 }) }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks a supply below the CPU + GPU + 100 W floor', () => {
    // 125 + 320 + 100 = 545 W required, 450 W available.
    const result = psuWattageRule.evaluate(
      selection({ cpu: cpu({ tdpW: 125 }), gpu: gpu({ tdpW: 320 }), psu: psu({ wattage: 450 }) }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('545');
    expect(result?.raison).toContain('450');
  });

  it('warns when the supply clears the floor but leaves under 20 % headroom', () => {
    // 65 + 170 + 100 = 335 W required; 350 W is above the floor but tight.
    const result = psuWattageRule.evaluate(
      selection({ cpu: cpu({ tdpW: 65 }), gpu: gpu({ tdpW: 170 }), psu: psu({ wattage: 350 }) }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'avertissement' });
  });

  it('counts only the CPU when the build has no graphics card', () => {
    // 65 + 100 = 165 W required.
    const result = psuWattageRule.evaluate(
      selection({ cpu: cpu({ tdpW: 65 }), psu: psu({ wattage: 400 }) }),
    );
    expect(result?.compatible).toBe(true);
  });
});

describe('psuGpuConnectorsRule', () => {
  it('does not apply without a graphics card', () => {
    expect(psuGpuConnectorsRule.evaluate(selection({ psu: psu() }))).toBeNull();
  });

  it('stays silent for a card powered by the PCIe slot alone', () => {
    const result = psuGpuConnectorsRule.evaluate(
      selection({
        gpu: gpu({ powerConnectors: { pcie6pin: 0, pcie8pin: 0, pcie12vhpwr: 0 } }),
        psu: psu({ pcieConnectors: { pcie6pin: 0, pcie8pin: 0, pcie12vhpwr: 0 } }),
      }),
    );
    expect(result).toBeNull();
  });

  it('accepts a supply with enough 8-pin connectors', () => {
    const result = psuGpuConnectorsRule.evaluate(
      selection({
        gpu: gpu({ powerConnectors: { pcie6pin: 0, pcie8pin: 2, pcie12vhpwr: 0 } }),
        psu: psu({ pcieConnectors: { pcie6pin: 0, pcie8pin: 4, pcie12vhpwr: 0 } }),
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks a supply short on 8-pin connectors', () => {
    const result = psuGpuConnectorsRule.evaluate(
      selection({
        gpu: gpu({ powerConnectors: { pcie6pin: 0, pcie8pin: 2, pcie12vhpwr: 0 } }),
        psu: psu({ pcieConnectors: { pcie6pin: 2, pcie8pin: 1, pcie12vhpwr: 0 } }),
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('8');
  });

  it('lets a spare 6+2 pin connector cover a 6-pin requirement', () => {
    const result = psuGpuConnectorsRule.evaluate(
      selection({
        gpu: gpu({ powerConnectors: { pcie6pin: 1, pcie8pin: 1, pcie12vhpwr: 0 } }),
        psu: psu({ pcieConnectors: { pcie6pin: 0, pcie8pin: 2, pcie12vhpwr: 0 } }),
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('accepts a native 12VHPWR connector', () => {
    const result = psuGpuConnectorsRule.evaluate(
      selection({
        gpu: gpu({ powerConnectors: { pcie6pin: 0, pcie8pin: 0, pcie12vhpwr: 1 } }),
        psu: psu({ pcieConnectors: { pcie6pin: 0, pcie8pin: 0, pcie12vhpwr: 1 } }),
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('warns when 12VHPWR has to be fed by an adapter from three 8-pin connectors', () => {
    const result = psuGpuConnectorsRule.evaluate(
      selection({
        gpu: gpu({ powerConnectors: { pcie6pin: 0, pcie8pin: 0, pcie12vhpwr: 1 } }),
        psu: psu({ pcieConnectors: { pcie6pin: 0, pcie8pin: 4, pcie12vhpwr: 0 } }),
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'avertissement' });
    expect(result?.raison).toContain('adaptateur');
  });

  it('blocks 12VHPWR when there are not even enough 8-pin connectors for an adapter', () => {
    const result = psuGpuConnectorsRule.evaluate(
      selection({
        gpu: gpu({ powerConnectors: { pcie6pin: 0, pcie8pin: 0, pcie12vhpwr: 1 } }),
        psu: psu({ pcieConnectors: { pcie6pin: 0, pcie8pin: 2, pcie12vhpwr: 0 } }),
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
  });
});
