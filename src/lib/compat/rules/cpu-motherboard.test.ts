import { describe, expect, it } from 'vitest';
import { cpu, motherboard, selection } from '../fixtures';
import { cpuMotherboardChipsetRule, cpuMotherboardSocketRule } from './cpu-motherboard';

describe('cpuMotherboardSocketRule', () => {
  it('does not apply while one of the two parts is missing', () => {
    expect(cpuMotherboardSocketRule.evaluate(selection({ cpu: cpu() }))).toBeNull();
    expect(
      cpuMotherboardSocketRule.evaluate(selection({ motherboard: motherboard() })),
    ).toBeNull();
  });

  it('accepts identical sockets', () => {
    const result = cpuMotherboardSocketRule.evaluate(
      selection({ cpu: cpu({ socket: 'AM4' }), motherboard: motherboard({ socket: 'AM4' }) }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks different sockets and names both in the message', () => {
    const result = cpuMotherboardSocketRule.evaluate(
      selection({
        cpu: cpu({ socket: 'AM4' }),
        motherboard: motherboard({ socket: 'LGA1700', chipset: 'B660', ramType: 'DDR4' }),
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('AM4');
    expect(result?.raison).toContain('LGA1700');
  });

  it('treats LGA1151 and LGA1151-v2 as different sockets', () => {
    const result = cpuMotherboardSocketRule.evaluate(
      selection({
        cpu: cpu({ socket: 'LGA1151' }),
        motherboard: motherboard({ socket: 'LGA1151-v2', chipset: 'Z390' }),
      }),
    );
    expect(result?.compatible).toBe(false);
  });

  it('ignores case and spacing when comparing sockets', () => {
    const result = cpuMotherboardSocketRule.evaluate(
      selection({
        cpu: cpu({ socket: 'am4' }),
        motherboard: motherboard({ socket: 'AM4 ' }),
      }),
    );
    expect(result?.compatible).toBe(true);
  });
});

describe('cpuMotherboardChipsetRule', () => {
  it('accepts a chipset listed by the CPU', () => {
    const result = cpuMotherboardChipsetRule.evaluate(
      selection({
        cpu: cpu({ supportedChipsets: ['B450', 'B550', 'X570'] }),
        motherboard: motherboard({ chipset: 'B550' }),
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('warns rather than blocks on an unlisted chipset, since a BIOS update often fixes it', () => {
    const result = cpuMotherboardChipsetRule.evaluate(
      selection({
        cpu: cpu({ supportedChipsets: ['B550', 'X570'] }),
        motherboard: motherboard({ chipset: 'A320' }),
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'avertissement' });
    expect(result?.raison).toContain('A320');
  });

  it('stays silent when the CPU lists no chipset, the socket check being enough', () => {
    const result = cpuMotherboardChipsetRule.evaluate(
      selection({
        cpu: cpu({ supportedChipsets: undefined }),
        motherboard: motherboard({ chipset: 'A320' }),
      }),
    );
    expect(result).toBeNull();
  });

  it('compares chipsets case-insensitively', () => {
    const result = cpuMotherboardChipsetRule.evaluate(
      selection({
        cpu: cpu({ supportedChipsets: ['b550'] }),
        motherboard: motherboard({ chipset: 'B550' }),
      }),
    );
    expect(result?.compatible).toBe(true);
  });
});
