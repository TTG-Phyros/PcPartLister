import { describe, expect, it } from 'vitest';
import { motherboard, ram, selection } from '../fixtures';
import {
  ramCapacityRule,
  ramSlotsRule,
  ramSpeedRule,
  ramTypeRule,
} from './ram-motherboard';

describe('ramTypeRule', () => {
  it('does not apply without RAM or without a motherboard', () => {
    expect(ramTypeRule.evaluate(selection({ motherboard: motherboard() }))).toBeNull();
    expect(ramTypeRule.evaluate(selection({ ram: [ram()] }))).toBeNull();
  });

  it('accepts matching memory types', () => {
    const result = ramTypeRule.evaluate(
      selection({
        motherboard: motherboard({ ramType: 'DDR4' }),
        ram: [ram({ ramType: 'DDR4' })],
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks DDR5 memory on a DDR4 motherboard', () => {
    const result = ramTypeRule.evaluate(
      selection({
        motherboard: motherboard({ ramType: 'DDR4' }),
        ram: [ram({ ramType: 'DDR5' })],
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('DDR5');
    expect(result?.raison).toContain('DDR4');
  });

  it('blocks as soon as one kit among several has the wrong type', () => {
    const result = ramTypeRule.evaluate(
      selection({
        motherboard: motherboard({ ramType: 'DDR4' }),
        ram: [ram({ ramType: 'DDR4' }), ram({ ramType: 'DDR3' })],
      }),
    );
    expect(result?.compatible).toBe(false);
  });
});

describe('ramSlotsRule', () => {
  it('accepts a total number of sticks equal to the slot count', () => {
    const result = ramSlotsRule.evaluate(
      selection({
        motherboard: motherboard({ ramSlots: 4 }),
        ram: [ram({ sticks: 2 }), ram({ sticks: 2 })],
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks when the kits need more sticks than there are slots', () => {
    const result = ramSlotsRule.evaluate(
      selection({
        motherboard: motherboard({ ramSlots: 2 }),
        ram: [ram({ sticks: 2 }), ram({ sticks: 2 })],
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('4');
    expect(result?.raison).toContain('2');
  });
});

describe('ramCapacityRule', () => {
  it('accepts a total within the supported maximum', () => {
    const result = ramCapacityRule.evaluate(
      selection({
        motherboard: motherboard({ maxRamGb: 64 }),
        ram: [ram({ capacityPerStickGb: 16, sticks: 2 })],
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks a total above the supported maximum, summing every kit', () => {
    const result = ramCapacityRule.evaluate(
      selection({
        motherboard: motherboard({ maxRamGb: 32 }),
        ram: [ram({ capacityPerStickGb: 16, sticks: 2 }), ram({ capacityPerStickGb: 8, sticks: 2 })],
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('48');
  });
});

describe('ramSpeedRule', () => {
  it('stays silent when the motherboard declares no maximum frequency', () => {
    const result = ramSpeedRule.evaluate(
      selection({
        motherboard: motherboard({ maxRamSpeedMhz: undefined }),
        ram: [ram({ speedMhz: 4000 })],
      }),
    );
    expect(result).toBeNull();
  });

  it('accepts a frequency within the supported maximum', () => {
    const result = ramSpeedRule.evaluate(
      selection({
        motherboard: motherboard({ maxRamSpeedMhz: 3600 }),
        ram: [ram({ speedMhz: 3200 })],
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('warns without blocking above the maximum: the kit still runs downclocked', () => {
    const result = ramSpeedRule.evaluate(
      selection({
        motherboard: motherboard({ maxRamSpeedMhz: 3200 }),
        ram: [ram({ speedMhz: 4000 })],
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'avertissement' });
    expect(result?.raison).toContain('4000');
    expect(result?.raison).toContain('3200');
  });
});
