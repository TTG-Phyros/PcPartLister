import { SubNav, type SubNavLink } from '@/components/sub-nav';
import { requireUser } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

const LINKS: SubNavLink[] = [{ href: '/profil', label: 'Mon compte' }];

/**
 * Everything that is about you rather than about the stock lives here. Managing
 * the other accounts is one of those things, so it is a tab of this page and no
 * longer an entry of the main navigation.
 */
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const links =
    user.role === 'admin'
      ? [...LINKS, { href: '/profil/comptes', label: 'Comptes' }]
      : LINKS;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold tracking-tight">Profil</h1>
      <SubNav links={links} label="Sections du profil" />
      {children}
    </div>
  );
}
