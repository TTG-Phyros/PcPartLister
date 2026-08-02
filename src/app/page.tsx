import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function countTables(): Promise<number> {
  const rows = await db.execute<{ count: string }>(
    sql`select count(*)::text as count from information_schema.tables where table_schema = 'public'`,
  );
  return Number(rows[0]?.count ?? 0);
}

export default async function HomePage() {
  let status: { ok: true; tables: number } | { ok: false; error: string };
  try {
    status = { ok: true, tables: await countTables() };
  } catch (error) {
    status = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PcPartLister</h1>
        <p className="mt-1 text-sm text-(--color-ink-muted)">
          Stock, configurations et rentabilité — montage et revente de PC.
        </p>
      </div>

      <div className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface-raised) p-5">
        <h2 className="text-sm font-medium text-(--color-ink-muted)">État de la base</h2>
        {status.ok ? (
          <p className="mt-2 flex items-center gap-2 text-(--color-ok)">
            <span aria-hidden>●</span>
            Connectée — {status.tables} tables dans le schéma public
          </p>
        ) : (
          <p className="mt-2 text-(--color-danger)">
            <span aria-hidden>● </span>
            Injoignable : {status.error}
          </p>
        )}
      </div>

      <p className="text-sm text-(--color-ink-muted)">
        Étape 1 sur 7 : infrastructure et schéma de données. Les modules catalogue, stock,
        configurateur et ventes arrivent aux étapes suivantes.
      </p>
    </main>
  );
}
