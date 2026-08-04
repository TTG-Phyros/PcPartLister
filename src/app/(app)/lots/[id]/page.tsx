import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ComponentImage } from '@/components/catalog/component-image';
import { DeleteLot, LotMetaForm } from '@/components/lots/lot-header';
import { LotPicker, RemoveLotItem } from '@/components/lots/lot-picker';
import { ListForSale, Unlist } from '@/components/sales/listing-actions';
import { SaleForm } from '@/components/sales/sale-form';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { suggestedSalePriceCents } from '@/lib/builds/pricing';
import { formatPrice } from '@/lib/catalog/format';
import { CONDITION_LABELS } from '@/lib/inventory/labels';
import { getLotDetail } from '@/lib/lots/queries';
import { LOT_STATUS_LABELS, LOT_STATUS_TONES } from '@/lib/lots/types';
import type { SaleSubject } from '@/lib/sales/labels';
import { getSaleFor } from '@/lib/sales/queries';
import { getSettings } from '@/lib/settings-store';
import { CATEGORY_LABELS } from '@/lib/specs';

export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return dateFormat.format(new Date(year!, month! - 1, day!));
}

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const lot = await getLotDetail(id);
  if (!lot) notFound();

  const [settings, sale] = await Promise.all([getSettings(), getSaleFor('lot', lot.id)]);

  const costCents = lot.lines.reduce((sum, line) => sum + line.priceCents, 0);
  const suggestedPrice = suggestedSalePriceCents(costCents, settings.target_margin_pct);
  const subject: SaleSubject = { kind: 'lot', id: lot.id, name: lot.name };
  const listed = lot.status === 'en_vente';
  const sold = lot.status === 'vendu';
  // A sold lot is a record: its units stay as they were.
  const editable = !sold;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href="/ventes" className="text-sm text-ink-muted hover:text-ink">
          ← Ventes
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{lot.name}</h1>
          <span
            className={`rounded-md px-2 py-1 text-xs font-medium ${LOT_STATUS_TONES[lot.status]}`}
          >
            {LOT_STATUS_LABELS[lot.status]}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {lot.lines.length} unité{lot.lines.length > 1 ? 's' : ''} · coût de revient{' '}
          {formatPrice(costCents)}
          {listed && lot.listedAt ? ` · en vente depuis le ${formatDay(lot.listedAt)}` : ''}
        </p>
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Contenu du lot</h2>
          <span className="text-sm text-ink-muted">{formatPrice(costCents)}</span>
        </div>

        {lot.lines.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Lot vide. Ajoutez les unités qui partent ensemble ci-dessous : elles passent en
            « réservé » et ne sont plus proposées aux configurations.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {lot.lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                <Link href={`/stock/${line.inventoryItemId}`} className="shrink-0">
                  <ComponentImage
                    imagePath={line.imagePath}
                    alt={`${line.brand} ${line.model}`}
                    className="size-12"
                  />
                </Link>
                <Link href={`/stock/${line.inventoryItemId}`} className="min-w-0 flex-1">
                  <span className="block text-xs text-ink-muted">
                    {CATEGORY_LABELS[line.category]} · {line.brand} ·{' '}
                    {CONDITION_LABELS[line.condition]}
                  </span>
                  <span className="block truncate font-medium hover:underline">{line.model}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {line.summary.join(' · ')}
                  </span>
                </Link>
                <span className="shrink-0 text-sm font-medium">
                  {formatPrice(line.priceCents)}
                </span>
                {editable ? (
                  <RemoveLotItem lineId={line.id} label={`${line.brand} ${line.model}`} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editable ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium">Ajouter une unité</h2>
          <LotPicker lotId={lot.id} />
        </Card>
      ) : null}

      {lot.lines.length > 0 || sale ? (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="font-medium">Vente</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Coût de revient : {formatPrice(costCents)} pour {lot.lines.length} unité
              {lot.lines.length > 1 ? 's' : ''}.
            </p>
          </div>

          {sale || listed || sold ? (
            <SaleForm
              subject={subject}
              costCents={costCents}
              suggestedPriceCents={suggestedPrice}
              askingPriceCents={lot.askingPriceCents}
              targetMarginPct={settings.target_margin_pct}
              defaultPlatformFeePct={settings.default_platform_fee_pct}
              sale={sale}
            />
          ) : (
            <ListForSale
              subject={subject}
              costCents={costCents}
              suggestedPriceCents={suggestedPrice}
              askingPriceCents={lot.askingPriceCents}
              targetMarginPct={settings.target_margin_pct}
            />
          )}

          {listed && !sale ? <Unlist subject={subject} /> : null}
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-4 font-medium">Informations</h2>
        <LotMetaForm lot={lot} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Zone sensible</h2>
        <p className="text-sm text-ink-muted">
          La suppression rend au stock toutes les unités du lot. La vente déjà enregistrée, elle,
          serait perdue.
        </p>
        <DeleteLot lot={lot} />
      </Card>
    </div>
  );
}
