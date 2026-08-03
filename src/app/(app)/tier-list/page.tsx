import Link from 'next/link';
import { TierList } from '@/components/tier-list/tier-list';
import { Card, cn } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import {
  TIER_LIST_CONFIG,
  TIER_LIST_KINDS,
  isTierListKind,
  type TierListKind,
} from '@/lib/tier-list/kinds';
import { getTierRows } from '@/lib/tier-list/queries';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The ranking asked for in the query string; the cards are the default view. */
async function kindFrom(searchParams: PageProps['searchParams']): Promise<TierListKind> {
  const value = (await searchParams).type;
  return typeof value === 'string' && isTierListKind(value) ? value : 'gpu';
}

export async function generateMetadata({ searchParams }: PageProps) {
  const { labels } = TIER_LIST_CONFIG[await kindFrom(searchParams)];
  return { title: `${labels.heading} — PcPartLister` };
}

export default async function TierListPage({ searchParams }: PageProps) {
  await requireUser();

  const kind = await kindFrom(searchParams);
  const { labels } = TIER_LIST_CONFIG[kind];
  const rows = await getTierRows(kind);
  const linked = rows.filter((row) => row.catalogComponentId).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{labels.heading}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {labels.ranked(rows.length)} par {labels.scale}.
          {linked > 0 ? ` ${linked} renvoient vers leur fiche du catalogue.` : ''}
        </p>
      </div>

      {/* One nav entry, one ranking per tab: the two lists share their scale of
          tiers, so they are read side by side rather than in separate pages. */}
      <nav className="-mx-1 flex gap-1 overflow-x-auto" aria-label="Classements">
        {TIER_LIST_KINDS.map((value) => {
          const active = value === kind;
          return (
            <Link
              key={value}
              href={`/tier-list?type=${value}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-surface-hover text-ink'
                  : 'text-ink-muted hover:bg-surface-hover hover:text-ink',
              )}
            >
              {TIER_LIST_CONFIG[value].labels.tab}
            </Link>
          );
        })}
      </nav>

      <TierList kind={kind} rows={rows} />

      <Card className="text-xs text-ink-muted">
        Source : <code>data/tier-list/{TIER_LIST_CONFIG[kind].file}</code>. Le fichier s’édite à la
        main comme les fichiers de seed ; il est relu au démarrage de l’application.
      </Card>
    </div>
  );
}
