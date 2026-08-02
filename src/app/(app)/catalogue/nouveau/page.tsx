import Link from 'next/link';
import { createCatalogComponentAction } from '@/actions/catalog';
import { CatalogForm } from '@/components/catalog/catalog-form';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Nouveau composant — PcPartLister' };

export default async function NewCatalogComponentPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireUser();
  const { category } = await searchParams;

  const initialCategory = COMPONENT_CATEGORIES.includes(category as ComponentCategory)
    ? (category as ComponentCategory)
    : 'cpu';

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link
          href="/catalogue"
          className="text-sm text-ink-muted hover:text-ink"
        >
          ← Catalogue
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Ajouter un modèle</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Le catalogue décrit des modèles, pas des exemplaires. Les unités que vous possédez se
          créent dans le stock à partir de ces modèles.
        </p>
      </div>

      <Card>
        <CatalogForm
          action={createCatalogComponentAction}
          submitLabel="Créer le modèle"
          initial={{
            category: initialCategory,
            brand: '',
            model: '',
            releaseYear: '',
            msrpEur: '',
            specValues: {},
          }}
        />
      </Card>
    </div>
  );
}
