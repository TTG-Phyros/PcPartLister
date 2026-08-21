import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { catalogComponents } from '@/lib/db/schema';
import { generatePlaceholderImage } from '@/lib/images/ensure';
import type { ComponentCategory, ComponentSpecs } from '@/lib/specs';

export type CatalogIdentity = {
  category: ComponentCategory;
  brand: string;
  model: string;
  specs: ComponentSpecs;
  releaseYear: number | null;
  msrpCents: number | null;
};

export type UpsertedComponent = {
  id: string;
  imagePath: string | null;
  /** False when an identical model was already there and got reused. */
  created: boolean;
};

/**
 * The catalog entry a purchase points at, created if it does not exist yet.
 *
 * Picking up a part whose model is unknown must never become a detour through
 * the catalog, so both ways in — the stock form creating its model inline, and
 * the wizard resolving one before it can put it in a batch — land here.
 *
 * The natural key is (category, brand, model) compared without case, and an
 * existing row is reused rather than fought with: a second attempt after a
 * network hiccup has to be harmless, not a unique-index error.
 */
export async function findOrCreateCatalogComponent(
  identity: CatalogIdentity,
): Promise<UpsertedComponent> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: catalogComponents.id, imagePath: catalogComponents.imagePath })
      .from(catalogComponents)
      .where(
        sql`${catalogComponents.category} = ${identity.category}
            and lower(${catalogComponents.brand}) = ${identity.brand.toLowerCase()}
            and lower(${catalogComponents.model}) = ${identity.model.toLowerCase()}`,
      )
      .limit(1);
    if (existing) return { ...existing, created: false };

    // Only on the way in: a model that turns out to already exist keeps the
    // picture it already has, and no file is written for nothing.
    const imagePath = await generatePlaceholderImage(
      identity.category,
      identity.brand,
      identity.model,
    );

    const [created] = await tx
      .insert(catalogComponents)
      .values({
        category: identity.category,
        brand: identity.brand,
        model: identity.model,
        specs: identity.specs,
        imagePath,
        msrpCents: identity.msrpCents,
        releaseYear: identity.releaseYear,
      })
      .returning({ id: catalogComponents.id });

    return { id: created!.id, imagePath, created: true };
  });
}
