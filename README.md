# Filyo — Transfert de fichiers local & privé

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/release/Mouette03/Filyo?include_prereleases)](https://github.com/Mouette03/Filyo/releases)
[![Docker](https://img.shields.io/badge/Docker-multi--arch-2496ED?logo=docker&logoColor=white)](https://ghcr.io/mouette03/filyo)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Self-hosted](https://img.shields.io/badge/self--hosted-✓-success)](https://github.com/Mouette03/Filyo)
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/Mouette03/Filyo?utm_source=oss&utm_medium=github&utm_campaign=Mouette03%2FFilyo&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

Application de partage de fichiers **auto-hébergée**, sans stockage S3. Design glassmorphism sombre, interface bilingue (FR/EN), et fonctionnalité de **partage inversé**.

---

## 📸 Captures d'écran

| Page d'envoi | Tableau de bord |
|:---:|:---:|
| ![Page d'envoi](docs/screenshots/home.png) | ![Dashboard](docs/screenshots/dashboard.png) |

| Partage inversé | Profil utilisateur |
|:---:|:---:|
| ![Partage inversé](docs/screenshots/reverse-share.png) | ![Profil](docs/screenshots/profile.png) |

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| **Envoi de fichiers** | Upload multi-fichiers avec barre de progression et glisser-déposer |
| **Protection** | Mot de passe optionnel par fichier/lien |
| **Expiration** | 1h / 24h / 7j / 30j / jamais |
| **Max téléchargements** | Limite configurable par lien |
| **Envoi par email** | Envoi du lien de partage par email |
| **Partage inversé** | Créer un lien pour recevoir des fichiers d'un tiers |
| **Email partage inversé** | Envoi du lien de dépôt par email à un ou plusieurs destinataires |
| **Info déposant** | Nom, email, message joint au dépôt |
| **Dashboard** | Statistiques, fichiers envoyés & reçus, demandes de dépôt |
| **Multi-utilisateurs** | Rôles Admin/Utilisateur, gestion panneau admin |
| **Inscription libre** | Activation optionnelle depuis réglages |
| **Profil** | Avatar, nom, changement mot de passe |
| **Réglages** | Nom app, logo, SMTP, inscription, apparence |
| **Thèmes** | Sombre/Clair/Auto + couleurs personnalisables |
| **i18n** | Français + Anglais |
| **Docker** | Multi-arch (amd64/arm64), SQLite + MariaDB |

---

## 🚀 Lancement rapide

### SQLite (recommandé)

```bash
cp .env.example .env
docker compose up -d
```

### MariaDB (prod/multi-users)

```bash
cp .env.example .env
docker compose -f docker-compose.mariadb.yml up -d
```

**http://localhost:3001** → Crée ton compte admin au 1er lancement.

---

## 🌐 Reverse proxy (Traefik/Nginx)

Chemins relatifs → **zéro config** !

**Traefik** :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.filyo.rule=Host(`filyo.mondomaine.fr`)"
  - "traefik.http.services.filyo.loadbalancer.server.port=3001"
```

---

## 🔧 Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `JWT_SECRET` | *requis prod* | **À changer en prod !** |
| `LOG_LEVEL` | `info` | `silent|error|warn|info|debug` |
| `PORT` | `3001` | Port serveur |
| `DATA_PATH` | `./data` | Dossier données |

**SQLite** : `DATABASE_URL=file:/data/filyo.db`  
**MariaDB** : `DB_HOST`, `DB_USER`, `DB_PASSWORD`, etc.

---

## 🗄️ SQLite vs MariaDB

| | SQLite | MariaDB |
|---|---|---|
| **Setup** | ✅ Zéro dépendance | ⚠️ Conteneur DB |
| **Usage** | Personnel/familial | Prod/multi-users |
| **Image** | `:latest` | `:latest-mariadb` |
| **Backup** | Copier `filyo.db` | `mysqldump` |

---

## 📦 CI/CD GitHub Actions

- **Lint + type-check** (push/PR)
- **Build multi-arch** → `ghcr.io/mouette03/filyo`
- Tags : `latest`, `sha-xxxx`, `v1.0.3(-mariadb)`

```bash
docker pull ghcr.io/mouette03/filyo:v1.0.3
```

---

## 📜 Licences & Remerciements

### Licence Filyo
[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)

### Dépendances principales
| Projet | Licence | Rôle |
|--------|---------|------|
| [Fastify](https://github.com/fastify/fastify) | MIT | API |
| [Prisma](https://github.com/prisma/prisma) | Apache-2.0 | DB |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 | Code |
| [tsx](https://github.com/esbuild-kit/tsx) | MIT | Dev |
| [zod](https://github.com/colinhacks/zod) | MIT | Validation |

**100% permissif** — [Liste complète](backend/licenses.csv)

### 🙏 Merci à
- **Fastify Team** (perf ⚡)
- **Prisma** (ORM magique)
- **Microsoft** (TypeScript)
- 100+ mainteneurs open source !

*Généré 28/03/2026*
