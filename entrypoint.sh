#!/bin/sh
set -e

# Fix permissions on the data volume and app directory at runtime (runs as root before dropping to node)
mkdir -p /data/uploads
chown -R node:node /data /app

# Run prisma db push as node user
# Exit code 139 = segfault of the schema engine binary on ARM64 after a successful push — safe to ignore
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

exec gosu node node dist/index.js
