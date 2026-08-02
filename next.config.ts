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
};

export default nextConfig;
