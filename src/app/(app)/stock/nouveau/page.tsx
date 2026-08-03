import Link from 'next/link';
import { createInventoryItemAction } from '@/actions/inventory';
import { InventoryForm } from '@/components/inventory/inventory-form';
import { Alert, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { summarizeSpecs } from '@/lib/catalog/format';
import { getCatalogComponent } from '@/lib/catalog/queries';
import { imageUrl } from '@/lib/images/store';
import type { CatalogSearchHit } from '@/app/api/catalog/search/route';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Nouvel achat — PcPartLister' };

/** Today in the browser's calendar sense, formatted for <input type="date">. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default async function NewInventoryItemPage({
  searchParams,
}: {
  searchParams: Promise<{ modele?: string; ajoute?: string }>;
}) {
  await requireUser();
  const { modele, ajoute } = await searchParams;

  // Arriving from a catalog entry pre-selects the model.
  let preselected: CatalogSearchHit | null = null;
  if (modele) {
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

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href="/stock" className="text-sm text-ink-muted hover:text-ink">
          ← Stock
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Ajouter un achat</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Une entrée de stock = un exemplaire physique. Les specs et l’image sont héritées du
          modèle, rien à ressaisir.
        </p>
      </div>

      {ajoute === '1' ? <Alert tone="success">Unité enregistrée. Au suivant.</Alert> : null}

      <Card>
        <InventoryForm
          action={createInventoryItemAction}
          mode="create"
          submitLabel="Ajouter au stock"
          preselected={preselected}
          initial={{
            purchasePriceEur: '',
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
