#!/bin/sh
# Container entrypoint: bring the schema and seed data up to date, then start.
# Both steps are idempotent, so restarting the stack never duplicates anything.
set -e

echo "[entrypoint] running migrations..."
node /app/dist/migrate.js

echo "[entrypoint] running seed..."
node /app/dist/seed.js

echo "[entrypoint] starting app on port ${PORT:-3000}"
exec "$@"
