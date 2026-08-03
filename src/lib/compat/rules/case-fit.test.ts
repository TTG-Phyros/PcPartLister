import { describe, expect, it } from 'vitest';
import { aioCooler, airCooler, caseFan, gpu, motherboard, pcCase, psu, selection } from '../fixtures';
import { motherboardCaseFormFactorRule } from './motherboard-case';
import { gpuCaseLengthRule } from './gpu-case';
import { aioRadiatorCaseRule, coolerCaseHeightRule } from './cooling-case';
import { psuCaseFormFactorRule } from './psu';

describe('motherboardCaseFormFactorRule', () => {
  it('accepts a format the case supports', () => {
    const result = motherboardCaseFormFactorRule.evaluate(
      selection({
        motherboard: motherboard({ formFactor: 'mATX' }),
        case: pcCase({ supportedFormFactors: ['ATX', 'mATX', 'ITX'] }),
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks an ATX board in an ITX-only case', () => {
    const result = motherboardCaseFormFactorRule.evaluate(
      selection({
        motherboard: motherboard({ formFactor: 'ATX' }),
        case: pcCase({ supportedFormFactors: ['ITX'] }),
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('ATX');
    expect(result?.raison).toContain('ITX');
  });
});

describe('gpuCaseLengthRule', () => {
  it('accepts a card exactly at the limit', () => {
    const result = gpuCaseLengthRule.evaluate(
      selection({ gpu: gpu({ lengthMm: 360 }), case: pcCase({ maxGpuLengthMm: 360 }) }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks a card longer than the case allows', () => {
    const result = gpuCaseLengthRule.evaluate(
      selection({ gpu: gpu({ lengthMm: 324 }), case: pcCase({ maxGpuLengthMm: 310 }) }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('324');
    expect(result?.raison).toContain('310');
  });
});

describe('coolerCaseHeightRule', () => {
  it('accepts an air cooler shorter than the limit', () => {
    const result = coolerCaseHeightRule.evaluate(
      selection({
        cooling: [airCooler({ heightMm: 159 })],
        case: pcCase({ maxCoolerHeightMm: 170 }),
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks a tower taller than the case allows', () => {
    const result = coolerCaseHeightRule.evaluate(
      selection({
        cooling: [airCooler({ heightMm: 165 })],
        case: pcCase({ maxCoolerHeightMm: 155 }),
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('165');
  });

  it('ignores case fans, which have no height constraint', () => {
    const result = coolerCaseHeightRule.evaluate(
      selection({ cooling: [caseFan()], case: pcCase({ maxCoolerHeightMm: 50 }) }),
    );
    expect(result).toBeNull();
  });
});

describe('aioRadiatorCaseRule', () => {
  it('accepts a radiator size the case lists', () => {
    const result = aioRadiatorCaseRule.evaluate(
      selection({
        cooling: [aioCooler({ radiatorSizeMm: 240 })],
        case: pcCase({ radiatorSupportMm: [120, 240] }),
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks a radiator the case cannot host', () => {
    const result = aioRadiatorCaseRule.evaluate(
      selection({
        cooling: [aioCooler({ radiatorSizeMm: 360 })],
        case: pcCase({ radiatorSupportMm: [120, 240] }),
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('360');
  });

  it('blocks any AIO in a case that supports no radiator at all', () => {
    const result = aioRadiatorCaseRule.evaluate(
      selection({
        cooling: [aioCooler({ radiatorSizeMm: 240 })],
        case: pcCase({ radiatorSupportMm: [] }),
      }),
    );
    expect(result?.compatible).toBe(false);
  });

  it('ignores air coolers', () => {
    const result = aioRadiatorCaseRule.evaluate(
      selection({ cooling: [airCooler()], case: pcCase({ radiatorSupportMm: [] }) }),
    );
    expect(result).toBeNull();
  });
});

describe('psuCaseFormFactorRule', () => {
  it('accepts an ATX supply in a case that takes ATX', () => {
    const result = psuCaseFormFactorRule.evaluate(
      selection({ psu: psu({ formFactor: 'ATX' }), case: pcCase({ psuFormFactors: ['ATX'] }) }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks an ATX supply in an SFX-only case', () => {
    const result = psuCaseFormFactorRule.evaluate(
      selection({
        psu: psu({ formFactor: 'ATX' }),
        case: pcCase({ psuFormFactors: ['SFX', 'SFX-L'] }),
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('SFX');
  });
});
