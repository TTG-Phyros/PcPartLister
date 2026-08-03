import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { Card } from '@/components/ui';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Connexion — PcPartLister' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (session) redirect('/');

  const { next } = await searchParams;
  const target = next?.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
    <Card>
      <LoginForm next={target} />
    </Card>
  );
}
