import { describe, expect, it } from 'vitest';
import {
  aioCooler,
  airCooler,
  cpu,
  gpu,
  motherboard,
  nvmeDrive,
  pcCase,
  psu,
  ram,
  selection,
} from './fixtures';
import { blockingIssues, checkCandidate, evaluate, warnings } from './engine';
import { RULES } from './registry';

describe('registry', () => {
  it('exposes unique rule identifiers', () => {
    const ids = RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares the slots every rule reads, so the UI can attribute its verdicts', () => {
    for (const rule of RULES) {
      expect(rule.slots.length, `rule ${rule.id} declares no slot`).toBeGreaterThan(0);
      expect(rule.label.length, `rule ${rule.id} has no label`).toBeGreaterThan(0);
    }
  });
});

/** A build where everything fits, used as the baseline of the engine tests. */
function coherentBuild() {
  return selection({
    cpu: cpu({ socket: 'AM4', tdpW: 65, supportedChipsets: ['B550'], perfIndex: 100 }),
    motherboard: motherboard({ socket: 'AM4', chipset: 'B550', formFactor: 'ATX' }),
    gpu: gpu({ lengthMm: 242, tdpW: 170, perfIndex: 100 }),
    psu: psu({ wattage: 650, formFactor: 'ATX' }),
    case: pcCase(),
    ram: [ram({ ramType: 'DDR4', sticks: 2, speedMhz: 3200 })],
    storage: [nvmeDrive()],
    cooling: [airCooler({ heightMm: 159, maxTdpW: 150 })],
  });
}

describe('evaluate', () => {
  it('reports no blocking issue on a coherent build', () => {
    const results = evaluate(coherentBuild());
    expect(blockingIssues(results)).toEqual([]);
  });

  it('returns nothing at all on an empty selection', () => {
    expect(evaluate(selection())).toEqual([]);
  });

  it('lists every broken rule by identifier', () => {
    const broken = selection({
      cpu: cpu({ socket: 'AM4' }),
      motherboard: motherboard({ socket: 'LGA1700', chipset: 'B660', formFactor: 'ATX' }),
      case: pcCase({ supportedFormFactors: ['ITX'] }),
      gpu: gpu({ lengthMm: 400 }),
    });

    const ids = blockingIssues(evaluate(broken)).map((issue) => issue.ruleId);
    expect(ids).toContain('cpu-motherboard-socket');
    expect(ids).toContain('motherboard-case-format');
    expect(ids).toContain('gpu-case-length');
  });

  it('separates warnings from blocking issues', () => {
    const build = selection({
      cpu: cpu({ socket: 'AM4', supportedChipsets: ['B550'], perfIndex: 45 }),
      motherboard: motherboard({ socket: 'AM4', chipset: 'A320' }),
      gpu: gpu({ perfIndex: 175 }),
      psu: psu({ wattage: 650 }),
    });

    const results = evaluate(build);
    expect(blockingIssues(results)).toEqual([]);

    const warned = warnings(results).map((issue) => issue.ruleId);
    expect(warned).toContain('cpu-motherboard-chipset');
    expect(warned).toContain('cpu-gpu-bottleneck');
  });
});

describe('checkCandidate', () => {
  it('accepts a CPU matching the chosen motherboard', () => {
    const current = selection({ motherboard: motherboard({ socket: 'AM4', chipset: 'B550' }) });
    const verdict = checkCandidate(current, 'cpu', cpu({ socket: 'AM4' }));
    expect(verdict.compatible).toBe(true);
    expect(verdict.reason).toBeUndefined();
  });

  it('rejects a CPU whose socket differs, and explains why', () => {
    const current = selection({ motherboard: motherboard({ socket: 'LGA1700', chipset: 'B660' }) });
    const verdict = checkCandidate(current, 'cpu', cpu({ socket: 'AM4' }));
    expect(verdict.compatible).toBe(false);
    expect(verdict.reason).toContain('AM4');
    expect(verdict.reason).toContain('LGA1700');
  });

  it('judges the candidate against the rest of the build, not against the part it replaces', () => {
    // An AM4 CPU is already selected; the candidate is judged on the board only.
    const current = selection({
      cpu: cpu({ socket: 'AM4' }),
      motherboard: motherboard({ socket: 'AM4', chipset: 'B550' }),
    });
    const verdict = checkCandidate(current, 'cpu', cpu({ socket: 'AM5' }));
    expect(verdict.compatible).toBe(false);
    expect(verdict.reason).toContain('AM5');
  });

  it('ignores a problem the build already has elsewhere', () => {
    // The graphics card does not fit the case, which says nothing about a CPU.
    const current = selection({
      motherboard: motherboard({ socket: 'AM4', chipset: 'B550' }),
      case: pcCase({ maxGpuLengthMm: 200 }),
      gpu: gpu({ lengthMm: 400 }),
    });
    const verdict = checkCandidate(current, 'cpu', cpu({ socket: 'AM4' }));
    expect(verdict.compatible).toBe(true);
  });

  it('adds rather than replaces in a multi-slot category', () => {
    const current = selection({
      motherboard: motherboard({ ramSlots: 4 }),
      ram: [ram({ sticks: 2 }), ram({ sticks: 2 })],
    });
    const verdict = checkCandidate(current, 'ram', ram({ sticks: 2 }));
    expect(verdict.compatible).toBe(false);
    expect(verdict.reason).toContain('6');
  });

  it('keeps a candidate selectable when it only raises a warning', () => {
    const current = selection({ motherboard: motherboard({ maxRamSpeedMhz: 3200 }) });
    const verdict = checkCandidate(current, 'ram', ram({ speedMhz: 4000 }));
    expect(verdict.compatible).toBe(true);
    expect(verdict.warnings).toHaveLength(1);
    expect(verdict.warnings[0]?.raison).toContain('4000');
  });

  it('never quotes a build-only rule: a half-assembled build misses plenty of things', () => {
    // The CPU has no IGP and no card is selected yet, which the build view
    // reports but which says nothing about this processor.
    const verdict = checkCandidate(selection(), 'cpu', cpu({ integratedGraphics: false }));
    expect(verdict.compatible).toBe(true);
    expect(verdict.warnings).toEqual([]);

    const onBuild = evaluate(selection({ cpu: cpu({ integratedGraphics: false }) }));
    expect(warnings(onBuild).map((issue) => issue.ruleId)).toContain('display-output');
  });

  it('accepts any candidate when nothing else is selected yet', () => {
    expect(checkCandidate(selection(), 'gpu', gpu({ lengthMm: 400 })).compatible).toBe(true);
    expect(checkCandidate(selection(), 'cooling', aioCooler()).compatible).toBe(true);
  });

  it('rejects a cooler taller than the chosen case', () => {
    const current = selection({ case: pcCase({ maxCoolerHeightMm: 155 }) });
    const verdict = checkCandidate(current, 'cooling', airCooler({ heightMm: 165 }));
    expect(verdict.compatible).toBe(false);
    expect(verdict.reason).toContain('165');
  });

  it('rejects a case that cannot host the parts already chosen', () => {
    const current = selection({
      motherboard: motherboard({ formFactor: 'ATX' }),
      gpu: gpu({ lengthMm: 320 }),
    });
    const verdict = checkCandidate(current, 'case', pcCase({ supportedFormFactors: ['ITX'] }));
    expect(verdict.compatible).toBe(false);
  });
});
