import { NextResponse } from 'next/server';
import { assertSession } from '@/lib/auth/guard';
import { candidatesForLot } from '@/lib/lots/queries';

export const dynamic = 'force-dynamic';

/** Units free to join a lot: in stock, held by no configuration and no other lot. */
export async function GET(request: Request) {
  try {
    await assertSession();
  } catch {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const url = new URL(request.url);
  const results = await candidatesForLot(url.searchParams.get('q') ?? undefined);

  return NextResponse.json({ results });
}
