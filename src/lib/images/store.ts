import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Component pictures live on a Docker volume, outside the Next.js public
 * directory, and are streamed by /api/images behind the session check.
 */

export function imagesDir(): string {
  return process.env.IMAGES_DIR ?? path.resolve('data/images');
}

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/svg+xml': '.svg',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const EXTENSION_MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function contentTypeFor(relativePath: string): string {
  return EXTENSION_MIME[path.extname(relativePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Turns an untrusted stored path into an absolute one, or null when it tries to
 * escape the images directory. Every read goes through this.
 */
export function resolveImagePath(relativePath: string): string | null {
  if (!relativePath || relativePath.includes('\0')) return null;

  const root = path.resolve(imagesDir());
  const absolute = path.resolve(root, relativePath);
  const withinRoot = absolute === root || absolute.startsWith(root + path.sep);
  return withinRoot ? absolute : null;
}

/** Lowercase ASCII slug, safe as a filename on every platform. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '') // strip combining accents left by NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function saveImage(relativePath: string, data: Buffer | string): Promise<string> {
  const absolute = resolveImagePath(relativePath);
  if (!absolute) throw new Error(`Invalid image path: ${relativePath}`);

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, data);
  return relativePath;
}

export async function readImage(relativePath: string): Promise<Buffer | null> {
  const absolute = resolveImagePath(relativePath);
  if (!absolute) return null;
  try {
    return await readFile(absolute);
  } catch {
    return null;
  }
}

export async function deleteImage(relativePath: string | null): Promise<void> {
  if (!relativePath) return;
  const absolute = resolveImagePath(relativePath);
  if (!absolute) return;
  await unlink(absolute).catch(() => {});
}

/** Storage path for a user upload; the random suffix avoids cache collisions. */
export function uploadPath(category: string, brand: string, model: string, ext: string): string {
  const name = slugify(`${brand}-${model}`) || 'composant';
  return `uploads/${slugify(category)}/${name}-${randomUUID().slice(0, 8)}${ext}`;
}

/** Public URL of a stored image, or a static fallback when there is none. */
export function imageUrl(relativePath: string | null | undefined): string {
  if (!relativePath) return '/placeholder.svg';
  return `/api/images/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
}
