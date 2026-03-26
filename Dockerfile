# ================================================================
#  Filyo — Image unique frontend + backend
#  Un seul conteneur, un seul port (3001)
#  Le backend Fastify sert l'API ET les fichiers React statiques
# ================================================================

ARG BUILDPLATFORM

# ── Stage 1 : Build du frontend React/Vite ──────────────────────
FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --silent
COPY frontend/ ./
RUN npm run build

# ── Stage 2 : Build du backend TypeScript ───────────────────────
FROM --platform=$BUILDPLATFORM node:24-alpine AS backend-builder

RUN apk add --no-cache openssl

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --silent
COPY backend/ ./

ARG DB_PROVIDER=sqlite
RUN if [ "$DB_PROVIDER" = "mariadb" ]; then \
      cp prisma/schema.mariadb.prisma prisma/schema.prisma; \
      cp -r prisma/migrations-mariadb/. prisma/migrations/; \
    fi

RUN npm run build

# ── Stage 3 : Image de production ───────────────────────────────
FROM node:24-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
        dumb-init openssl gosu wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=backend-builder /app/backend/dist            ./dist
COPY --from=backend-builder /app/backend/prisma          ./prisma
COPY --from=backend-builder /app/backend/package.json    ./package.json

ARG DB_PROVIDER=sqlite
RUN npm install --omit=dev --silent \
    && npx prisma generate

COPY --from=frontend-builder /app/frontend/dist          ./public

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV UPLOAD_DIR=/data/uploads
ENV FRONTEND_DIST=/app/public
ARG DB_PROVIDER=sqlite
ENV DB_PROVIDER=${DB_PROVIDER}

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--", "/entrypoint.sh"]
