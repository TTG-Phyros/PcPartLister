import { describe, expect, it } from 'vitest';
import { aioCooler, airCooler, caseFan, cpu, selection } from '../fixtures';
import { coolerCpuSocketRule, coolerCpuTdpRule } from './cooling-cpu';

describe('coolerCpuSocketRule', () => {
  it('does not apply without a CPU or without a cooler', () => {
    expect(coolerCpuSocketRule.evaluate(selection({ cpu: cpu() }))).toBeNull();
    expect(coolerCpuSocketRule.evaluate(selection({ cooling: [airCooler()] }))).toBeNull();
  });

  it('accepts a cooler that lists the CPU socket', () => {
    const result = coolerCpuSocketRule.evaluate(
      selection({
        cpu: cpu({ socket: 'LGA1700' }),
        cooling: [airCooler({ supportedSockets: ['AM4', 'LGA1700'] })],
      }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('blocks a cooler that does not list the socket', () => {
    const result = coolerCpuSocketRule.evaluate(
      selection({
        cpu: cpu({ socket: 'AM5' }),
        cooling: [airCooler({ supportedSockets: ['LGA1151', 'LGA1200'] })],
      }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'bloquant' });
    expect(result?.raison).toContain('AM5');
  });

  it('ignores case fans, which mount on no socket', () => {
    const result = coolerCpuSocketRule.evaluate(
      selection({ cpu: cpu({ socket: 'AM5' }), cooling: [caseFan()] }),
    );
    expect(result).toBeNull();
  });

  it('compares sockets case-insensitively', () => {
    const result = coolerCpuSocketRule.evaluate(
      selection({
        cpu: cpu({ socket: 'AM4' }),
        cooling: [airCooler({ supportedSockets: ['am4'] })],
      }),
    );
    expect(result?.compatible).toBe(true);
  });
});

describe('coolerCpuTdpRule', () => {
  it('accepts a cooler rated above the CPU TDP', () => {
    const result = coolerCpuTdpRule.evaluate(
      selection({ cpu: cpu({ tdpW: 65 }), cooling: [airCooler({ maxTdpW: 150 })] }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('warns without blocking when the cooler is rated below the CPU TDP', () => {
    const result = coolerCpuTdpRule.evaluate(
      selection({ cpu: cpu({ tdpW: 125 }), cooling: [aioCooler({ maxTdpW: 95 })] }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'avertissement' });
    expect(result?.raison).toContain('125');
    expect(result?.raison).toContain('95');
  });

  it('stays silent when the cooler declares no rating', () => {
    const result = coolerCpuTdpRule.evaluate(
      selection({ cpu: cpu({ tdpW: 125 }), cooling: [airCooler({ maxTdpW: undefined })] }),
    );
    expect(result).toBeNull();
  });

  it('keeps the best cooler when several are selected', () => {
    const result = coolerCpuTdpRule.evaluate(
      selection({
        cpu: cpu({ tdpW: 125 }),
        cooling: [airCooler({ maxTdpW: 95 }), aioCooler({ maxTdpW: 250 })],
      }),
    );
    expect(result?.compatible).toBe(true);
  });
});
