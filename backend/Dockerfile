# ---- Build stage ----
FROM node:20-alpine AS builder

RUN npm install -g npm@latest --quiet

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS runner

RUN apk add --no-cache dumb-init openssl su-exec

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Create entrypoint to fix permissions at runtime
RUN printf '#!/bin/sh\nset -e\nmkdir -p /data/uploads\nchown -R node:node /data /app\nexport NPM_CONFIG_UPDATE_NOTIFIER=false\nset +e\nsu-exec node npx prisma db push --accept-data-loss --skip-generate\nPRISMA_EXIT=$?\nset -e\nif [ "$PRISMA_EXIT" -ne 0 ] && [ "$PRISMA_EXIT" -ne 139 ]; then\n  echo "ERROR: prisma db push failed with exit code $PRISMA_EXIT"\n  exit "$PRISMA_EXIT"\nfi\nexec su-exec node node dist/index.js\n' > /entrypoint.sh && chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV DATABASE_URL=file:/data/filyo.db
ENV UPLOAD_DIR=/data/uploads

VOLUME ["/data"]

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--", "/entrypoint.sh"]
