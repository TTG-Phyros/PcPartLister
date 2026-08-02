/**
 * Bundles the maintenance scripts into standalone JS so the runtime image can
 * run migrations and seeding without shipping devDependencies (tsx, drizzle-kit).
 */
import { build } from 'esbuild';

const entryPoints = ['scripts/migrate.ts', 'scripts/seed.ts'];

await build({
  entryPoints,
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
  // Native module: kept external and copied into the runtime image as-is.
  external: ['@node-rs/argon2'],
  banner: {
    // postgres.js and friends still reach for CommonJS globals in ESM output.
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
