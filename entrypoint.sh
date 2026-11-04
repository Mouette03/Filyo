#!/bin/sh
set -e

# Reconstruction DATABASE_URL selon le mode (MariaDB si DB_HOST, sinon SQLite).
# Calculée par dist/lib/databaseUrl.js, comme la commande de secours 2FA : DB_USER et
# DB_PASSWORD sont encodés, les caractères @ : / # ? % ne cassent donc plus l'URL.
if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL="$(node /app/dist/lib/databaseUrl.js)"
  export DATABASE_URL
fi

# Fix permissions sur le volume data
mkdir -p /data/uploads
chown -R node:node /data

set +e
gosu node /app/node_modules/.bin/prisma migrate deploy
PRISMA_EXIT=$?
set -e

if [ "$PRISMA_EXIT" -ne 0 ]; then
  echo "ERROR: prisma migrate deploy failed with exit code $PRISMA_EXIT"
  exit "$PRISMA_EXIT"
fi
echo "Prisma migrate deploy completed (exit: $PRISMA_EXIT)"

exec gosu node bash -c 'set -o pipefail; node dist/index.js 2>&1 | ./node_modules/.bin/pino-pretty'
