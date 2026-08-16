import Link from 'next/link';
import { BatchForm } from '@/components/inventory/batch-form';
import { requireUser } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Saisie groupée — PcPartLister' };

/** Today in the browser's calendar sense, formatted for <input type="date">. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default async function NewPurchaseBatchPage() {
  await requireUser();

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href="/stock" className="text-sm text-ink-muted hover:text-ink">
          ← Stock
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Saisie groupée</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Plusieurs pièces achetées d’un coup : un seul colis à suivre, un seul prix à saisir.
          Chaque exemplaire devient une unité de stock à part entière, avec sa part du prix.
        </p>
      </div>

      <BatchForm today={today()} />
    </div>
  );
}
