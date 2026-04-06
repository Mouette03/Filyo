#!/bin/sh
set -e

# Reconstruction DATABASE_URL selon le mode
if [ -z "$DATABASE_URL" ]; then
  if [ -n "$DB_HOST" ]; then
    export DATABASE_URL="mysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-3306}/${DB_NAME}"
  else
    export DATABASE_URL="file:/data/filyo.db"
  fi
fi

# Fix permissions sur le volume data
mkdir -p /data/uploads
chown -R node:node /data

export NPM_CONFIG_UPDATE_NOTIFIER=false

set +e
gosu node npx prisma migrate deploy
PRISMA_EXIT=$?
set -e

if [ "$PRISMA_EXIT" -ne 0 ]; then
  echo "ERROR: prisma migrate deploy failed with exit code $PRISMA_EXIT"
  exit "$PRISMA_EXIT"
fi
echo "Prisma migrate deploy completed (exit: $PRISMA_EXIT)"

exec gosu node bash -c 'set -o pipefail; node dist/index.js 2>&1 | ./node_modules/.bin/pino-pretty'
