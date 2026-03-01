#!/bin/sh
set -e

# Fix permissions on the data volume and app directory at runtime (runs as root before dropping to node)
mkdir -p /data/uploads
chown -R node:node /data /app

# Run prisma db push then start the app as the node user
exec su-exec node sh -c "npx prisma db push --accept-data-loss --skip-generate && node dist/index.js"
