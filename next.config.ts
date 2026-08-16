import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Images are stored on a Docker volume and streamed by /api/images, never optimized
  // through next/image's remote loader.
  images: { unoptimized: true },
  serverExternalPackages: ['@node-rs/argon2', 'postgres'],
  experimental: {
    // Purchase forms may carry an uploaded component picture.
    serverActions: { bodySizeLimit: '8mb' },
  },
  // Account management moved out of the main navigation and into the profile
  // page; bookmarks on the old address keep working.
  async redirects() {
    return [{ source: '/admin/utilisateurs', destination: '/profil/comptes', permanent: true }];
  },
};

export default nextConfig;
