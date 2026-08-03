import Link from 'next/link';
import { logoutAction } from '@/actions/auth';
import { AppNav, type NavLink } from '@/components/app-nav';
import { SessionKeepAlive } from '@/components/auth/session-keepalive';
import { Button } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

const LINKS: NavLink[] = [
  { href: '/', label: 'Tableau de bord' },
  { href: '/stock', label: 'Stock' },
  { href: '/configs', label: 'Configs' },
  { href: '/ventes', label: 'Ventes' },
  { href: '/catalogue', label: 'Catalogue' },
  { href: '/tier-list', label: 'Tier list' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Every page under this layout is behind the session check.
  const user = await requireUser();

  const links =
    user.role === 'admin'
      ? [...LINKS, { href: '/admin/utilisateurs', label: 'Comptes' }]
      : LINKS;

  return (
    <div className="min-h-dvh">
      <SessionKeepAlive />
      <header className="sticky top-0 z-10 border-b border-border-subtle bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <Link href="/" className="shrink-0 text-base font-semibold tracking-tight">
              PcPartLister
            </Link>
            <div className="flex min-w-0 sm:hidden">
              <UserMenu email={user.email} />
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-3">
            <AppNav links={links} />
            <div className="hidden min-w-0 sm:flex sm:items-center sm:gap-2">
              <UserMenu email={user.email} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

function UserMenu({ email }: { email: string }) {
  return (
    // min-w-0 + truncate on the address: a long email shrinks instead of
    // pushing the logout button off a phone screen.
    <div className="flex min-w-0 items-center gap-2">
      <Link
        href="/profil"
        className="min-w-0 truncate text-sm text-ink-muted hover:text-ink sm:max-w-48"
        title={email}
      >
        {email}
      </Link>
      <form action={logoutAction} className="shrink-0">
        <Button variant="ghost" type="submit" className="min-h-9 px-2 py-1 text-xs">
          Déconnexion
        </Button>
      </form>
    </div>
  );
}
