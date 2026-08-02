import { z } from 'zod';

/**
 * Per-category schemas for `catalog_components.specs` (JSONB).
 *
 * These types are the sole input of the compatibility engine, so they must stay
 * free of any DB/React concern: plain data, plain units (mm, W, MHz, GB).
 */

export const COMPONENT_CATEGORIES = [
  'cpu',
  'motherboard',
  'ram',
  'gpu',
  'storage',
  'psu',
  'case',
  'cooling',
  'misc',
] as const;

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  cpu: 'Processeur',
  motherboard: 'Carte mère',
  ram: 'Mémoire',
  gpu: 'Carte graphique',
  storage: 'Stockage',
  psu: 'Alimentation',
  case: 'Boîtier',
  cooling: 'Refroidissement',
  misc: 'Divers',
};

/** Categories that accept more than one item in a build. */
export const MULTI_SLOT_CATEGORIES: ComponentCategory[] = ['ram', 'storage', 'cooling', 'misc'];

/** Known values, offered in the UI selects. Free text stays allowed for exotic parts. */
export const SOCKETS = [
  'LGA1151',
  'LGA1151-v2',
  'LGA1200',
  'LGA1700',
  'LGA1851',
  'LGA2011-v3',
  'AM3+',
  'AM4',
  'AM5',
  'sTRX4',
] as const;

export const FORM_FACTORS = ['E-ATX', 'ATX', 'mATX', 'ITX'] as const;
export const RAM_TYPES = ['DDR3', 'DDR4', 'DDR5'] as const;
export const PSU_FORM_FACTORS = ['ATX', 'SFX', 'SFX-L', 'TFX'] as const;

const nonEmpty = z.string().trim().min(1);
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();

/** PCIe power connectors, counted by kind on both the GPU and the PSU side. */
export const powerConnectorsSchema = z
  .object({
    pcie6pin: nonNegativeInt.default(0),
    pcie8pin: nonNegativeInt.default(0),
    pcie12vhpwr: nonNegativeInt.default(0),
  })
  // A card with no auxiliary connector leaves every field blank in the form,
  // which must mean "none", not "missing".
  .default({ pcie6pin: 0, pcie8pin: 0, pcie12vhpwr: 0 });

export type PowerConnectors = z.infer<typeof powerConnectorsSchema>;

export const cpuSpecsSchema = z.object({
  category: z.literal('cpu'),
  socket: nonEmpty,
  cores: positiveInt,
  threads: positiveInt,
  baseClockGhz: z.number().positive(),
  boostClockGhz: z.number().positive().optional(),
  tdpW: positiveInt,
  integratedGraphics: z.boolean(),
  /** Chipsets known to run this CPU. Empty/absent means "socket match is enough". */
  supportedChipsets: z.array(nonEmpty).optional(),
  /** Rough relative performance index, used only for bottleneck advice. */
  perfIndex: z.number().positive().optional(),
});

export const motherboardSpecsSchema = z.object({
  category: z.literal('motherboard'),
  socket: nonEmpty,
  chipset: nonEmpty,
  formFactor: z.enum(FORM_FACTORS),
  ramType: z.enum(RAM_TYPES),
  ramSlots: positiveInt,
  maxRamGb: positiveInt,
  maxRamSpeedMhz: positiveInt.optional(),
  sataPorts: nonNegativeInt,
  m2Slots: nonNegativeInt,
  cpuPowerConnector: nonEmpty.optional(),
});

export const ramSpecsSchema = z.object({
  category: z.literal('ram'),
  ramType: z.enum(RAM_TYPES),
  capacityPerStickGb: positiveInt,
  sticks: positiveInt,
  speedMhz: positiveInt,
  casLatency: positiveInt.optional(),
});

export const gpuSpecsSchema = z.object({
  category: z.literal('gpu'),
  chipset: nonEmpty,
  vramGb: positiveInt,
  lengthMm: positiveInt,
  tdpW: positiveInt,
  powerConnectors: powerConnectorsSchema,
  perfIndex: z.number().positive().optional(),
});

