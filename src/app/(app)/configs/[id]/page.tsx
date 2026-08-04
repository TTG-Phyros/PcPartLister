import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BuildMetaForm,
  BuildStatusFlow,
  DeleteBuild,
} from '@/components/builds/build-header';
import { Configurator } from '@/components/builds/configurator';
import { ListForSale, Unlist } from '@/components/sales/listing-actions';
import { SaleForm } from '@/components/sales/sale-form';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { computeBuildCost, suggestedSalePriceCents } from '@/lib/builds/pricing';
import { getBuildDetail } from '@/lib/builds/queries';
import { BUILD_STATUS_LABELS, BUILD_STATUS_TONES } from '@/lib/builds/types';
import { formatPrice } from '@/lib/catalog/format';
import type { SaleSubject } from '@/lib/sales/labels';
import { getSaleFor } from '@/lib/sales/queries';
import { getSettings } from '@/lib/settings-store';
import { getAllTierRows } from '@/lib/tier-list/queries';

export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return dateFormat.format(new Date(year!, month! - 1, day!));
}

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const build = await getBuildDetail(id);
  if (!build) notFound();

  const [settings, sale, tierRows] = await Promise.all([
    getSettings(),
    getSaleFor('build', build.id),
    getAllTierRows(),
  ]);
  const cost = computeBuildCost(build.lines, build.consumablesCents);
  // A sold configuration is a record: its lines stay as they were.
  const editable = build.status !== 'vendue';

  const subject: SaleSubject = { kind: 'build', id: build.id, name: build.name };
  const listed = build.status === 'en_vente';
  const suggestedPrice = suggestedSalePriceCents(cost.totalCents, settings.target_margin_pct);
  // A configuration marked sold from the flow has no figures yet: offer the
  // form so the sale can be filled in after the fact.
  const concluding = sale !== null || listed || build.status === 'vendue';

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
        tierRows={tierRows}
      />

      {build.status === 'brouillon' && !sale ? null : (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="font-medium">Vente</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Coût de revient : {formatPrice(cost.totalCents)} (
              {formatPrice(cost.componentsCents)} de composants +{' '}
              {formatPrice(cost.consumablesCents)} de consommables).
              {listed && build.listedAt ? ` En vente depuis le ${formatDay(build.listedAt)}.` : ''}
            </p>
          </div>

          {/* Two moments, two forms: still on the shelf, or on its way out. */}
          {concluding ? (
            <SaleForm
              subject={subject}
              costCents={cost.totalCents}
              suggestedPriceCents={suggestedPrice}
              askingPriceCents={build.askingPriceCents}
              targetMarginPct={settings.target_margin_pct}
              defaultPlatformFeePct={settings.default_platform_fee_pct}
              sale={sale}
            />
          ) : (
            <ListForSale
              subject={subject}
              costCents={cost.totalCents}
              suggestedPriceCents={suggestedPrice}
              askingPriceCents={build.askingPriceCents}
              targetMarginPct={settings.target_margin_pct}
            />
          )}

          {listed && !sale ? <Unlist subject={subject} /> : null}
        </Card>
      )}

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
