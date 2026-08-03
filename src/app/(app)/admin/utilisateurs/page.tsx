import { asc } from 'drizzle-orm';
import { CreateUserForm, UserRowActions } from '@/components/admin/user-forms';
import { Card } from '@/components/ui';
import { requireAdmin } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Comptes — PcPartLister' };

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export default async function UsersAdminPage() {
  const admin = await requireAdmin();

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Comptes</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Il n’y a pas d’inscription publique : les comptes se créent uniquement ici.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="font-medium">Créer un compte</h2>
        <CreateUserForm />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{rows.length} compte(s)</h2>
        {rows.map((row) => (
          <Card key={row.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-medium break-all">{row.email}</p>
                <p className="text-xs text-ink-muted">
                  {row.role === 'admin' ? 'Administrateur' : 'Utilisateur'} · créé le{' '}
                  {dateFormat.format(row.createdAt)} · dernière connexion{' '}
                  {row.lastLoginAt ? dateFormat.format(row.lastLoginAt) : 'jamais'}
                </p>
              </div>
              {row.id === admin.id ? (
                <span className="rounded-md bg-surface-hover px-2 py-1 text-xs text-ink-muted">
                  vous
                </span>
              ) : null}
            </div>

            {row.id === admin.id ? null : (
              <UserRowActions userId={row.id} email={row.email} />
            )}
          </Card>
        ))}
      </section>
    </div>
  );
}
