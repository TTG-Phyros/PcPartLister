import { redirect } from 'next/navigation';
import { firstLoginPasswordAction } from '@/actions/auth';
import { PasswordForm } from '@/components/auth/password-form';
import { Alert, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Première connexion — PcPartLister' };

export default async function FirstLoginPage() {
  const user = await requireUser();
  if (!user.mustChangePassword) redirect('/');

  return (
    <Card className="flex flex-col gap-4">
      <Alert tone="warning">
        Ce compte utilise encore son mot de passe initial. Choisissez-en un nouveau pour
        accéder à l’application.
      </Alert>
      <PasswordForm action={firstLoginPasswordAction} submitLabel="Définir mon mot de passe" />
    </Card>
  );
}
