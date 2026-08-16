import { changePasswordAction, logoutAction } from '@/actions/auth';
import { PasswordForm } from '@/components/auth/password-form';
import { Button, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Profil — PcPartLister' };

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Card className="flex flex-col gap-2 text-sm">
        <Row label="Email" value={user.email} />
        <Row label="Rôle" value={user.role === 'admin' ? 'Administrateur' : 'Utilisateur'} />
        <Row
          label="Dernière connexion"
          value={user.lastLoginAt ? dateFormat.format(user.lastLoginAt) : '—'}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-medium">Changer le mot de passe</h2>
        <PasswordForm action={changePasswordAction} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Session</h2>
        <p className="text-sm text-ink-muted">
          La déconnexion supprime la session côté serveur, pas seulement le cookie.
        </p>
        <form action={logoutAction}>
          <Button variant="secondary" type="submit">
            Se déconnecter
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}
