import { NextResponse } from 'next/server';
import { assertSession } from '@/lib/auth/guard';
import { contentTypeFor, readImage } from '@/lib/images/store';

export const dynamic = 'force-dynamic';

/**
 * Streams a component picture from the Docker volume. Behind the session check
 * like everything else: the volume is not exposed as static content.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    await assertSession();
  } catch {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { path: segments } = await context.params;
  const relativePath = segments.map(decodeURIComponent).join('/');

  const data = await readImage(relativePath);
  if (!data) return NextResponse.json({ error: 'Image introuvable' }, { status: 404 });

  const contentType = contentTypeFor(relativePath);

  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(data.byteLength),
      // Uploaded SVGs can embed scripts; this CSP neutralises them even when
      // the URL is opened directly instead of through an <img> tag.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      // Uploads carry a random suffix so their URL never changes content;
      // regenerated seed placeholders keep their path, hence the revalidation.
      'Cache-Control': 'private, max-age=3600, must-revalidate',
    },
  });
}
