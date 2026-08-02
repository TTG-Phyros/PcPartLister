import {
  COMPONENT_CATEGORIES,
  FORM_FACTORS,
  PSU_FORM_FACTORS,
  RAM_TYPES,
  SOCKETS,
  SPECS_SCHEMA_BY_CATEGORY,
  type ComponentCategory,
  type ComponentSpecs,
} from './index';

/**
 * Declarative description of the spec form, one entry per field.
 *
 * The catalog form renders from this table, so adding a spec means adding a
 * Zod field plus one line here — no component to touch.
 */
export type SpecFieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'tags'
  | 'numbers';

export type SpecField = {
  /** Dot path inside the specs object, e.g. "powerConnectors.pcie8pin". */
  path: string;
  label: string;
  type: SpecFieldType;
  options?: readonly string[];
  /** Free values allowed alongside `options` (sockets, chipsets...). */
  freeText?: boolean;
  required?: boolean;
  unit?: string;
  step?: number;
  hint?: string;
};

const socketField = (path = 'socket', label = 'Socket'): SpecField => ({
  path,
  label,
  type: 'select',
  options: SOCKETS,
  freeText: true,
  required: true,
});

export const SPEC_FIELDS: Record<ComponentCategory, SpecField[]> = {
  cpu: [
    socketField(),
    { path: 'cores', label: 'Cœurs', type: 'number', required: true },
    { path: 'threads', label: 'Threads', type: 'number', required: true },
    { path: 'baseClockGhz', label: 'Fréquence de base', type: 'number', unit: 'GHz', step: 0.1, required: true },
    { path: 'boostClockGhz', label: 'Fréquence boost', type: 'number', unit: 'GHz', step: 0.1 },
    { path: 'tdpW', label: 'TDP', type: 'number', unit: 'W', required: true },
    { path: 'integratedGraphics', label: 'Graphiques intégrés', type: 'boolean', required: true },
    {
      path: 'supportedChipsets',
      label: 'Chipsets compatibles',
      type: 'tags',
      hint: 'Séparés par des virgules. Laisser vide si le socket suffit.',
    },
    { path: 'perfIndex', label: 'Indice de performance', type: 'number', hint: 'Repère relatif pour la détection de goulot d’étranglement.' },
  ],
  motherboard: [
    socketField(),
    { path: 'chipset', label: 'Chipset', type: 'text', required: true },
    { path: 'formFactor', label: 'Format', type: 'select', options: FORM_FACTORS, required: true },
    { path: 'ramType', label: 'Type de mémoire', type: 'select', options: RAM_TYPES, required: true },
    { path: 'ramSlots', label: 'Slots mémoire', type: 'number', required: true },
    { path: 'maxRamGb', label: 'Mémoire max', type: 'number', unit: 'Go', required: true },
    { path: 'maxRamSpeedMhz', label: 'Fréquence mémoire max', type: 'number', unit: 'MHz' },
    { path: 'sataPorts', label: 'Ports SATA', type: 'number', required: true },
    { path: 'm2Slots', label: 'Slots M.2', type: 'number', required: true },
    { path: 'cpuPowerConnector', label: 'Connecteur alim CPU', type: 'text' },
  ],
  ram: [
    { path: 'ramType', label: 'Type', type: 'select', options: RAM_TYPES, required: true },
    { path: 'capacityPerStickGb', label: 'Capacité par barrette', type: 'number', unit: 'Go', required: true },
    { path: 'sticks', label: 'Nombre de barrettes', type: 'number', required: true },
    { path: 'speedMhz', label: 'Fréquence', type: 'number', unit: 'MHz', required: true },
    { path: 'casLatency', label: 'CAS', type: 'number' },
  ],
  gpu: [
    { path: 'chipset', label: 'Puce', type: 'text', required: true },
    { path: 'vramGb', label: 'VRAM', type: 'number', unit: 'Go', required: true },
    { path: 'lengthMm', label: 'Longueur', type: 'number', unit: 'mm', required: true },
    { path: 'tdpW', label: 'TDP', type: 'number', unit: 'W', required: true },
    { path: 'powerConnectors.pcie6pin', label: 'Connecteurs PCIe 6 broches', type: 'number' },
    { path: 'powerConnectors.pcie8pin', label: 'Connecteurs PCIe 8 broches', type: 'number' },
    { path: 'powerConnectors.pcie12vhpwr', label: 'Connecteurs 12VHPWR', type: 'number' },
    { path: 'perfIndex', label: 'Indice de performance', type: 'number' },
  ],
  storage: [
    { path: 'storageType', label: 'Interface', type: 'select', options: ['SATA', 'NVMe'], required: true },
    { path: 'capacityGb', label: 'Capacité', type: 'number', unit: 'Go', required: true },
    {
      path: 'formFactor',
      label: 'Format',
      type: 'select',
      options: ['2.5"', '3.5"', 'M.2 2280', 'M.2 2242'],
      required: true,
    },
  ],
  psu: [
    { path: 'wattage', label: 'Puissance', type: 'number', unit: 'W', required: true },
    {
      path: 'efficiency',
      label: 'Certification',
      type: 'select',
      options: ['Aucune', '80+', '80+ Bronze', '80+ Silver', '80+ Gold', '80+ Platinum', '80+ Titanium'],
      required: true,
    },
    { path: 'modular', label: 'Modulaire', type: 'select', options: ['non', 'semi', 'oui'], required: true },
    { path: 'formFactor', label: 'Format', type: 'select', options: PSU_FORM_FACTORS, required: true },
    { path: 'pcieConnectors.pcie6pin', label: 'Connecteurs PCIe 6 broches', type: 'number' },
    { path: 'pcieConnectors.pcie8pin', label: 'Connecteurs PCIe 8 broches', type: 'number' },
    { path: 'pcieConnectors.pcie12vhpwr', label: 'Connecteurs 12VHPWR', type: 'number' },
    { path: 'sataConnectors', label: 'Connecteurs SATA', type: 'number' },
  ],
  case: [
    {
      path: 'supportedFormFactors',
      label: 'Formats supportés',
      type: 'multiselect',
      options: FORM_FACTORS,
      required: true,
    },
    { path: 'maxGpuLengthMm', label: 'Longueur GPU max', type: 'number', unit: 'mm', required: true },
    { path: 'maxCoolerHeightMm', label: 'Hauteur ventirad max', type: 'number', unit: 'mm', required: true },
    {
      path: 'radiatorSupportMm',
      label: 'Radiateurs supportés',
      type: 'numbers',
      hint: 'Tailles en mm séparées par des virgules, ex. 120, 240, 280.',
    },
    {
      path: 'psuFormFactors',
      label: 'Formats d’alimentation',
      type: 'multiselect',
      options: PSU_FORM_FACTORS,
      required: true,
    },
    { path: 'drivebays25', label: 'Emplacements 2,5"', type: 'number' },
    { path: 'drivebays35', label: 'Emplacements 3,5"', type: 'number' },
  ],
  cooling: [
    {
      path: 'coolingType',
      label: 'Type',
      type: 'select',
      options: ['air', 'aio', 'fan'],
      required: true,
    },
    {
      path: 'supportedSockets',
      label: 'Sockets supportés',
      type: 'multiselect',
      options: SOCKETS,
      hint: 'Laisser vide pour un simple ventilateur de boîtier.',
    },
    { path: 'heightMm', label: 'Hauteur (ventirad)', type: 'number', unit: 'mm' },
    { path: 'radiatorSizeMm', label: 'Taille du radiateur (AIO)', type: 'number', unit: 'mm' },
    { path: 'maxTdpW', label: 'TDP dissipé max', type: 'number', unit: 'W' },
  ],
  misc: [{ path: 'description', label: 'Description', type: 'text' }],
};

