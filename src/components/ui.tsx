import type { ComponentProps, ReactNode } from 'react';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const BUTTON_VARIANTS = {
  primary:
    'bg-brand-strong text-white hover:bg-brand disabled:bg-surface-hover disabled:text-ink-muted',
  secondary:
    'border border-border-subtle bg-surface-raised text-ink hover:bg-surface-hover',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'text-ink-muted hover:bg-surface-hover hover:text-ink',
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
        'min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-ink outline-none placeholder:text-ink-muted/60 focus:border-brand focus:ring-2 focus:ring-brand/30',
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
        'min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30',
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
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-xl border border-border-subtle bg-surface-raised p-5',
        className,
      )}
    />
  );
}

const ALERT_TONES = {
  error: 'border-danger/40 bg-danger/10 text-danger',
  success: 'border-ok/40 bg-ok/10 text-ok',
  warning: 'border-warn/40 bg-warn/10 text-warn',
  info: 'border-border-subtle bg-surface-hover text-ink-muted',
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
