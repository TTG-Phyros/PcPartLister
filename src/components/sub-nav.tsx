'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui';

export type SubNavLink = { href: string; label: string; badge?: number };

/**
 * Tabs inside a section. Underlined rather than filled, so a page never looks
 * like it carries two main navigations one above the other.
 */
export function SubNav({ links, label }: { links: SubNavLink[]; label: string }) {
  const pathname = usePathname();

  // Most specific wins: `/configs` stays lit on a configuration's own page and
  // only hands over to `/configs/a-acheter` on that exact branch.
  const active = links.reduce<string | null>((best, link) => {
    if (pathname !== link.href && !pathname.startsWith(`${link.href}/`)) return best;
    return best === null || link.href.length > best.length ? link.href : best;
  }, null);

  return (
    <nav
      className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border-subtle"
      aria-label={label}
    >
      {links.map((link) => {
        const current = link.href === active;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              // -mb-px: the tab's own border sits on top of the bar's, not under it.
              '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              current
                ? 'border-brand text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {link.label}
            {link.badge ? (
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-xs',
                  current ? 'bg-brand/15 text-brand' : 'bg-surface-hover text-ink-muted',
                )}
              >
                {link.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
