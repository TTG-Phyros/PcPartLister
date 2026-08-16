import { and, eq, isNotNull } from 'drizzle-orm';
import Link from 'next/link';
import { createInventoryItemAction } from '@/actions/inventory';
import { InventoryForm } from '@/components/inventory/inventory-form';
import { Alert, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { summarizeSpecs } from '@/lib/catalog/format';
import { getCatalogComponent } from '@/lib/catalog/queries';
import { db } from '@/lib/db';
import { buildItems, builds } from '@/lib/db/schema';
import { imageUrl } from '@/lib/images/store';
import type { CatalogSearchHit } from '@/app/api/catalog/search/route';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Nouvel achat — PcPartLister' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Today in the browser's calendar sense, formatted for <input type="date">. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Euros as the price field wants them, from cents. */
function toEurField(cents: number | null): string {
  if (cents === null) return '';
  const euros = cents / 100;
  return Number.isInteger(euros) ? String(euros) : euros.toFixed(2);
}

/**
 * The build line this purchase is meant to fill, when the form was opened from
 * the shopping list. Only a line still waiting on a model qualifies: one that
 * already points at a unit has nothing left to complete.
 */
async function pendingLine(id: string) {
  const [row] = await db
    .select({
      lineId: buildItems.id,
      buildId: builds.id,
      buildName: builds.name,
      estimatedPriceCents: buildItems.estimatedPriceCents,
    })
    .from(buildItems)
    .innerJoin(builds, eq(builds.id, buildItems.buildId))
    .where(and(eq(buildItems.id, id), isNotNull(buildItems.catalogComponentId)))
    .limit(1);

  return row ?? null;
}

export default async function NewInventoryItemPage({
  searchParams,
}: {
  searchParams: Promise<{ modele?: string; ligne?: string; ajoute?: string }>;
}) {
  await requireUser();
  const { modele, ligne, ajoute } = await searchParams;

  // Arriving from a catalog entry pre-selects the model.
  let preselected: CatalogSearchHit | null = null;
  if (modele && UUID.test(modele)) {
    const component = await getCatalogComponent(modele);
    if (component) {
      preselected = {
        id: component.id,
        category: component.category,
        brand: component.brand,
        model: component.model,
        summary: summarizeSpecs(component.specs),
        imageUrl: imageUrl(component.imagePath),
        msrpCents: component.msrpCents,
        inStock: 0,
      };
    }
  }

  // Arriving from the shopping list pre-fills the estimate too, and the unit
  // will join the configuration the moment it is saved.
  const line = ligne && UUID.test(ligne) ? await pendingLine(ligne) : null;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={line ? '/configs/a-acheter' : '/stock'} className="text-sm text-ink-muted hover:text-ink">
          ← {line ? 'À acheter' : 'Stock'}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Ajouter un achat</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Une entrée de stock = un exemplaire physique. Les specs et l’image sont héritées du
          modèle, rien à ressaisir.
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Plusieurs pièces dans le même colis, pour un seul prix ?{' '}
          <Link href="/stock/arrivage" className="text-ink underline underline-offset-4">
            Passez à la saisie groupée
          </Link>
          .
        </p>
      </div>

      {ajoute === '1' ? <Alert tone="success">Unité enregistrée. Au suivant.</Alert> : null}

      {line ? (
        <Alert tone="info">
          Cet achat complétera{' '}
          <Link href={`/configs/${line.buildId}`} className="underline underline-offset-4">
            {line.buildName}
          </Link>{' '}
          : l’unité y remplacera la ligne « à acheter » dès l’enregistrement.
        </Alert>
      ) : null}

      <Card>
        <InventoryForm
          action={createInventoryItemAction}
          mode="create"
          submitLabel={line ? 'Ajouter au stock et à la config' : 'Ajouter au stock'}
          preselected={preselected}
          buildLineId={line?.lineId ?? null}
          initial={{
            purchasePriceEur: line ? toEurField(line.estimatedPriceCents) : '',
            purchaseDate: today(),
            platform: 'vinted',
            condition: 'bon',
            status: 'en_stock',
            listingUrl: '',
            shippingCarrier: '',
            trackingNumber: '',
            trackingUrl: '',
            expectedArrival: '',
            serialNumber: '',
            notes: '',
          }}
        />
      </Card>
    </div>
  );
}
