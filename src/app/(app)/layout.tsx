import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logoutAction } from '@/actions/auth';
import { AppNav, type NavLink } from '@/components/app-nav';
import { SessionKeepAlive } from '@/components/auth/session-keepalive';
import { Button } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

const LINKS: NavLink[] = [{ href: '/', label: 'Tableau de bord' }];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Every page under this layout is behind the session check.
  const user = await requireUser();
  if (user.mustChangePassword) redirect('/premiere-connexion');

  const links =
    user.role === 'admin'
      ? [...LINKS, { href: '/admin/utilisateurs', label: 'Comptes' }]
      : LINKS;

  return (
    <div className="min-h-dvh">
      <SessionKeepAlive />
      <header className="sticky top-0 z-10 border-b border-(--color-border-subtle) bg-(--color-surface)/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="text-base font-semibold tracking-tight">
              PcPartLister
            </Link>
            <div className="flex items-center gap-2 sm:hidden">
              <UserMenu email={user.email} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <AppNav links={links} />
            <div className="hidden sm:flex sm:items-center sm:gap-2">
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
    <div className="flex items-center gap-2">
      <Link
        href="/profil"
        className="max-w-[12rem] truncate text-sm text-(--color-ink-muted) hover:text-(--color-ink)"
        title={email}
      >
        {email}
      </Link>
      <form action={logoutAction}>
        <Button variant="ghost" type="submit" className="min-h-9 px-2 py-1 text-xs">
          Déconnexion
        </Button>
      </form>
    </div>
  );
}
