import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BuildMetaForm,
  BuildStatusFlow,
  DeleteBuild,
} from '@/components/builds/build-header';
import { Configurator } from '@/components/builds/configurator';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { getBuildDetail } from '@/lib/builds/queries';
import { BUILD_STATUS_LABELS, BUILD_STATUS_TONES } from '@/lib/builds/types';
import { getSettings } from '@/lib/settings-store';

export const dynamic = 'force-dynamic';

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const build = await getBuildDetail(id);
  if (!build) notFound();

  const settings = await getSettings();
  // A sold configuration is a record: its lines stay as they were.
  const editable = build.status !== 'vendue';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/configs" className="text-sm text-ink-muted hover:text-ink">
          ← Configurations
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{build.name}</h1>
          <span
            className={`rounded-md px-2 py-1 text-xs font-medium ${BUILD_STATUS_TONES[build.status]}`}
          >
            {BUILD_STATUS_LABELS[build.status]}
          </span>
        </div>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-ink-muted">Avancement</h2>
        <BuildStatusFlow build={build} />
      </Card>

      <Configurator
        build={build}
        targetMarginPct={settings.target_margin_pct}
        editable={editable}
      />

      <Card>
        <h2 className="mb-4 font-medium">Informations</h2>
        <BuildMetaForm build={build} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Zone sensible</h2>
        <p className="text-sm text-ink-muted">
          La suppression rend au stock toutes les unités réservées par cette configuration.
        </p>
        <DeleteBuild build={build} />
      </Card>
    </div>
  );
}
