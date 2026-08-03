/**
 * How a processor and a graphics card sit relative to each other, read from the
 * rough `perfIndex` both carry.
 *
 * The model lives here rather than inside the advisory rule because two callers
 * need the same verdict: the rule, which warns when a pairing is clearly wrong,
 * and the configurator gauge, which shows the pairing at all times. Pure
 * arithmetic, no React and no data access, like the rest of the engine.
 */

export type BottleneckSide = 'cpu' | 'gpu';

/**
 * The five readings a pairing can get, from a starved card to a wasted one.
 * Only the outer two are worth an alert: an index is a rough marker, and a
 * warning that fires on half the mid-range pairings stops meaning anything.
 */
export const BOTTLENECK_BANDS = [
  'cpu-limitant',
  'cpu-juste',
  'equilibre',
  'gpu-juste',
  'gpu-limitant',
] as const;

export type BottleneckBand = (typeof BOTTLENECK_BANDS)[number];

/** Below this CPU/GPU index ratio, the processor holds the card back. */
const CPU_LIMITS_BELOW = 0.6;
/** Above it, the card is the one being wasted. */
const GPU_LIMITS_ABOVE = 1.7;
/** Inner band: an écart worth naming, not worth an alert. */
const CPU_TIGHT_BELOW = 0.8;
const GPU_TIGHT_ABOVE = 1.25;

/** Read top down, the last band catching everything above. */
const BANDS: ReadonlyArray<{ band: BottleneckBand; below: number }> = [
  { band: 'cpu-limitant', below: CPU_LIMITS_BELOW },
  { band: 'cpu-juste', below: CPU_TIGHT_BELOW },
  { band: 'equilibre', below: GPU_TIGHT_ABOVE },
  { band: 'gpu-juste', below: GPU_LIMITS_ABOVE },
  { band: 'gpu-limitant', below: Number.POSITIVE_INFINITY },
];

const LIMITING: Record<BottleneckBand, BottleneckSide | null> = {
  'cpu-limitant': 'cpu',
  'cpu-juste': 'cpu',
  equilibre: null,
  'gpu-juste': 'gpu',
  'gpu-limitant': 'gpu',
};

/**
 * The gauge track is logarithmic: halving the CPU index and doubling it land the
 * same distance from the middle. `GAUGE_SPAN` is the ratio that pins the needle
 * to an end — past a threefold gap, how far past changes nothing to the advice.
 */
const GAUGE_SPAN = 3;

function needle(ratio: number): number {
  const offset = Math.log(ratio) / Math.log(GAUGE_SPAN);
  return Math.round(50 + 50 * Math.min(Math.max(offset, -1), 1));
}

/** Stretch of the track a balanced pairing falls in, for the gauge to shade. */
export const BALANCED_ZONE = {
  from: needle(CPU_TIGHT_BELOW),
  to: needle(GPU_TIGHT_ABOVE),
};

export type BottleneckReading = {
  band: BottleneckBand;
  /** CPU index over GPU index. 1 is a pair on equal footing. */
  ratio: number;
  /** The part holding the pair back, null while neither does. */
  limiting: BottleneckSide | null;
  /** True for the two outer bands — the ones the advisory rule reports. */
  marked: boolean;
  /** Needle position on a 0–100 track, CPU-limited end on the left. */
  position: number;
};

/** Both indexes are positive by schema; a zero would only come from bad data. */
export function readBottleneck(cpuIndex: number, gpuIndex: number): BottleneckReading {
  const ratio = gpuIndex > 0 ? cpuIndex / gpuIndex : 1;
  const band = BANDS.find((entry) => ratio < entry.below)?.band ?? 'gpu-limitant';

  return {
    band,
    ratio,
    limiting: LIMITING[band],
    marked: band === 'cpu-limitant' || band === 'gpu-limitant',
    position: needle(ratio),
  };
}

/**
 * The advisory rule's wording: lowercase-initial like every other `raison`, and
 * only defined for a reading worth reporting. The configurator gauge writes its
 * own copy — it already shows both parts, so it has no name to repeat.
 */
export function bottleneckMessage(
  reading: BottleneckReading,
  labels: { cpu: string; gpu: string },
): string {
  return reading.limiting === 'cpu'
    ? `le processeur ${labels.cpu} risque de brider la ${labels.gpu} en jeu — goulot d’étranglement probable`
    : `la carte graphique ${labels.gpu} est nettement en retrait du processeur ${labels.cpu} — le CPU sera sous-exploité`;
}
