import { sql } from 'drizzle-orm';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function countTables(): Promise<number> {
  const rows = await db.execute<{ count: string }>(
    sql`select count(*)::text as count from information_schema.tables where table_schema = 'public'`,
  );
  return Number(rows[0]?.count ?? 0);
}

export default async function DashboardPage() {
  const user = await requireUser();
  const tables = await countTables();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Connecté en tant que {user.email} ({user.role === 'admin' ? 'administrateur' : 'utilisateur'}).
        </p>
      </div>

      <Card>
        <h2 className="text-sm font-medium text-ink-muted">État de la base</h2>
        <p className="mt-2 text-ok">
          <span aria-hidden>● </span>
          Connectée — {tables} tables dans le schéma public
        </p>
      </Card>

      <Card>
        <h2 className="text-sm font-medium text-ink-muted">Prochaines étapes</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-ink-muted">
          <li>Étape 3 — catalogue de composants et images</li>
          <li>Étape 4 — gestion du stock</li>
          <li>Étape 5 — moteur de compatibilité</li>
          <li>Étape 6 — configurateur</li>
          <li>Étape 7 — ventes et rentabilité</li>
        </ul>
      </Card>
    </div>
  );
}
