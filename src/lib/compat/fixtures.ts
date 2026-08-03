import type {
  CaseSpecs,
  CoolingSpecs,
  CpuSpecs,
  GpuSpecs,
  MotherboardSpecs,
  PsuSpecs,
  RamSpecs,
  StorageSpecs,
} from '@/lib/specs';
import type { BuildSelection, SelectedPart } from './types';

/**
 * Builders for the compatibility tests. Each one returns a realistic part with
 * every field filled, so a test only has to state the field it cares about.
 */

let counter = 0;
function part<S>(label: string, specs: S): SelectedPart<S> {
  counter += 1;
  return { id: `fixture-${counter}`, label, specs };
}

/** Builds a selection, defaulting every multi-slot category to empty. */
export function selection(parts: Partial<BuildSelection> = {}): BuildSelection {
  return { ram: [], storage: [], cooling: [], misc: [], ...parts };
}

export function cpu(overrides: Partial<CpuSpecs> = {}): SelectedPart<CpuSpecs> {
  const specs: CpuSpecs = {
    category: 'cpu',
    socket: 'AM4',
    cores: 6,
    threads: 12,
    baseClockGhz: 3.7,
    boostClockGhz: 4.6,
    tdpW: 65,
    integratedGraphics: false,
    supportedChipsets: ['B450', 'B550', 'X570'],
    perfIndex: 100,
    ...overrides,
  };
  return part(overrides.socket ? `CPU ${specs.socket}` : 'Ryzen 5 5600X', specs);
}

export function motherboard(
  overrides: Partial<MotherboardSpecs> = {},
): SelectedPart<MotherboardSpecs> {
  const specs: MotherboardSpecs = {
    category: 'motherboard',
    socket: 'AM4',
    chipset: 'B550',
    formFactor: 'ATX',
    ramType: 'DDR4',
    ramSlots: 4,
    maxRamGb: 128,
    maxRamSpeedMhz: 4400,
    sataPorts: 6,
    m2Slots: 2,
    cpuPowerConnector: '8-pin',
    ...overrides,
  };
  return part('MAG B550 TOMAHAWK', specs);
}

export function ram(overrides: Partial<RamSpecs> = {}): SelectedPart<RamSpecs> {
  const specs: RamSpecs = {
    category: 'ram',
    ramType: 'DDR4',
    capacityPerStickGb: 8,
    sticks: 2,
    speedMhz: 3200,
    casLatency: 16,
    ...overrides,
  };
  return part('Vengeance LPX 16 Go', specs);
}

export function gpu(overrides: Partial<GpuSpecs> = {}): SelectedPart<GpuSpecs> {
  const specs: GpuSpecs = {
    category: 'gpu',
    chipset: 'GeForce RTX 3060',
    vramGb: 12,
    lengthMm: 242,
    tdpW: 170,
    powerConnectors: { pcie6pin: 0, pcie8pin: 1, pcie12vhpwr: 0 },
    perfIndex: 100,
    ...overrides,
  };
  return part(specs.chipset, specs);
}

export function psu(overrides: Partial<PsuSpecs> = {}): SelectedPart<PsuSpecs> {
  const specs: PsuSpecs = {
    category: 'psu',
    wattage: 650,
    efficiency: '80+ Gold',
    modular: 'oui',
    formFactor: 'ATX',
    pcieConnectors: { pcie6pin: 0, pcie8pin: 4, pcie12vhpwr: 0 },
    sataConnectors: 8,
    ...overrides,
  };
  return part(`Alimentation ${specs.wattage} W`, specs);
}

export function pcCase(overrides: Partial<CaseSpecs> = {}): SelectedPart<CaseSpecs> {
  const specs: CaseSpecs = {
    category: 'case',
    supportedFormFactors: ['ATX', 'mATX', 'ITX'],
    maxGpuLengthMm: 360,
    maxCoolerHeightMm: 170,
    radiatorSupportMm: [120, 240, 280, 360],
    psuFormFactors: ['ATX'],
    drivebays25: 2,
    drivebays35: 2,
    ...overrides,
  };
  return part('4000D Airflow', specs);
}

export function airCooler(overrides: Partial<CoolingSpecs> = {}): SelectedPart<CoolingSpecs> {
  const specs: CoolingSpecs = {
    category: 'cooling',
    coolingType: 'air',
    supportedSockets: ['AM4', 'AM5', 'LGA1200', 'LGA1700'],
    heightMm: 159,
    maxTdpW: 150,
    ...overrides,
  };
  return part('Hyper 212 EVO', specs);
}

export function aioCooler(overrides: Partial<CoolingSpecs> = {}): SelectedPart<CoolingSpecs> {
  const specs: CoolingSpecs = {
    category: 'cooling',
    coolingType: 'aio',
    supportedSockets: ['AM4', 'AM5', 'LGA1200', 'LGA1700'],
    radiatorSizeMm: 240,
    maxTdpW: 250,
    ...overrides,
  };
  return part('H100i 240', specs);
}

export function caseFan(overrides: Partial<CoolingSpecs> = {}): SelectedPart<CoolingSpecs> {
  const specs: CoolingSpecs = {
    category: 'cooling',
    coolingType: 'fan',
    supportedSockets: [],
    ...overrides,
  };
  return part('Ventilateur 120 mm', specs);
}

export function sataDrive(overrides: Partial<StorageSpecs> = {}): SelectedPart<StorageSpecs> {
  const specs: StorageSpecs = {
    category: 'storage',
    storageType: 'SATA',
    capacityGb: 1000,
    formFactor: '2.5"',
    ...overrides,
  };
  return part('SSD SATA 1 To', specs);
}

export function nvmeDrive(overrides: Partial<StorageSpecs> = {}): SelectedPart<StorageSpecs> {
  const specs: StorageSpecs = {
    category: 'storage',
    storageType: 'NVMe',
    capacityGb: 1000,
    formFactor: 'M.2 2280',
    ...overrides,
  };
  return part('NVMe 1 To', specs);
}
