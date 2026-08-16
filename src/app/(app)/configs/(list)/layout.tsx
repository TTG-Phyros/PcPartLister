import { SubNav } from '@/components/sub-nav';
import { requireUser } from '@/lib/auth/guard';
import { countPartsToBuy } from '@/lib/builds/shopping';

export const dynamic = 'force-dynamic';

/**
 * Header shared by the two readings of the same data: the configurations
 * themselves, and what they are still waiting on. A configuration's own page
 * sits outside this group — it has its own title.
 */
export default async function ConfigsListLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const toBuy = await countPartsToBuy();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold tracking-tight">Configurations</h1>
      <SubNav
        links={[
          { href: '/configs', label: 'Configurations' },
          { href: '/configs/a-acheter', label: 'À acheter', badge: toBuy },
        ]}
        label="Sections des configurations"
      />
      {children}
    </div>
  );
}
