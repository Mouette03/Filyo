#!/bin/sh
set -e

# Fix permissions on the data volume and app directory at runtime (runs as root before dropping to node)
mkdir -p /data/uploads
chown -R node:node /data /app

# Run prisma db push as node user
# Exit code 139 = segfault of the schema engine binary on ARM64 after a successful push — safe to ignore
export NPM_CONFIG_UPDATE_NOTIFIER=false
set +e
su-exec node npx prisma db push --accept-data-loss --skip-generate
PRISMA_EXIT=$?
set -e

if [ "$PRISMA_EXIT" -ne 0 ] && [ "$PRISMA_EXIT" -ne 139 ]; then
  echo "ERROR: prisma db push failed with exit code $PRISMA_EXIT"
  exit "$PRISMA_EXIT"
fi

exec su-exec node node dist/index.js
