import { NextResponse } from 'next/server';
import { assertSession } from '@/lib/auth/guard';
import { summarizeSpecs } from '@/lib/catalog/format';
import { searchCatalog } from '@/lib/catalog/queries';
import { countInStockByComponent } from '@/lib/inventory/queries';
import { imageUrl } from '@/lib/images/store';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';

export const dynamic = 'force-dynamic';

export type CatalogSearchHit = {
  id: string;
  category: ComponentCategory;
  brand: string;
  model: string;
  summary: string[];
  imageUrl: string;
  msrpCents: number | null;
  /** Units of this model currently in stock, shown as a hint in the picker. */
  inStock: number;
};

/** Backs the model picker in the stock form, and the configurator later on. */
export async function GET(request: Request) {
  try {
    await assertSession();
  } catch {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawCategory = url.searchParams.get('category') ?? undefined;
  const category = COMPONENT_CATEGORIES.includes(rawCategory as ComponentCategory)
    ? (rawCategory as ComponentCategory)
    : undefined;

  const [components, inStock] = await Promise.all([
    searchCatalog({
      q: url.searchParams.get('q') ?? undefined,
      category,
      limit: 25,
    }),
    countInStockByComponent(),
  ]);

  const results: CatalogSearchHit[] = components.map((component) => ({
    id: component.id,
    category: component.category,
    brand: component.brand,
    model: component.model,
    summary: summarizeSpecs(component.specs),
    imageUrl: imageUrl(component.imagePath),
    msrpCents: component.msrpCents,
    inStock: inStock[component.id] ?? 0,
  }));

  return NextResponse.json({ results });
}
