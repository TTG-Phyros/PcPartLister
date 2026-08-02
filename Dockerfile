# syntax=docker/dockerfile:1

# ── deps ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── builder ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Standalone Next output + bundled migrate/seed scripts.
RUN npm run build && npm run build:scripts

# ── runner ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    IMAGES_DIR=/app/data/images \
    SEED_DATA_DIR=/app/data/seed \
    MIGRATIONS_FOLDER=/app/drizzle

RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs

# Next.js standalone server (already ships its own traced node_modules).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migration/seed tooling: bundled scripts + SQL files + seed data.
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/data ./data
# Native module kept external from the esbuild bundle.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@node-rs ./node_modules/@node-rs

COPY --chown=nextjs:nodejs docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh \
 && mkdir -p /app/data/images \
 && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
VOLUME ["/app/data/images"]

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
