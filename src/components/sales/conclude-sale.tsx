'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import type { SaleSubject } from '@/lib/sales/labels';
import { SaleForm } from './sale-form';

/**
 * The button that turns a listing into a sale. The form stays folded until it
 * is needed: the sales page is first a list of what is still waiting for a
 * buyer, not a wall of forms.
 */
export function ConcludeSale({
  subject,
  costCents,
  suggestedPriceCents,
  askingPriceCents,
  targetMarginPct,
  defaultPlatformFeePct,
}: {
  subject: SaleSubject;
  costCents: number;
  suggestedPriceCents: number;
  askingPriceCents: number | null;
  targetMarginPct: number;
  defaultPlatformFeePct: number;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button className="min-h-10 text-sm" onClick={() => setOpen(true)}>
        Conclure la vente
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Conclure la vente</h3>
        <Button variant="ghost" className="min-h-9 text-sm" onClick={() => setOpen(false)}>
          Fermer
        </Button>
      </div>
      <SaleForm
        subject={subject}
        costCents={costCents}
        suggestedPriceCents={suggestedPriceCents}
        askingPriceCents={askingPriceCents}
        targetMarginPct={targetMarginPct}
        defaultPlatformFeePct={defaultPlatformFeePct}
        sale={null}
      />
    </div>
  );
}
