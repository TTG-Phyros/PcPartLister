import type { ComponentCategory } from '@/lib/specs';

/**
 * Deterministic placeholder artwork, generated locally so the app is fully
 * usable offline and every catalog entry always has a visual. Pure string
 * building: no network, no filesystem, no canvas.
 */

const CATEGORY_STYLE: Record<ComponentCategory, { label: string; accent: string }> = {
  cpu: { label: 'CPU', accent: '#4b8dff' },
  motherboard: { label: 'CARTE MÈRE', accent: '#22c98a' },
  ram: { label: 'MÉMOIRE', accent: '#b07cff' },
  gpu: { label: 'GPU', accent: '#ff5f6d' },
  storage: { label: 'STOCKAGE', accent: '#ffab40' },
  psu: { label: 'ALIMENTATION', accent: '#ffd54a' },
  case: { label: 'BOÎTIER', accent: '#8fa3bd' },
  cooling: { label: 'REFROIDISSEMENT', accent: '#3fd4e8' },
  misc: { label: 'DIVERS', accent: '#a6b3c4' },
};

const WIDTH = 640;
const HEIGHT = 480;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Greedy word wrap, so long model names stay inside the frame. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = '';

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  return lines.slice(0, maxLines);
}

export function buildPlaceholderSvg(input: {
  category: ComponentCategory;
  brand: string;
  model: string;
}): string {
  const style = CATEGORY_STYLE[input.category] ?? CATEGORY_STYLE.misc;
  const modelLines = wrapText(input.model, 22, 3);
  const firstLineY = HEIGHT / 2 + 16 - (modelLines.length - 1) * 20;

  const modelText = modelLines
    .map(
      (line, index) =>
        `<text x="${WIDTH / 2}" y="${firstLineY + index * 40}" text-anchor="middle" ` +
        `font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="34" ` +
        `font-weight="600" fill="#eef2f7">${escapeXml(line)}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${escapeXml(`${input.brand} ${input.model}`)}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#161a22"/>
  <rect x="24" y="24" width="${WIDTH - 48}" height="${HEIGHT - 48}" rx="18" fill="#1e2430" stroke="${style.accent}" stroke-opacity="0.45" stroke-width="2"/>
  <rect x="24" y="24" width="${WIDTH - 48}" height="8" rx="4" fill="${style.accent}"/>
  <text x="${WIDTH / 2}" y="118" text-anchor="middle" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="4" fill="${style.accent}">${escapeXml(style.label)}</text>
  <text x="${WIDTH / 2}" y="${firstLineY - 52}" text-anchor="middle" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="26" fill="#9aa7b8">${escapeXml(input.brand)}</text>
  ${modelText}
  <text x="${WIDTH / 2}" y="${HEIGHT - 56}" text-anchor="middle" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="16" fill="#6b7889">visuel de remplacement</text>
</svg>
`;
}
