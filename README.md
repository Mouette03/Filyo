# Filyo — Private & Local File Transfer / Transfert de fichiers local & privé

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/release/Mouette03/Filyo?include_prereleases)](https://github.com/Mouette03/Filyo/releases)
[![Docker](https://img.shields.io/badge/Docker-multi--arch-2496ED?logo=docker&logoColor=white)](https://ghcr.io/mouette03/filyo)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Self-hosted](https://img.shields.io/badge/self--hosted-✓-success)](https://github.com/Mouette03/Filyo)
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/Mouette03/Filyo?utm_source=oss&utm_medium=github&utm_campaign=Mouette03%2FFilyo&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

---

<details open>
<summary>🇬🇧 English</summary>

**Self-hosted** file sharing app, no S3 storage. Dark glassmorphism design, bilingual interface (FR/EN), and **reverse sharing** feature.

---

## 📸 Screenshots

| Upload page | Dashboard |
|:---:|:---:|
| ![Upload page](docs/screenshots/home.png) | ![Dashboard](docs/screenshots/dashboard.png) |

| Reverse sharing | User profile |
|:---:|:---:|
| ![Reverse sharing](docs/screenshots/reverse-share.png) | ![Profile](docs/screenshots/profile.png) |

---

## ✨ Features

| Feature | Description |
|---|---|
| **File upload** | Multi-file upload with progress bar and drag & drop |
| **Protection** | Optional password per file/link |
| **Expiration** | 1h / 24h / 7d / 30d / never |
| **Max downloads** | Configurable limit per link |
| **Email sharing** | Send share link by email |
| **Reverse sharing** | Create a link to receive files from others |
| **Reverse share email** | Send deposit link by email to one or more recipients |
| **Sender info** | Name, email, message attached to deposit |
| **Dashboard** | Stats, sent & received files, deposit requests |
| **Multi-user** | Admin/User roles, admin panel management |
| **Open registration** | Optionally enable public signup from settings |
| **Profile** | Avatar, display name, password change |
| **Settings** | App name, logo, SMTP, registration, appearance |
| **Themes** | Dark/Light/Auto + customizable accent colors |
| **i18n** | Fully translated in French and English |
| **Docker** | Multi-arch images (amd64 + arm64), SQLite and MariaDB variants |

---

## 🚀 Quick Start

### SQLite (recommended)

```bash
cp .env.example .env
docker compose up -d
```

### MariaDB (prod/multi-user)

```bash
cp .env.example .env
docker compose -f docker-compose.mariadb.yml up -d
```

**http://localhost:3001** → Create your admin account on first launch.

---

## 🌐 Reverse proxy (Traefik/Nginx)

Relative API paths → **zero config needed** !

**Traefik** :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.filyo.rule=Host(`filyo.yourdomain.com`)"
  - "traefik.http.services.filyo.loadbalancer.server.port=3001"
```

---

## 🔧 Environment variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | *required prod* | **Change in production!** |
| `LOG_LEVEL` | `info` | `silent\|error\|warn\|info\|debug` |
| `PORT` | `3001` | Server port |
| `DATA_PATH` | `./data` | Data folder |

**SQLite** : `DATABASE_URL=file:/data/filyo.db`
**MariaDB** : `DB_HOST`, `DB_USER`, `DB_PASSWORD`, etc.

---

## 🗄️ SQLite vs MariaDB

| | SQLite | MariaDB |
|---|---|---|
| **Setup** | ✅ Zero dependency | ⚠️ Separate container |
| **Use case** | Personal/family | Multi-user/production |
| **Docker image** | `:latest` | `:latest-mariadb` |
| **Backup** | Copy `filyo.db` | `mysqldump` |

---

## 📦 CI/CD GitHub Actions

- **Lint + type-check** (push/PR)
- **Multi-arch build** → `ghcr.io/mouette03/filyo`
- Tags: `latest`, `sha-xxxx`, `v1.0.3(-mariadb)`

```bash
docker pull ghcr.io/mouette03/filyo:v1.0.3
```

---

## 📜 Licenses & Credits

### Filyo License
[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
**Free for personal use. Modifications must be published if network access is provided (anti-resale protection).**

### Main dependencies

| Project | License | Role |
|--------|---------|------|
| **Backend** | | |
| [Fastify](https://github.com/fastify/fastify) | MIT | API Framework |
| [Prisma](https://github.com/prisma/prisma) | Apache-2.0 | Database |
| [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | MIT | Authentication |
| **Frontend** | | |
| [React](https://github.com/facebook/react) | MIT | UI |
| [TailwindCSS](https://github.com/tailwindlabs/tailwindcss) | MIT | Design |
| [Vite](https://github.com/vitejs/vite) | MIT | Build tool |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | State management |

**Full inventory**:
- [Backend](backend/licenses.csv) — API (100+ dependencies)
- [Frontend](frontend/licenses.csv) — UI (150+ dependencies)

**100% MIT/Apache/ISC** — permissive licenses, AGPL compatible.

### 🙏 Thanks to
- **Fastify Team** — Blazing fast API ⚡
- **Prisma Team** — Magic ORM ✨
- **React Team** — Modern UI
- **Tailwind Labs** — Glassmorphism design
- **100+ open source maintainers** !

*licenses.csv auto-updated via GitHub Actions*

</details>

---

<details>
<summary>🇫🇷 Français</summary>

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
| `LOG_LEVEL` | `info` | `silent\|error\|warn\|info\|debug` |
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
**Usage libre pour particuliers. Modifications publiées obligatoirement si accès réseau (anti-revente entreprise).**

### Dépendances principales

| Projet | Licence | Rôle |
|--------|---------|------|
| **Backend** | | |
| [Fastify](https://github.com/fastify/fastify) | MIT | API Framework |
| [Prisma](https://github.com/prisma/prisma) | Apache-2.0 | Base de données |
| [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | MIT | Authentification |
| **Frontend** | | |
| [React](https://github.com/facebook/react) | MIT | Interface |
| [TailwindCSS](https://github.com/tailwindlabs/tailwindcss) | MIT | Design |
| [Vite](https://github.com/vitejs/vite) | MIT | Build tool |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | State |

**Inventaire complet** :
- [Backend](backend/licenses.csv) — API (100+ dépendances)
- [Frontend](frontend/licenses.csv) — UI (150+ dépendances)

**100% MIT/Apache/ISC** — licences permissives et compatibles AGPL.

### 🙏 Remerciements
- **Fastify Team** — API ultra-performante ⚡
- **Prisma Team** — ORM magique ✨
- **React Team** — Interface moderne
- **Tailwind Labs** — Design glassmorphism
- **100+ mainteneurs** open source !

*licenses.csv auto-mis à jour via GitHub Actions*

</details>
