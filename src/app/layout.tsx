import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PcPartLister',
  description: 'Gestion de stock, configurations et rentabilité pour montage et revente de PC',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#12151c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
