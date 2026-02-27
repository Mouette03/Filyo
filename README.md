# Filyo — Transfert de fichiers

Application de partage de fichiers **auto-hébergée**, sans stockage S3. Alternative à Palmr avec un design glassmorphism sombre et une fonctionnalité de **partage inversé**.

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| ↑ **Envoi de fichiers** | Upload multi-fichiers avec barre de progression |
| 🔒 **Protection** | Mot de passe optionnel par fichier/lien |
| ⏱ **Expiration** | 1h / 24h / 7j / 30j / jamais |
| ↓ **Max téléchargements** | Limite configurable par lien |
| ⇅ **Partage inversé** | Créer un lien pour recevoir des fichiers d'un tiers |
| 💬 **Info déposant** | Nom, email, message joint au dépôt |
| 📊 **Dashboard** | Gérer tous les envois & demandes de dépôt |
| 🐳 **Docker** | Images multi-arch (amd64 + arm64) |

## Lancement rapide

```bash
# 1. Copier la config
cp .env.example .env

# 2. Créer le dossier de données
mkdir -p ./data

# 3. Lancer avec docker-compose
docker compose up -d
```

L'application est disponible sur `http://localhost`.

## Architecture

```
filyo/
├── backend/         # Node.js + Fastify + Prisma + SQLite
│   ├── src/
│   │   ├── index.ts
│   │   ├── lib/prisma.ts
│   │   └── routes/
│   │       ├── files.ts          # Upload/download fichiers
│   │       ├── shares.ts         # Liens de partage
│   │       ├── uploadRequests.ts # Partage inversé
│   │       └── admin.ts          # Stats & cleanup
│   └── prisma/schema.prisma
│
├── frontend/        # React + TypeScript + Vite + Tailwind CSS
│   └── src/
│       ├── pages/
│       │   ├── HomePage.tsx          # Envoi de fichiers
│       │   ├── SharePage.tsx         # Téléchargement (lien public)
│       │   ├── RequestUploadPage.tsx # Dépôt via lien inversé (public)
│       │   ├── CreateRequestPage.tsx # Créer un lien de dépôt
│       │   └── DashboardPage.tsx     # Tableau de bord admin
│       └── api/client.ts
│
├── .github/workflows/docker.yml  # CI/CD → GHCR
├── docker-compose.yml
└── preview.html                  # Aperçu de l'interface (ouvrir dans le navigateur)
```

## Partage inversé

1. Allez sur **"Demande de dépôt"** → configurez titre, message, expiration, limite de fichiers
2. Partagez le lien `/r/<token>` avec votre contact
3. Il dépose ses fichiers (avec son nom, email, message optionnel)
4. Vous les retrouvez dans le **Dashboard** → onglet "Demandes de dépôt"

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `80` | Port exposé |
| `FRONTEND_URL` | `http://localhost` | URL publique |
| `DATA_PATH` | `./data` | Dossier données hôte |
| `LOG_LEVEL` | `info` | Niveau de log |

## CI/CD — GitHub Actions

Le workflow `.github/workflows/docker.yml` :
- **Lint + type-check** sur chaque push/PR
- **Build multi-arch** (amd64 + arm64) et push sur `ghcr.io`
- Tags automatiques : `latest`, `sha-xxxx`, et versions sémantiques (`v1.2.3`)
- **Release GitHub** avec `docker-compose.release.yml` joint en artifact sur chaque tag `v*`

```bash
# Utiliser une image de release spécifique
IMAGE_TAG=v1.0.0 docker compose up -d
```
