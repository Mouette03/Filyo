#!/bin/sh
set -e

# Fix permissions on the data volume at runtime (runs as root before dropping to node)
chown -R node:node /data

# Run prisma db push then start the app as the node user
exec su-exec node sh -c "npx prisma db push --accept-data-loss && node dist/index.js"
