import { GpuTierList } from '@/components/tier-list/gpu-tier-list';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { getGpuTierRows } from '@/lib/tier-list/queries';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Tier list GPU — PcPartLister' };

export default async function TierListPage() {
  await requireUser();

  const rows = await getGpuTierRows();
  const linked = rows.filter((row) => row.catalogComponentId).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tier list — cartes graphiques</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {rows.length} carte{rows.length > 1 ? 's' : ''} classée
          {rows.length > 1 ? 's' : ''} par indice de performance relatif (GeForce RTX 4090 =
          100 %).
          {linked > 0 ? ` ${linked} renvoient vers leur fiche du catalogue.` : ''}
        </p>
      </div>

      <GpuTierList rows={rows} />

      <Card className="text-xs text-ink-muted">
        Source : <code>data/tier-list/cartes-graphiques.csv</code>. Le fichier s’édite à la main
        comme les fichiers de seed ; il est relu au démarrage de l’application.
      </Card>
    </div>
  );
}
