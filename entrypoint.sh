#!/bin/sh
set -e

# Fix permissions on the data volume and app directory at runtime (runs as root before dropping to node)
mkdir -p /data/uploads
chown -R node:node /data /app

# Run prisma db push as node user
# Exit code 139 = segfault of the schema engine binary on ARM64 after a successful push — safe to ignore
export NPM_CONFIG_UPDATE_NOTIFIER=false

# Détecte si la base existe déjà (créée par db push, sans table _prisma_migrations)
DB_FILE=$(echo "$DATABASE_URL" | sed 's|file:||')
if [ -f "$DB_FILE" ]; then
  HAS_MIGRATIONS=$(gosu node npx prisma migrate status 2>&1 | grep -c "_prisma_migrations" || true)
  if [ "$HAS_MIGRATIONS" -eq 0 ]; then
    echo "Base existante détectée sans historique de migrations — marquage de la migration initiale..."
    gosu node npx prisma migrate resolve --applied "$(ls /app/prisma/migrations | head -1)"
  fi
fi

set +e
gosu node npx prisma migrate deploy
PRISMA_EXIT=$?
set -e

if [ "$PRISMA_EXIT" -ne 0 ]; then
  echo "ERROR: prisma migrate deploy failed with exit code $PRISMA_EXIT"
  exit "$PRISMA_EXIT"
fi
echo "Prisma migrate deploy completed (exit: $PRISMA_EXIT)"

exec gosu node node dist/index.js
