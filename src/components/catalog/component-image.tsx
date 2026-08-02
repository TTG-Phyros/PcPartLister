import { imageUrl } from '@/lib/images/store';
import { cn } from '@/components/ui';

/**
 * Component picture. Served by /api/images from the Docker volume, so
 * next/image optimisation is off and a plain <img> is the right tool.
 */
export function ComponentImage({
  imagePath,
  alt,
  className,
}: {
  imagePath: string | null;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl(imagePath)}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn('rounded-lg bg-surface object-contain', className)}
    />
  );
}
