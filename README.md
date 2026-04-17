# Filyo — Private & Local File Transfer / Transfert de fichiers local & privé

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/release/Mouette03/Filyo?include_prereleases)](https://github.com/Mouette03/Filyo/releases)
[![Docker](https://img.shields.io/badge/Docker-multi--arch-2496ED?logo=docker&logoColor=white)](https://ghcr.io/mouette03/filyo)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Self-hosted](https://img.shields.io/badge/self--hosted-✓-success)](https://github.com/Mouette03/Filyo)
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/Mouette03/Filyo?utm_source=oss&utm_medium=github&utm_campaign=Mouette03%2FFilyo&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)
[![Discord](https://img.shields.io/badge/Discord-Rejoindre-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/mD3fVBnr6)

---

> [!WARNING]
> **🇬🇧 Pre-release software** — This project is currently in pre-release. The database schema may change between versions without a migration path. If you encounter database errors or startup failures after updating, **a clean reinstall is required**: stop the containers, delete the data volume, and restart.
>
> **🇫🇷 Logiciel en pré-version** — Ce projet est actuellement en pré-release. Le schéma de base de données peut changer entre les versions sans chemin de migration. Si vous rencontrez des erreurs de base de données ou des échecs au démarrage après une mise à jour, **une réinstallation propre est nécessaire** : arrêtez les conteneurs, supprimez le volume de données et redémarrez.

---


<details open>
<summary>🇬🇧 English</summary>

> **Why Filyo?**
> I created this application because I couldn't find a simple file-sharing tool that suited my needs. So, I decided to build my own, with the help of AI.

**Self-hosted** file-sharing app, no S3 storage. Dark glassmorphism design, bilingual interface (FR/EN), and **reverse sharing** feature.

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
| **Rate limiting** | Brute-force protection on login, password reset and file deposit |
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
| **Per-user storage quota** | Admin can set a storage limit per user (MB/GB); enforced on upload to prevent disk saturation |
| **Encrypted SMTP password** | SMTP password stored encrypted in the database (AES-256-GCM, key derived from `JWT_SECRET`) |

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
| `JWT_SECRET` | *required, no default* | **Required — must be set before first launch.** Also used as the AES-256-GCM encryption key for the SMTP password stored in the database. |
| `PORT` | `3001` | Host port exposed by the container (internal port is always 3001) |
| `DATA_PATH` | `./data` | Data folder (database + uploads) |
| `LOG_LEVEL` | `info` | Minimum log level (Pino). The app emits `debug`, `info`, `warn`, `error`. Use `debug` for verbose output, `warn` for quiet, `silent` to disable all logs. |
| `UPLOAD_TIMEOUT_MS` | `1800000` | Upload timeout in ms (default 30 min, min 1 min, max 2 h) |
| `TRUST_PROXY` | `false` | Trust level for reverse proxy headers (`X-Forwarded-*`). Accepts `false`, `true`, an IP address, or a CIDR range (e.g. `127.0.0.1`). Enable only if Filyo is behind a trusted proxy. |

> [!NOTE]
> Any SMTP password saved through the settings form is stored **encrypted** in the database (AES-256-GCM, key derived from `JWT_SECRET`).
 **Rotating `JWT_SECRET` breaks existing encrypted passwords — you must re-enter the SMTP password in the settings after any key rotation.**

**SQLite** : `DATABASE_URL=file:/data/filyo.db`
**MariaDB** : `DB_HOST`, `DB_USER`, `DB_PASSWORD`, etc.

---

## 🛡️ Note on `TRUST_PROXY`

If you run Filyo behind a reverse proxy (Traefik, Nginx, etc.), set `TRUST_PROXY` in your environment or `.env` so the Fastify server trusts `X-Forwarded-*` headers and correctly obtains the client IP, protocol and origin. The provided Docker files default to `TRUST_PROXY=false`.

> [!WARNING]
> Only enable `TRUST_PROXY` if Filyo is **exclusively accessible through a trusted proxy** and not directly exposed to the internet. Without this precaution, malicious clients can forge `X-Forwarded-*` headers to bypass rate limiting or IP-based controls.

| Value | Behaviour |
|---|---|
| `false` | Default — no proxy trust |
| `true` | Trust all proxies (convenient but less secure) |
| `127.0.0.1` | Trust only localhost proxy (recommended) |
| `10.0.0.0/8` | Trust a specific IP range / CIDR |

---

## 🍪 Authentication cookie

Filyo stores the JWT in an **HttpOnly cookie** (named `token`) so it is never accessible from JavaScript, which prevents XSS-based token theft.

| Context | `secure` flag | `sameSite` flag |
|---|---|---|
| **Production** (`NODE_ENV=production`) | `true` — HTTPS only | `Strict` |
| **Development** (`NODE_ENV=development`) | `false` | `Lax` |

### Development (Vite + backend on separate ports)

Vite (port 5173) proxies API calls to the backend (port 3001). The `vite.config.ts` proxy handles this automatically — cookies are sent because both are treated as same-origin.

```ts
// vite.config.ts — already configured
server: {
  proxy: {
    '/api': 'http://localhost:3001'
  }
}
```

### Production (Docker)

In the default Docker image, frontend and backend share the same origin (port 3001), so cookies work out of the box without any additional configuration.

> [!WARNING]
> The cookie is automatically set to `secure: true` in production. Make sure Filyo is served over **HTTPS** in production, otherwise the browser will reject the cookie and users will not be able to log in.

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
- **100+ open-source maintainers** !

*licenses.csv auto-updated via GitHub Actions*

</details>

---


<details>
<summary>🇫🇷 Français</summary>

> **Pourquoi Filyo ?**
> J'ai créé cette application car je n'ai pas trouvé d'outil de partage de fichiers simple qui me convenait. J'ai donc décidé de la développer moi-même, avec l'aide de l'IA.

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
| **Limitation de débit** | Protection brute-force sur login, reset mot de passe et dépôt de fichiers |
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
| **Quota stockage par utilisateur** | L'administrateur peut définir une limite de stockage par utilisateur (MB/GB) ; appliquée lors des uploads pour éviter la saturation du disque |
| **Chiffrement mot de passe SMTP** | Mot de passe SMTP chiffré en base (AES-256-GCM, clé dérivée de `JWT_SECRET`) |

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
| `JWT_SECRET` | *obligatoire, aucun défaut* | **Obligatoire — à renseigner avant le premier lancement.** Sert aussi de clé AES-256-GCM pour chiffrer le mot de passe SMTP stocké en base. |
| `PORT` | `3001` | Port exposé sur l'hôte (le conteneur interne tourne toujours sur 3001) |
| `DATA_PATH` | `./data` | Dossier données (base de données + uploads) |
| `LOG_LEVEL` | `info` | Seuil minimum de log (Pino). Le code émet `debug`, `info`, `warn`, `error`. Utiliser `debug` pour plus de verbosité, `warn` pour le silence relatif, `silent` pour tout désactiver. |
| `UPLOAD_TIMEOUT_MS` | `1800000` | Délai d'attente des uploads (ms — défaut 30 min, min 1 min, max 2 h) |
| `TRUST_PROXY` | `false` | Niveau de confiance pour les en-têtes reverse proxy (`X-Forwarded-*`). Accepte `false`, `true`, une adresse IP ou une plage CIDR (ex. `127.0.0.1`). À activer uniquement si Filyo est derrière un proxy de confiance. |

> [!NOTE]
> Tout mot de passe SMTP enregistré via le formulaire de réglages est stocké **chiffré** en base de données (AES-256-GCM, clé dérivée de `JWT_SECRET`).
**Une rotation de `JWT_SECRET` invalide les mots de passe chiffrés existants — vous devez ressaisir le mot de passe SMTP dans les réglages après tout changement de clé.**

**SQLite** : `DATABASE_URL=file:/data/filyo.db`
**MariaDB** : `DB_HOST`, `DB_USER`, `DB_PASSWORD`, etc.

## 🛡️ Note sur `TRUST_PROXY`

Si vous exécutez Filyo derrière un reverse proxy (Traefik, Nginx, etc.), définissez `TRUST_PROXY` dans votre environnement ou votre fichier `.env` afin que le serveur Fastify fasse confiance aux en-têtes `X-Forwarded-*` et récupère correctement l'adresse IP du client, le protocole et l'origine. Les fichiers Docker fournis définissent par défaut `TRUST_PROXY=false`.

> [!WARNING]
> N'activez `TRUST_PROXY` que si Filyo est **exclusivement accessible via un proxy de confiance** et non exposé directement sur Internet. Sans cette précaution, des clients malveillants peuvent forger les en-têtes `X-Forwarded-*` pour contourner le rate limiting ou les contrôles basés sur l'IP.

| Valeur | Comportement |
|---|---|
| `false` | Défaut — aucune confiance proxy |
| `true` | Fait confiance à tous les proxies (pratique mais moins sécurisé) |
| `127.0.0.1` | Fait confiance uniquement au proxy local (recommandé) |
| `10.0.0.0/8` | Fait confiance à une plage IP / CIDR spécifique |

---

## 🍪 Cookie d'authentification

Filyo stocke le JWT dans un **cookie HttpOnly** (nommé `token`) afin qu'il ne soit jamais accessible depuis JavaScript, ce qui empêche le vol de token par XSS.

| Contexte | Flag `secure` | Flag `sameSite` |
|---|---|---|
| **Production** (`NODE_ENV=production`) | `true` — HTTPS uniquement | `Strict` |
| **Développement** (`NODE_ENV=development`) | `false` | `Lax` |

### Développement (Vite + backend sur des ports séparés)

Vite (port 5173) proxifie les appels API vers le backend (port 3001). Le proxy `vite.config.ts` gère cela automatiquement — les cookies sont envoyés car les deux sont traités comme étant de la même origine.

```ts
// vite.config.ts — déjà configuré
server: {
  proxy: {
    '/api': 'http://localhost:3001'
  }
}
```

### Production (Docker)

Dans l'image Docker par défaut, le frontend et le backend partagent la même origine (port 3001), donc les cookies fonctionnent sans configuration supplémentaire.

> [!WARNING]
> Le cookie est automatiquement défini avec `secure: true` en production. Assurez-vous que Filyo est servi en **HTTPS** en production, sinon le navigateur rejettera le cookie et les utilisateurs ne pourront pas se connecter.

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
