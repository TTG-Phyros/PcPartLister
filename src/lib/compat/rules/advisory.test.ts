import { describe, expect, it } from 'vitest';
import { cpu, gpu, selection } from '../fixtures';
import { cpuGpuBottleneckRule, displayOutputRule } from './advisory';

describe('cpuGpuBottleneckRule', () => {
  it('does not apply without both a CPU and a GPU', () => {
    expect(cpuGpuBottleneckRule.evaluate(selection({ cpu: cpu() }))).toBeNull();
    expect(cpuGpuBottleneckRule.evaluate(selection({ gpu: gpu() }))).toBeNull();
  });

  it('stays silent when either part has no performance index', () => {
    const result = cpuGpuBottleneckRule.evaluate(
      selection({ cpu: cpu({ perfIndex: undefined }), gpu: gpu({ perfIndex: 100 }) }),
    );
    expect(result).toBeNull();
  });

  it('accepts a balanced pairing', () => {
    const result = cpuGpuBottleneckRule.evaluate(
      selection({ cpu: cpu({ perfIndex: 100 }), gpu: gpu({ perfIndex: 100 }) }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('warns when the CPU is far weaker than the graphics card', () => {
    const result = cpuGpuBottleneckRule.evaluate(
      selection({ cpu: cpu({ perfIndex: 45 }), gpu: gpu({ perfIndex: 175 }) }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'avertissement' });
    expect(result?.raison.toLowerCase()).toContain('processeur');
  });

  it('warns when the graphics card is far weaker than the CPU', () => {
    const result = cpuGpuBottleneckRule.evaluate(
      selection({ cpu: cpu({ perfIndex: 175 }), gpu: gpu({ perfIndex: 45 }) }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'avertissement' });
    expect(result?.raison.toLowerCase()).toContain('carte graphique');
  });

  it('never blocks: a bottleneck is an opinion, not an incompatibility', () => {
    const result = cpuGpuBottleneckRule.evaluate(
      selection({ cpu: cpu({ perfIndex: 20 }), gpu: gpu({ perfIndex: 200 }) }),
    );
    expect(result?.severite).toBe('avertissement');
  });
});

describe('displayOutputRule', () => {
  it('does not apply while no CPU is chosen', () => {
    expect(displayOutputRule.evaluate(selection({ gpu: gpu() }))).toBeNull();
  });

  it('accepts a CPU without integrated graphics paired with a card', () => {
    const result = displayOutputRule.evaluate(
      selection({ cpu: cpu({ integratedGraphics: false }), gpu: gpu() }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('accepts a CPU with integrated graphics and no card', () => {
    const result = displayOutputRule.evaluate(
      selection({ cpu: cpu({ integratedGraphics: true }) }),
    );
    expect(result?.compatible).toBe(true);
  });

  it('warns when nothing in the build can drive a display', () => {
    const result = displayOutputRule.evaluate(
      selection({ cpu: cpu({ integratedGraphics: false }) }),
    );
    expect(result).toMatchObject({ compatible: false, severite: 'avertissement' });
    expect(result?.raison.toLowerCase()).toContain('affichage');
  });
});
