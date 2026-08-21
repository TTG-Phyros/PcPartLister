import { NextResponse } from 'next/server';
import { assertSession } from '@/lib/auth/guard';
import { candidatesForSlot } from '@/lib/builds/queries';
import { BUILD_STATUSES } from '@/lib/builds/types';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@/lib/specs';

export const dynamic = 'force-dynamic';

/**
 * Parts offered for one slot. Specs travel with each candidate so the browser
 * grades compatibility itself: changing another slot re-grades the open list
 * instantly, with no round trip.
 */
export async function GET(request: Request) {
  try {
    await assertSession();
  } catch {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const url = new URL(request.url);
  const slot = url.searchParams.get('slot') ?? '';
  if (!COMPONENT_CATEGORIES.includes(slot as ComponentCategory)) {
    return NextResponse.json({ error: 'Emplacement inconnu' }, { status: 400 });
  }

  // Optional: without it the picker is told nothing and every owned unit is
  // offered, which is what a draft wants anyway.
  const rawStatus = url.searchParams.get('buildStatus');
  const buildStatus = BUILD_STATUSES.find((value) => value === rawStatus);

  const data = await candidatesForSlot(slot as ComponentCategory, {
    q: url.searchParams.get('q') ?? undefined,
    buildStatus,
  });

  return NextResponse.json(data);
}
