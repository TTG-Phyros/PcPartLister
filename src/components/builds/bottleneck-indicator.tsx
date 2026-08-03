import { Card, cn } from '@/components/ui';
import {
  BALANCED_ZONE,
  readBottleneck,
  type BottleneckBand,
} from '@/lib/compat/bottleneck';
import type { BuildSelection } from '@/lib/compat/engine';

/**
 * Where the configuration sits between a starved graphics card and a wasted one.
 *
 * Always on, unlike the advisory rule, which only speaks up when a pairing is
 * clearly wrong: the point of the panel is to answer « et là, c'est bon ? » at a
 * glance, whatever the answer. The verdict and the sentence carry the meaning —
 * the gauge is decoration on top of them, and is hidden from screen readers.
 */

const STYLES: Record<BottleneckBand, { badge: string; needle: string }> = {
  'cpu-limitant': { badge: 'bg-danger/15 text-danger', needle: 'bg-danger' },
  'cpu-juste': { badge: 'bg-warn/15 text-warn', needle: 'bg-warn' },
  equilibre: { badge: 'bg-ok/15 text-ok', needle: 'bg-ok' },
  'gpu-juste': { badge: 'bg-warn/15 text-warn', needle: 'bg-warn' },
  'gpu-limitant': { badge: 'bg-danger/15 text-danger', needle: 'bg-danger' },
};

/** Each verdict says what to do about it: the panel sits next to the price. */
const COPY: Record<BottleneckBand, { verdict: string; advice: string }> = {
  'cpu-limitant': {
    verdict: 'Le processeur bride la carte',
    advice:
      'La carte ne sera pas exploitée à fond en jeu. Un processeur plus rapide, ou une carte plus modeste, rendrait la configuration plus cohérente.',
  },
  'cpu-juste': {
    verdict: 'Processeur un peu juste',
    advice:
      'L’écart reste tenable : quelques images perdues dans les jeux les plus gourmands en processeur.',
  },
  equilibre: {
    verdict: 'Bien appariés',
    advice: 'Les deux pièces jouent dans la même cour : rien à corriger de ce côté.',
  },
  'gpu-juste': {
    verdict: 'Carte graphique un peu juste',
    advice: 'Le processeur garde de la marge : une carte au-dessus se rentabiliserait.',
  },
  'gpu-limitant': {
    verdict: 'La carte bride le processeur',
    advice:
      'Le processeur sera largement sous-exploité. C’est la carte graphique qui décide des performances en jeu : la monter en gamme est ce qui se verra le plus.',
  },
};

export function BottleneckIndicator({ selection }: { selection: BuildSelection }) {
  const cpu = selection.cpu;
  const gpu = selection.gpu;
  const cpuIndex = cpu?.specs.perfIndex;
  const gpuIndex = gpu?.specs.perfIndex;

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-medium">Goulot d’étranglement</h2>
        <p className="text-xs text-ink-muted">
          Équilibre entre le processeur et la carte graphique.
        </p>
      </div>

      {!cpu || !gpu ? (
        <Pending>{missingText(Boolean(cpu), Boolean(gpu))}</Pending>
      ) : !cpuIndex || !gpuIndex ? (
        // The index is an optional spec: a hand-entered part may simply not have
        // one yet, and the sheet is where it gets filled in.
        <Pending>
          Indice de performance absent sur {unratedText(Boolean(cpuIndex), Boolean(gpuIndex))} :
          renseignez-le sur sa fiche du catalogue pour activer l’indicateur.
        </Pending>
      ) : (
        <Reading
          cpu={{ label: cpu.label, index: cpuIndex }}
          gpu={{ label: gpu.label, index: gpuIndex }}
        />
      )}
    </Card>
  );
}

function Pending({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>;
}

function missingText(hasCpu: boolean, hasGpu: boolean): string {
  if (!hasCpu && !hasGpu) {
    return 'Choisissez un processeur et une carte graphique pour situer l’équilibre.';
  }
  if (!hasCpu) return 'Choisissez un processeur pour situer l’équilibre.';
  return 'Choisissez une carte graphique pour situer l’équilibre.';
}

function unratedText(hasCpuIndex: boolean, hasGpuIndex: boolean): string {
  if (!hasCpuIndex && !hasGpuIndex) return 'les deux pièces';
  return hasCpuIndex ? 'la carte graphique' : 'le processeur';
}

type RatedPart = { label: string; index: number };

function Reading({ cpu, gpu }: { cpu: RatedPart; gpu: RatedPart }) {
  const reading = readBottleneck(cpu.index, gpu.index);
  const style = STYLES[reading.band];

  return (
    <>
      <span
        className={cn('self-start rounded px-1.5 py-0.5 text-xs font-medium', style.badge)}
      >
        {COPY[reading.band].verdict}
      </span>

      <div aria-hidden="true">
        <div className="relative h-2 rounded-full bg-surface-hover">
          <span
            className="absolute inset-y-0 rounded-full bg-ok/20"
            style={{
              left: `${BALANCED_ZONE.from}%`,
              width: `${BALANCED_ZONE.to - BALANCED_ZONE.from}%`,
            }}
          />
          <span
            className={cn(
              'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-raised',
              style.needle,
            )}
            style={{ left: `${reading.position}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-ink-muted">
          <span>CPU limitant</span>
          <span>Équilibré</span>
          <span>GPU limitant</span>
        </div>
      </div>

      <p className="text-sm text-ink-muted">{COPY[reading.band].advice}</p>

      <dl className="flex flex-col gap-2 border-t border-border-subtle pt-2 text-sm">
        <PartRow
          role="Processeur"
          part={cpu}
          limiting={reading.limiting === 'cpu'}
        />
        <PartRow
          role="Carte graphique"
          part={gpu}
          limiting={reading.limiting === 'gpu'}
        />
      </dl>
    </>
  );
}

function PartRow({
  role,
  part,
  limiting,
}: {
  role: string;
  part: RatedPart;
  limiting: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0">
        <span className="block text-xs text-ink-muted">
          {role}
          {limiting ? ' · pièce limitante' : ''}
        </span>
        <span className="block break-words">{part.label}</span>
      </dt>
      <dd className="shrink-0 text-right text-xs text-ink-muted tabular-nums">
        indice {part.index}
      </dd>
    </div>
  );
}
