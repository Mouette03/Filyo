# ================================================================
#  Filyo — Image unique frontend + backend
#  Un seul conteneur, un seul port (3001)
#  Le backend Fastify sert l'API ET les fichiers React statiques
# ================================================================

# ── Stage 1 : Build du frontend React/Vite ──────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --silent
COPY frontend/ ./
RUN npm run build


# ── Stage 2 : Build du backend TypeScript ───────────────────────
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --silent
COPY backend/ ./
RUN npx prisma generate
RUN npm run build


# ── Stage 3 : Image de production ───────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache dumb-init openssl

WORKDIR /app

# Backend compilé
COPY --from=backend-builder /app/backend/dist            ./dist
COPY --from=backend-builder /app/backend/node_modules    ./node_modules
COPY --from=backend-builder /app/backend/prisma          ./prisma
COPY --from=backend-builder /app/backend/package.json    ./package.json

# Frontend buildé (servi par Fastify)
COPY --from=frontend-builder /app/frontend/dist          ./public

# Dossier données
RUN mkdir -p /data/uploads \
    && chown -R node:node /data /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV DATABASE_URL=file:/data/filyo.db
ENV UPLOAD_DIR=/data/uploads
ENV FRONTEND_DIST=/app/public

VOLUME ["/data"]
EXPOSE 3001

USER node

ENTRYPOINT ["dumb-init", "--"]
# Synchronise le schéma sur la DB (crée les tables si besoin) puis démarre
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
