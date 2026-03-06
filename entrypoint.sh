#!/bin/sh
set -e

# Fix permissions on the data volume and app directory at runtime (runs as root before dropping to node)
mkdir -p /data/uploads
chown -R node:node /data /app

# Run prisma db push as node user
# Exit code 139 = segfault of the schema engine binary on ARM64 after a successful push — safe to ignore
export NPM_CONFIG_UPDATE_NOTIFIER=false

# Si une base existante est trouvée (mise à jour, dev, db push antérieur…),
# on marque la migration comme appliquée pour éviter que Prisma tente de
# rejouer un CREATE TABLE sur des tables déjà présentes.
# P3008 = déjà enregistrée → normal, on continue.
INIT_MIGRATION="20260303000000_init"
DB_FILE=$(echo "$DATABASE_URL" | sed 's|file:||')
if [ -f "$DB_FILE" ]; then
  RESOLVE_OUT=$(gosu node npx prisma migrate resolve --applied "$INIT_MIGRATION" 2>&1) || RESOLVE_EXIT=$?
  if [ "${RESOLVE_EXIT:-0}" -ne 0 ]; then
    if echo "$RESOLVE_OUT" | grep -q "P3008"; then
      echo "Migration already recorded, nothing to do."
    else
      echo "$RESOLVE_OUT"
      exit 1
    fi
  else
    echo "Existing database detected — init migration marked as applied."
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