/* ───────────── Form data <-> specs object ───────────── */

function setByPath(target: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts.at(-1)!] = value;
}

export function getByPath(source: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((node, part) => {
    if (typeof node !== 'object' || node === null) return undefined;
    return (node as Record<string, unknown>)[part];
  }, source);
}

function splitList(raw: string): string[] {
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Reads the flat form fields back into a specs object and validates it against
 * the category schema. Returns the parsed specs or the list of field errors.
 */
export function specsFromFormData(
  category: ComponentCategory,
  read: (name: string) => string | string[] | null,
): { ok: true; specs: ComponentSpecs } | { ok: false; errors: string[] } {
  const draft: Record<string, unknown> = { category };

  for (const field of SPEC_FIELDS[category]) {
    const raw = read(`specs.${field.path}`);

    if (field.type === 'multiselect') {
      const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
      setByPath(draft, field.path, values);
      continue;
    }

    const value = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');

    if (field.type === 'boolean') {
      setByPath(draft, field.path, value === 'on' || value === 'true');
      continue;
    }

    if (value.trim() === '') {
      // Absent optional field: leave it out so Zod defaults can apply.
      if (field.type === 'tags' || field.type === 'numbers') setByPath(draft, field.path, []);
      continue;
    }

    switch (field.type) {
      case 'number':
        setByPath(draft, field.path, Number(value.replace(',', '.')));
        break;
      case 'tags':
        setByPath(draft, field.path, splitList(value));
        break;
      case 'numbers':
        setByPath(draft, field.path, splitList(value).map(Number));
        break;
      default:
        setByPath(draft, field.path, value.trim());
    }
  }

  const parsed = SPECS_SCHEMA_BY_CATEGORY[category].safeParse(draft);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const path = issue.path.join('.');
        const field = SPEC_FIELDS[category].find((f) => f.path === path);
        return `${field?.label ?? path} : ${issue.message}`;
      }),
    };
  }

  return { ok: true, specs: parsed.data as ComponentSpecs };
}

/** Value to pre-fill a form input with, from an existing specs object. */
export function formValueFor(field: SpecField, specs: unknown): string | string[] {
  const value = getByPath(specs, field.path);
  if (value === undefined || value === null) return field.type === 'multiselect' ? [] : '';
  if (Array.isArray(value)) {
    return field.type === 'multiselect' ? value.map(String) : value.join(', ');
  }
  return String(value);
}

export { COMPONENT_CATEGORIES };
