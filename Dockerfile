# ================================================================
#  Filyo — Image unique frontend + backend
#  Un seul conteneur, un seul port (3001)
#  Le backend Fastify sert l'API ET les fichiers React statiques
# ================================================================

# Permet aux stages de build de tourner nativement (évite QEMU / Illegal instruction)
ARG BUILDPLATFORM

# ── Stage 1 : Build du frontend React/Vite ──────────────────────
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend-builder

RUN npm install -g npm@latest --quiet

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --silent
COPY frontend/ ./
RUN npm run build


# ── Stage 2 : Build du backend TypeScript ───────────────────────
FROM --platform=$BUILDPLATFORM node:20-alpine AS backend-builder

RUN npm install -g npm@latest --quiet
RUN apk add --no-cache openssl

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --silent
COPY backend/ ./
RUN npm run build


# ── Stage 3 : Image de production ───────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache dumb-init openssl su-exec

WORKDIR /app

# Backend compilé
COPY --from=backend-builder /app/backend/dist            ./dist
COPY --from=backend-builder /app/backend/node_modules    ./node_modules
COPY --from=backend-builder /app/backend/prisma          ./prisma
COPY --from=backend-builder /app/backend/package.json    ./package.json

# Frontend buildé (servi par Fastify)
COPY --from=frontend-builder /app/frontend/dist          ./public

# Script d'entrypoint (corrige les permissions du volume au démarrage)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV DATABASE_URL=file:/data/filyo.db
ENV UPLOAD_DIR=/data/uploads
ENV FRONTEND_DIST=/app/public

VOLUME ["/data"]
EXPOSE 3001

# L'entrypoint tourne en root pour fixer /data, puis bascule sur node via su-exec
ENTRYPOINT ["dumb-init", "--", "/entrypoint.sh"]
