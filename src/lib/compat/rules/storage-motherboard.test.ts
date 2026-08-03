import { describe, expect, it } from 'vitest';
import { motherboard, nvmeDrive, sataDrive, selection } from '../fixtures';
import { storageM2SlotsRule, storageSataPortsRule } from './storage-motherboard';

describe('storageSataPortsRule', () => {
  it('does not apply without drives', () => {
    expect(storageSataPortsRule.evaluate(selection({ motherboard: motherboard() }))).toBeNull();
  });

  it('accepts as many SATA drives as there are ports', () => {
    const result = storageSataPortsRule.evaluate(
      selection({
        motherboard: motherboard({ sataPorts: 2 }),
        storage: [sataDrive(), sataDrive()],
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks more SATA drives than ports and ignores NVMe drives in the count', () => {
    const result = storageSataPortsRule.evaluate(
      selection({
        motherboard: motherboard({ sataPorts: 2 }),
        storage: [sataDrive(), sataDrive(), sataDrive(), nvmeDrive()],
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('3');
    expect(result?.raison).toContain('2');
  });

  it('blocks a SATA drive on a board with no SATA port at all', () => {
    const result = storageSataPortsRule.evaluate(
      selection({ motherboard: motherboard({ sataPorts: 0 }), storage: [sataDrive()] }),
    );
    expect(result?.compatible).toBe(false);
  });
});

describe('storageM2SlotsRule', () => {
  it('accepts as many NVMe drives as there are M.2 slots', () => {
    const result = storageM2SlotsRule.evaluate(
      selection({
        motherboard: motherboard({ m2Slots: 2 }),
        storage: [nvmeDrive(), nvmeDrive()],
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks more NVMe drives than M.2 slots', () => {
    const result = storageM2SlotsRule.evaluate(
      selection({
        motherboard: motherboard({ m2Slots: 1 }),
        storage: [nvmeDrive(), nvmeDrive(), sataDrive()],
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('2');
    expect(result?.raison).toContain('1');
  });
});
