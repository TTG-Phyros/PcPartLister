import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Used by the container healthcheck; intentionally reachable without a session. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: 'ok', database: 'up' });
  } catch (error) {
    return NextResponse.json(
      { status: 'degraded', database: 'down', error: String(error) },
      { status: 503 },
    );
  }
}
