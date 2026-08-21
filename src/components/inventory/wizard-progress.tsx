'use client';

import { cn } from '@/components/ui';

export const WIZARD_STEPS = [
  { step: 1, label: 'Type' },
  { step: 2, label: 'Composant' },
  { step: 3, label: 'Achat' },
  { step: 4, label: 'Récap' },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]['step'];

/**
 * Where the entry stands, always on screen. A step already reachable is a
 * button: going back is how a wizard stays honest, and nothing is lost by it —
 * the draft holds every answer until the purchase is saved.
 *
 * A bar per step rather than numbered bubbles: it reads as progress at a
 * glance, the whole width of a step stays tappable, and four of them still fit
 * across the narrowest phone.
 */
export function WizardProgress({
  current,
  reachable,
  onGoTo,
}: {
  current: WizardStep;
  /** The furthest step the answers so far allow jumping to. */
  reachable: WizardStep;
  onGoTo: (step: WizardStep) => void;
}) {
  return (
    <nav aria-label="Étapes de la saisie">
      <ol className="flex items-stretch gap-1.5">
        {WIZARD_STEPS.map(({ step, label }) => {
          const active = step === current;
          const open = step <= reachable;

          return (
            <li key={step} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onGoTo(step)}
                disabled={!open}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex w-full flex-col gap-1.5 rounded-lg py-1 text-center',
                  open ? 'cursor-pointer' : 'cursor-default',
                  'focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-1.5 rounded-full transition-colors',
                    active ? 'bg-brand' : step < current ? 'bg-brand/50' : 'bg-surface-hover',
                  )}
                />
                <span
                  className={cn(
                    'truncate px-1 text-xs',
                    active ? 'font-medium text-ink' : 'text-ink-muted',
                  )}
                >
                  <span className="sr-only">{`Étape ${step} sur ${WIZARD_STEPS.length} : `}</span>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
