import type { ComponentProps, ReactNode } from 'react';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const BUTTON_VARIANTS = {
  primary:
    'bg-(--color-brand-strong) text-white hover:bg-(--color-brand) disabled:bg-(--color-surface-hover) disabled:text-(--color-ink-muted)',
  secondary:
    'border border-(--color-border-subtle) bg-(--color-surface-raised) text-(--color-ink) hover:bg-(--color-surface-hover)',
  danger: 'bg-(--color-danger) text-white hover:opacity-90',
  ghost: 'text-(--color-ink-muted) hover:bg-(--color-surface-hover) hover:text-(--color-ink)',
} as const;

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      {...props}
      className={cn(
        // min-height 44px: comfortable tap target on a phone.
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      {...props}
      className={cn(
        'min-h-11 w-full rounded-lg border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-(--color-ink) outline-none placeholder:text-(--color-ink-muted)/60 focus:border-(--color-brand) focus:ring-2 focus:ring-(--color-brand)/30',
        className,
      )}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      {...props}
      className={cn(
        'min-h-11 w-full rounded-lg border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-(--color-ink) outline-none focus:border-(--color-brand) focus:ring-2 focus:ring-(--color-brand)/30',
        className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-(--color-ink-muted)">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-(--color-ink-muted)">{hint}</p> : null}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-xl border border-(--color-border-subtle) bg-(--color-surface-raised) p-5',
        className,
      )}
    />
  );
}

const ALERT_TONES = {
  error: 'border-(--color-danger)/40 bg-(--color-danger)/10 text-(--color-danger)',
  success: 'border-(--color-ok)/40 bg-(--color-ok)/10 text-(--color-ok)',
  warning: 'border-(--color-warn)/40 bg-(--color-warn)/10 text-(--color-warn)',
  info: 'border-(--color-border-subtle) bg-(--color-surface-hover) text-(--color-ink-muted)',
} as const;

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: keyof typeof ALERT_TONES;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-lg border px-3 py-2 text-sm', ALERT_TONES[tone])}
    >
      {children}
    </div>
  );
}
