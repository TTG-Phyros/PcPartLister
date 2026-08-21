'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/components/ui';

export type CardOption<T extends string> = {
  value: T;
  label: string;
  /** One line under the label. Keep it short: these are cards, not paragraphs. */
  hint?: string;
  icon?: ReactNode;
  /** Anything to show in the corner — a count, a status pill. */
  badge?: ReactNode;
  disabled?: boolean;
};

const COLUMNS = {
  // One per row on a phone, three abreast once there is room: for options that
  // carry a hint, which needs the width to stay one line.
  1: 'grid-cols-1 sm:grid-cols-3',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
} as const;

/**
 * Pick one thing among a handful, as cards rather than a dropdown.
 *
 * Native radios do the work, hidden under the card: a dropdown on a phone opens
 * a system sheet and hides the choices behind a tap, while radios keep arrow
 * keys, labels, tab order and the announced group intact for free. The card is
 * the whole tap target, and nothing about the selected state depends on hover.
 */
export function CardSelect<T extends string>({
  options,
  value,
  onChange,
  label,
  name,
  columns = 3,
  className,
}: {
  options: ReadonlyArray<CardOption<T>>;
  value: T | null;
  onChange: (value: T) => void;
  /** Names the group for screen readers. */
  label: string;
  /** Posts the choice with a form. Omitted when the caller keeps it in state. */
  name?: string;
  columns?: keyof typeof COLUMNS;
  className?: string;
}) {
  const generated = useId();
  const groupName = name ?? generated;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid gap-2 sm:gap-3', COLUMNS[columns], className)}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            // min-h-24: a comfortable thumb target, and room for icon + label
            // on the narrowest phone.
            'relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-border-subtle bg-surface-raised p-3 text-center transition-colors',
            'has-checked:border-brand has-checked:bg-brand/10',
            'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40',
            option.disabled
              ? 'cursor-not-allowed opacity-40'
              : 'active:bg-surface-hover hover:bg-surface-hover has-checked:hover:bg-brand/15',
          )}
        >
          <input
            type="radio"
            name={groupName}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            className="peer sr-only"
          />
          {option.badge ? (
            <span className="absolute top-2 right-2 text-xs text-ink-muted">{option.badge}</span>
          ) : null}
          {option.icon ? (
            <span className="text-ink-muted peer-checked:text-brand" aria-hidden>
              {option.icon}
            </span>
          ) : null}
          <span className="text-sm leading-tight font-medium text-ink">{option.label}</span>
          {option.hint ? (
            <span className="text-xs leading-tight text-ink-muted">{option.hint}</span>
          ) : null}
        </label>
      ))}
    </div>
  );
}
