'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { ActionState } from '@/actions/auth';
import { setInventoryStatusAction } from '@/actions/inventory';
import { ITEM_STATUSES, STATUS_LABELS, STATUS_TONES, type ItemStatus } from '@/lib/inventory/labels';
import { cn } from '@/components/ui';

/**
 * One-tap status change straight from the list: marking a part dead or back in
 * stock should not require opening its page.
 */
export function StatusSelect({ id, status }: { id: string; status: ItemStatus }) {
  const [, formAction] = useActionState<ActionState, FormData>(setInventoryStatusAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Keeps the select in sync when the server sends a different value back.
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (selectRef.current) selectRef.current.value = status;
  }, [status]);

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="id" value={id} />
      <select
        ref={selectRef}
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label="Statut"
        className={cn(
          'min-h-9 rounded-md border-0 px-2 py-1 text-xs font-medium outline-none',
          STATUS_TONES[status],
        )}
      >
        {ITEM_STATUSES.map((value) => (
          <option key={value} value={value} className="bg-surface text-ink">
            {STATUS_LABELS[value]}
          </option>
        ))}
      </select>
    </form>
  );
}