export const storageSpecsSchema = z.object({
  category: z.literal('storage'),
  storageType: z.enum(['SATA', 'NVMe']),
  capacityGb: positiveInt,
  formFactor: z.enum(['2.5"', '3.5"', 'M.2 2280', 'M.2 2242']),
});

export const psuSpecsSchema = z.object({
  category: z.literal('psu'),
  wattage: positiveInt,
  efficiency: z.enum([
    'Aucune',
    '80+',
    '80+ Bronze',
    '80+ Silver',
    '80+ Gold',
    '80+ Platinum',
    '80+ Titanium',
  ]),
  modular: z.enum(['non', 'semi', 'oui']),
  formFactor: z.enum(PSU_FORM_FACTORS),
  pcieConnectors: powerConnectorsSchema,
  sataConnectors: nonNegativeInt.optional(),
});

export const caseSpecsSchema = z.object({
  category: z.literal('case'),
  supportedFormFactors: z.array(z.enum(FORM_FACTORS)).min(1),
  maxGpuLengthMm: positiveInt,
  maxCoolerHeightMm: positiveInt,
  /** Radiator sizes the case can host, in mm (120, 240, 280, 360...). */
  radiatorSupportMm: z.array(positiveInt).default([]),
  psuFormFactors: z.array(z.enum(PSU_FORM_FACTORS)).min(1),
  drivebays25: nonNegativeInt.optional(),
  drivebays35: nonNegativeInt.optional(),
});

export const coolingSpecsSchema = z.object({
  category: z.literal('cooling'),
  coolingType: z.enum(['air', 'aio', 'fan']),
  supportedSockets: z.array(nonEmpty).default([]),
  /** Air coolers: total height. */
  heightMm: positiveInt.optional(),
  /** AIO: radiator length (120, 240, 280, 360). */
  radiatorSizeMm: positiveInt.optional(),
  maxTdpW: positiveInt.optional(),
});

export const miscSpecsSchema = z.object({
  category: z.literal('misc'),
  description: z.string().trim().optional(),
});

export const componentSpecsSchema = z.discriminatedUnion('category', [
  cpuSpecsSchema,
  motherboardSpecsSchema,
  ramSpecsSchema,
  gpuSpecsSchema,
  storageSpecsSchema,
  psuSpecsSchema,
  caseSpecsSchema,
  coolingSpecsSchema,
  miscSpecsSchema,
]);

export type CpuSpecs = z.infer<typeof cpuSpecsSchema>;
export type MotherboardSpecs = z.infer<typeof motherboardSpecsSchema>;
export type RamSpecs = z.infer<typeof ramSpecsSchema>;
export type GpuSpecs = z.infer<typeof gpuSpecsSchema>;
export type StorageSpecs = z.infer<typeof storageSpecsSchema>;
export type PsuSpecs = z.infer<typeof psuSpecsSchema>;
export type CaseSpecs = z.infer<typeof caseSpecsSchema>;
export type CoolingSpecs = z.infer<typeof coolingSpecsSchema>;
export type MiscSpecs = z.infer<typeof miscSpecsSchema>;
export type ComponentSpecs = z.infer<typeof componentSpecsSchema>;

/** Maps a category to its schema, for form validation and seed checking. */
export const SPECS_SCHEMA_BY_CATEGORY = {
  cpu: cpuSpecsSchema,
  motherboard: motherboardSpecsSchema,
  ram: ramSpecsSchema,
  gpu: gpuSpecsSchema,
  storage: storageSpecsSchema,
  psu: psuSpecsSchema,
  case: caseSpecsSchema,
  cooling: coolingSpecsSchema,
  misc: miscSpecsSchema,
} as const satisfies Record<ComponentCategory, z.ZodTypeAny>;

/** Sockets are compared case-insensitively, without spaces or underscores. */
export function normalizeSocket(socket: string): string {
  return socket.trim().toLowerCase().replace(/[\s_]/g, '');
}
