import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { catalogComponents, type CatalogComponent } from '@/lib/db/schema';
import type { ComponentCategory } from '@/lib/specs';

export type CatalogFilters = {
  q?: string;
  category?: ComponentCategory;
  brand?: string;
  socket?: string;
  limit?: number;
  offset?: number;
};

/**
 * Builds the WHERE clause shared by the list view and its count query.
 * Note: every value goes through a bound parameter, and Date values are never
 * interpolated into raw `sql` templates (postgres.js cannot type them there).
 */
function buildWhere(filters: CatalogFilters): SQL | undefined {
  const clauses: SQL[] = [];

  if (filters.q) {
    const pattern = `%${filters.q.trim()}%`;
    const match = or(
      ilike(catalogComponents.brand, pattern),
      ilike(catalogComponents.model, pattern),
      sql`${catalogComponents.specs}->>'chipset' ilike ${pattern}`,
    );
    if (match) clauses.push(match);
  }

  if (filters.category) clauses.push(eq(catalogComponents.category, filters.category));
  if (filters.brand) clauses.push(eq(catalogComponents.brand, filters.brand));

  if (filters.socket) {
    // A socket is either the component's own (CPU, motherboard) or one of the
    // sockets a cooler supports.
    const socket = filters.socket;
    const match = or(
      sql`${catalogComponents.specs}->>'socket' = ${socket}`,
      sql`${catalogComponents.specs}->'supportedSockets' @> ${JSON.stringify([socket])}::jsonb`,
    );
    if (match) clauses.push(match);
  }

  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

export async function searchCatalog(filters: CatalogFilters): Promise<CatalogComponent[]> {
  return db
    .select()
    .from(catalogComponents)
    .where(buildWhere(filters))
    .orderBy(
      asc(catalogComponents.category),
      asc(catalogComponents.brand),
      asc(catalogComponents.model),
    )
    .limit(filters.limit ?? 200)
    .offset(filters.offset ?? 0);
}

export async function countCatalog(filters: CatalogFilters): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogComponents)
    .where(buildWhere(filters));
  return rows[0]?.count ?? 0;
}

export async function getCatalogComponent(id: string): Promise<CatalogComponent | null> {
  const rows = await db
    .select()
    .from(catalogComponents)
    .where(eq(catalogComponents.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listBrands(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ brand: catalogComponents.brand })
    .from(catalogComponents)
    .orderBy(asc(catalogComponents.brand));
  return rows.map((r) => r.brand);
}

/** Distinct sockets present in the catalog, for the filter dropdown. */
export async function listSockets(): Promise<string[]> {
  const rows = await db.execute<{ socket: string }>(
    sql`select distinct value as socket from (
          select ${catalogComponents.specs}->>'socket' as value from ${catalogComponents}
          union all
          select jsonb_array_elements_text(${catalogComponents.specs}->'supportedSockets')
            from ${catalogComponents}
            where jsonb_typeof(${catalogComponents.specs}->'supportedSockets') = 'array'
        ) s
        where value is not null and value <> ''
        order by socket`,
  );
  return rows.map((r) => r.socket);
}

export async function countByCategory(): Promise<Record<string, number>> {
  const rows = await db
    .select({ category: catalogComponents.category, count: sql<number>`count(*)::int` })
    .from(catalogComponents)
    .groupBy(catalogComponents.category);
  return Object.fromEntries(rows.map((r) => [r.category, r.count]));
}
