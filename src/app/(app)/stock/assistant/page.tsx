import Link from 'next/link';
import { PurchaseWizard } from '@/components/inventory/purchase-wizard';
import { requireUser } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Assistant de saisie — PcPartLister' };

/** Today in the browser's calendar sense, formatted for <input type="date">. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default async function PurchaseWizardPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/stock" className="text-sm text-ink-muted hover:text-ink">
          ← Stock
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Nouvel achat</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Quatre questions, une à la fois. Plusieurs pièces sous le même colis se saisissent à la
          suite, sans repasser par le début.
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Formulaire complet :{' '}
          <Link href="/stock/nouveau" className="text-ink underline underline-offset-4">
            un achat
          </Link>{' '}
          ·{' '}
          <Link href="/stock/arrivage" className="text-ink underline underline-offset-4">
            saisie groupée
          </Link>
          .
        </p>
      </div>

      <PurchaseWizard today={today()} />
    </div>
  );
}
