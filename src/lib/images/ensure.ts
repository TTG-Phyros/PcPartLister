import type { ComponentCategory } from '@/lib/specs';
import { buildPlaceholderSvg } from './placeholder';
import { saveImage, uploadPath } from './store';

/**
 * Writes the generated placeholder for a model created from the UI, so a
 * hand-added component looks the same as a seeded one instead of falling back
 * to the generic "no image" visual.
 */
export async function generatePlaceholderImage(
  category: ComponentCategory,
  brand: string,
  model: string,
): Promise<string> {
  const svg = buildPlaceholderSvg({ category, brand, model });
  return saveImage(uploadPath(category, brand, model, '.svg'), svg);
}
