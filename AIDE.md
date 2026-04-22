# Filyo — Notice complète de fonctionnement

Ce document explique tout le fonctionnement de Filyo : ce que c'est, comment le déployer, les variables de configuration, les limites, les fonctionnalités, les rôles utilisateurs, et le comportement interne de chaque partie. Il est destiné à toute personne, même débutante.

---

## Sommaire

1. [Qu'est-ce que Filyo ?](#1-quest-ce-que-filyo-)
2. [Architecture générale](#2-architecture-générale)
3. [Déploiement avec Docker](#3-déploiement-avec-docker)
4. [Variables d'environnement](#4-variables-denvironnement)
5. [Premier démarrage](#5-premier-démarrage)
6. [Rôles utilisateurs](#6-rôles-utilisateurs)
7. [Fonctionnalités principales](#7-fonctionnalités-principales)
8. [Partage de fichiers (envoi)](#8-partage-de-fichiers-envoi)
9. [Partage inversé (réception)](#9-partage-inversé-réception)
10. [Système d'upload TUS](#10-système-dupload-tus)
11. [Nettoyage automatique](#11-nettoyage-automatique)
12. [Quotas de stockage](#12-quotas-de-stockage)
13. [Configuration SMTP (emails)](#13-configuration-smtp-emails)
14. [Logo et personnalisation](#14-logo-et-personnalisation)
15. [Toutes les limites de l'application](#15-toutes-les-limites-de-lapplication)
16. [Structure des fichiers sur disque](#16-structure-des-fichiers-sur-disque)
17. [Base de données](#17-base-de-données)
18. [Sécurité](#18-sécurité)
19. [Health check](#19-health-check)

---

## 1. Qu'est-ce que Filyo ?

Filyo est une application web auto-hébergée de partage de fichiers. Elle permet à des utilisateurs connectés d'uploader des fichiers et de les partager via un lien public, et permet également de créer des **demandes de dépôt** (partage inversé) : vous envoyez un lien à quelqu'un, et cette personne vous dépose des fichiers sans avoir besoin de compte.

---

## 2. Architecture générale

```
Navigateur → Nginx (frontend React) → Backend Fastify (Node.js)
                                              ↓
                                        Base de données
                                     (SQLite ou MariaDB)
                                              ↓
                                      Stockage fichiers
                                         (/data/uploads)
```

- **Frontend** : application React compilée, servie en production directement par le backend Fastify (pas besoin de Nginx séparé).
- **Backend** : API REST en Node.js / Fastify, gère l'authentification, les fichiers, les partages, les demandes.
- **Base de données** : SQLite par défaut (un seul fichier, sans installation), ou MariaDB pour les environnements de production avec plusieurs utilisateurs actifs.
- **Stockage** : tous les fichiers sont stockés dans le dossier `/data/uploads` à l'intérieur du conteneur, mappé sur votre machine hôte.

---

## 3. Déploiement avec Docker

### Option 1 — SQLite (recommandée pour débuter)

```bash
# Créer un fichier .env
JWT_SECRET=une_chaine_aleatoire_de_32_caracteres_minimum
DATA_PATH=./data
PORT=3001

# Lancer
docker compose up -d
```

L'application est accessible sur `http://localhost:3001` (ou le port choisi).

### Option 2 — MariaDB (recommandée en production)

```bash
# Créer un fichier .env
JWT_SECRET=une_chaine_aleatoire_de_32_caracteres_minimum
DATA_PATH=./data
PORT=3001
DB_USER=filyo
DB_PASSWORD=mon_mot_de_passe
DB_ROOT_PASSWORD=root_secret
DB_NAME=filyo

# Lancer
docker compose -f docker-compose-mariadb.yml up -d
```

### Mettre à jour

```bash
docker compose pull
docker compose up -d
```

---

## 4. Variables d'environnement

Ces variables se mettent dans un fichier `.env` à la racine, ou directement dans le `docker-compose.yml`.

| Variable | Obligatoire | Valeur par défaut | Description |
|---|---|---|---|
| `JWT_SECRET` | **Oui** | — | Clé secrète pour signer les tokens de connexion. Doit faire au moins 32 caractères aléatoires. Ne jamais partager. |
| `PORT` | Non | `3001` | Port sur lequel le serveur écoute. |
| `HOST` | Non | `0.0.0.0` | Interface réseau d'écoute. `0.0.0.0` = toutes les interfaces. |
| `NODE_ENV` | Non | `production` | Mode d'exécution. `production` désactive le CORS et le logging coloré. |
| `DATA_PATH` | Non | `./data` | Dossier sur la machine hôte où sont stockées les données (base SQLite + fichiers uploadés). |
| `UPLOAD_DIR` | Non | `/data/uploads` | Chemin interne au conteneur pour les fichiers. Ne pas changer sauf cas particulier. |
| `LOG_LEVEL` | Non | `info` | Niveau de logs : `trace`, `debug`, `info`, `warn`, `error`. |
| `TRUST_PROXY` | Non | `false` | Mettre `true` si Filyo est derrière un reverse proxy (Nginx, Caddy, Cloudflare…). Permet de récupérer la vraie IP du client. |
| `FRONTEND_URL` | Non | `http://localhost:5173` | URL du frontend en développement (pour le CORS). Ignoré en production. |
| `UPLOAD_TIMEOUT_MS` | Non | `1800000` (30 min) | Durée max d'une connexion d'upload en millisecondes. Min : 60 000 (1 min), Max : 7 200 000 (2 h). |
| `REGISTER_DEFAULT_QUOTA` | Non | `500MB` | Quota de stockage attribué automatiquement aux nouveaux utilisateurs qui s'auto-inscrivent. Format : `500MB` ou `2GB`. |
| `TUS_EXPIRY` | Non | `1h` | Durée de vie d'un upload TUS incomplet (reprise possible pendant ce délai). Format : `30m`, `2h`. |
| `TUS_CHUNK_MB` | Non | `90` | Taille des chunks TUS en Mo, utilisée quand l'option **Optimisation Proxies & CDN** est activée. |
| `CLEANUP_INTERVAL` | Non | `1h` | Fréquence du job de nettoyage automatique. Format : `30m`, `2h`. |
| `DB_USER` | Non* | `filyo` | Utilisateur MariaDB (*obligatoire avec docker-compose-mariadb.yml). |
| `DB_PASSWORD` | Non* | `filyo` | Mot de passe MariaDB. |
| `DB_NAME` | Non* | `filyo` | Nom de la base MariaDB. |
| `DB_ROOT_PASSWORD` | Non* | `rootpass` | Mot de passe root MariaDB. |

---

## 5. Premier démarrage

Au premier lancement, **aucun compte n'existe**. Le frontend affiche une page de création du premier compte. Ce compte est automatiquement créé avec le rôle **ADMIN**. Tous les comptes suivants seront créés avec le rôle **USER**, sauf si un admin les crée manuellement et leur attribue le rôle ADMIN.

---

## 6. Rôles utilisateurs

| Rôle | Description |
|---|---|
| `ADMIN` | Accès complet : gestion de tous les utilisateurs, paramètres globaux, stats, nettoyage forcé, consultation de tous les fichiers. |
| `USER` | Peut uploader ses propres fichiers, créer des partages, créer des demandes de dépôt, gérer son profil. |

Un admin peut :
- Créer, modifier, désactiver ou supprimer des comptes
- Attribuer un quota de stockage par utilisateur
- Activer ou désactiver l'inscription libre
- Configurer le SMTP, le logo, le nom de l'application
- Déclencher un nettoyage manuel des fichiers expirés
- Voir les stats globales (nombre de fichiers, taille totale, espace disque)

---

## 7. Fonctionnalités principales

### Connexion et session
- Authentification par email + mot de passe
- Session stockée dans un cookie HTTP-only sécurisé, valide **7 jours**
- Réinitialisation de mot de passe par email (nécessite SMTP configuré), lien valable **1 heure**

### Profil
- Modifier son nom
- Changer son avatar (formats acceptés : PNG, JPG, JPEG, WEBP, GIF — max **3 Mo**)
- Changer son mot de passe (l'ancien est requis)

### Fichiers
- Upload de un ou plusieurs fichiers depuis le dashboard
- Chaque fichier reçoit un lien de partage public unique
- Options lors de l'upload :
  - **Expiration** : le lien expire après une durée choisie
  - **Limite de téléchargements** : le lien se désactive après N téléchargements
  - **Mot de passe** : protège le téléchargement
  - **Cacher les noms de fichiers** : le destinataire voit "Fichier caché.ext" au lieu du vrai nom

### Partage
- Chaque fichier a un token de partage unique (URL publique)
- Le propriétaire peut modifier la date d'expiration d'un fichier après upload
- Les fichiers uploadés en même temps forment un **lot** (batchToken) visible comme un groupe côté destinataire

---

## 8. Partage de fichiers (envoi)

**Côté uploader (utilisateur connecté) :**
1. Glisser-déposer ou sélectionner les fichiers sur le dashboard
2. Configurer expiration, limite de téléchargements, mot de passe, etc.
3. L'upload démarre via le protocole TUS (reprise possible en cas de coupure)
4. Un lien de partage est généré pour chaque fichier (ou pour le lot)

**Côté destinataire (sans compte) :**
1. Ouvre le lien de partage
2. Saisit le mot de passe si nécessaire
3. Clique sur Télécharger → le fichier est streamé directement depuis le serveur

---

## 9. Partage inversé (réception)

Le **partage inversé** (ou "Upload Request") permet de demander à quelqu'un de vous déposer des fichiers sans qu'il ait besoin d'un compte.

**Côté propriétaire (connecté) :**
1. Crée une demande avec un titre, un message optionnel, une expiration, un nombre max de fichiers, une taille max, un mot de passe optionnel
2. Partage le lien généré
3. Consulte les fichiers reçus dans son dashboard

**Côté déposant (sans compte, lien public) :**
1. Ouvre le lien de la demande
2. Saisit son nom, email, message si configuré comme requis
3. Sélectionne les fichiers et les envoie

**Champs du formulaire déposant** (configurables par l'admin globalement) :
- Nom : `hidden` (caché) / `optional` (facultatif) / `required` (obligatoire)
- Email : idem
- Message : idem

---

## 10. Système d'upload TUS

Filyo utilise le protocole **TUS** (Tus Resumable Upload Specification) pour tous les uploads. Ce protocole permet de **reprendre un upload interrompu** (coupure réseau, fermeture de l'onglet).

### Comment ça fonctionne

1. **POST** → le client annonce le fichier (taille, nom, métadonnées). Le serveur crée un "slot" d'upload et retourne un ID.
2. **PATCH** → le client envoie le contenu du fichier, en une seule fois ou morceau par morceau (chunks) si Optimisation Proxies & CDN activé.
3. **HEAD** → si l'upload est interrompu, le client demande combien d'octets ont déjà été reçus, puis reprend depuis là.

### Optimisation Proxies & CDN
Certains proxies et CDN (Cloudflare, Nginx, Vercel…) limitent la taille maximale d'une requête HTTP (ex : ~100 Mo sur Cloudflare gratuit). Cette option s'active dans les paramètres admin.

- **Option activée** : le frontend découpe automatiquement chaque fichier en morceaux de `TUS_CHUNK_MB` Mo (défaut : 90 Mo) avant envoi. Chaque morceau passe sous la limite du proxy, et le serveur TUS les réassemble.
- **Option désactivée** (par défaut) : chaque fichier est envoyé en une seule requête, sans découpage. À utiliser si Filyo est accessible directement sans proxy.

### Expiration des uploads incomplets
Un upload commencé mais jamais terminé est conservé pendant `TUS_EXPIRY` (défaut : 1 heure), puis supprimé automatiquement par le job de nettoyage.

---

## 11. Nettoyage automatique

Le nettoyage automatique supprime les fichiers **expirés** du disque et de la base de données.

### Règles
- L'admin définit un **délai de grâce global** (`cleanupAfterDays`) : combien de jours après l'expiration d'un fichier avant de le supprimer définitivement.
  - `null` : nettoyage automatique **désactivé globalement**
  - `0` : suppression dès l'expiration
  - `N` : suppression N jours après l'expiration

- Chaque utilisateur peut définir sa **préférence personnelle** (dans son profil), dans la limite du maximum admin.
  - `null` : suit le défaut admin
  - `0…N` : N jours (capé au max admin)

### Fréquence
- Le job tourne toutes les heures par défaut (configurable via `CLEANUP_INTERVAL`)
- Premier passage : 1 minute après le démarrage du serveur
- L'admin peut déclencher un **nettoyage forcé** depuis le panneau admin (ignore les délais de grâce, supprime tout ce qui est expiré immédiatement)

---

## 12. Quotas de stockage

Chaque utilisateur peut avoir un quota de stockage en octets. Le quota englobe :
- Les fichiers qu'il a uploadés lui-même
- Les fichiers reçus via ses demandes de dépôt

| Situation | Comportement |
|---|---|
| Quota = `null` | Stockage illimité |
| Quota dépassé | L'upload est refusé avec le code `QUOTA_EXCEEDED` |
| Quota presque atteint | L'upload est refusé si le fichier entrant dépasse le quota restant |

**Attribution du quota :**
- Admin créant un compte manuellement : quota libre (null par défaut)
- Auto-inscription (inscription libre activée) : quota défini par `REGISTER_DEFAULT_QUOTA` (défaut : 500 Mo)
- L'admin peut modifier le quota de n'importe quel utilisateur à tout moment

---

## 13. Configuration SMTP (emails)

Le SMTP est nécessaire uniquement pour la **réinitialisation de mot de passe** et l'**envoi de partage par email**.

Configurable dans le panneau admin → Paramètres → SMTP :
- Hôte SMTP (ex: `smtp.gmail.com`)
- Port (défaut : 587)
- Email expéditeur
- Nom d'utilisateur et mot de passe (stockés chiffrés en base avec `JWT_SECRET` comme clé)
- Mode sécurisé TLS : activé par défaut

Le mot de passe SMTP est chiffré en AES avant stockage. Si `JWT_SECRET` change, il faudra re-saisir le mot de passe SMTP.

---

## 14. Logo et personnalisation

L'admin peut :
- Changer le **nom de l'application** (affiché dans l'interface)
- Uploader un **logo** (affiché dans la barre de navigation)
- Définir l'**URL publique** du site (utilisée dans les emails envoyés)

**Formats de logo acceptés :** PNG, JPG, JPEG, WEBP, GIF, **SVG** (y compris SVG animés)

- Les images non-SVG sont converties en PNG par le serveur
- Les SVG sont sauvegardés tels quels (animations préservées)
- Taille max du logo : **3 Mo**

---

## 15. Toutes les limites de l'application

### Limites de taille

| Élément | Limite | Configurable ? |
|---|---|---|
| Taille max par fichier uploadé | Par défaut **illimitée** | Oui, dans les paramètres admin (en octets) |
| Taille max d'un avatar | **3 Mo** | Non (codé en dur) |
| Taille max d'un logo | **3 Mo** | Non (codé en dur) |
| Taille max totale par requête HTTP | **10 Go** | Non (bodyLimit Fastify) |
| Taille max d'un chunk TUS (Proxies & CDN) | `TUS_CHUNK_MB` × 1 Mo (**90 Mo** par défaut) | Oui, via variable d'environnement |

### Limites de durée

| Élément | Limite par défaut | Configurable ? |
|---|---|---|
| Durée max d'une connexion d'upload | **30 minutes** | Oui, `UPLOAD_TIMEOUT_MS` (min 1 min, max 2 h) |
| Durée de vie d'un upload TUS incomplet | **1 heure** | Oui, `TUS_EXPIRY` |
| Durée de validité d'un token de session (JWT) | **7 jours** | Non (codé en dur) |
| Durée de validité d'un lien de réinitialisation de mot de passe | **1 heure** | Non (codé en dur) |

### Rate limiting (protection contre les abus)

Le rate limiting bloque temporairement une IP qui fait trop de requêtes en trop peu de temps. Les compteurs se remettent à zéro après la fenêtre de temps.

| Route | Limite | Fenêtre | Clé de comptage |
|---|---|---|---|
| **Défaut global** (toutes les routes non spécifiées) | 200 req | 1 minute | IP |
| `POST /api/auth/login` | 5 tentatives | 1 minute | IP |
| `POST /api/auth/forgot-password` | 5 tentatives | 5 minutes | IP |
| `POST /api/files/tus` (init upload dashboard) | 60 fichiers | 1 minute | IP + batchToken du lot |
| `ALL /api/files/tus/*` (chunks dashboard) | 200 req | 1 minute | IP |
| `POST /api/upload-requests/tus` (init upload partage inversé) | 60 fichiers | 1 minute | IP + token de la demande |
| `ALL /api/upload-requests/tus/*` (chunks partage inversé) | 300 req | 1 minute | IP |

**Explication du rate limit par `IP + token` :**
Deux personnes derrière la même connexion internet (même adresse IP publique) qui uploadent vers des **liens différents** ont chacune leur propre compteur et ne se bloquent pas mutuellement. Seules deux personnes sur la même IP uploadant vers le **même lien** partagent un compteur.

### Limites de validité des partages

Ces limites sont définies par l'utilisateur au moment de la création du partage :

| Paramètre | Description | Valeur possible |
|---|---|---|
| `expiresAt` | Date d'expiration du lien | Toute date future, ou null (jamais) |
| `maxDownloads` | Nombre max de téléchargements | Entier positif, ou null (illimité) |

### Limites des demandes de dépôt

Définies par l'utilisateur à la création de la demande :

| Paramètre | Description |
|---|---|
| `maxFiles` | Nombre max de fichiers acceptés au total dans la demande |
| `maxSizeBytes` | Taille max par fichier (la plus restrictive entre cette valeur et le max global admin s'applique) |
| `expiresAt` | Date d'expiration de la demande |
| `password` | Mot de passe requis pour déposer |

---

## 16. Structure des fichiers sur disque

Tout est stocké dans `DATA_PATH` sur la machine hôte, mappé sur `/data` dans le conteneur.

```
/data/
├── uploads/
│   ├── abc123xyz.pdf          ← fichiers uploadés depuis le dashboard
│   ├── def456uvw.jpg
│   ├── received/
│   │   └── <id_demande>/
│   │       └── recv_abc123.zip  ← fichiers reçus via partage inversé
│   ├── tus-files/
│   │   └── <upload_id>          ← uploads TUS dashboard en cours (temporaires)
│   ├── tus-requests/
│   │   └── <upload_id>          ← uploads TUS partage inversé en cours (temporaires)
│   ├── avatars/
│   │   └── avatar_<userId>_xxx.jpg
│   └── logos/
│       └── logo_xxx.png
└── filyo.db                   ← base de données SQLite (absente avec MariaDB)
```

Les dossiers `tus-files/` et `tus-requests/` contiennent les uploads en cours de transfert. Ils sont nettoyés automatiquement après `TUS_EXPIRY` (1 heure par défaut).

---

## 17. Base de données

### Modèles principaux

| Table | Description |
|---|---|
| `User` | Comptes utilisateurs (email, mot de passe hashé bcrypt, rôle, quota, avatar…) |
| `File` | Fichiers uploadés (nom, taille, chemin disque, expiration, téléchargements…) |
| `Share` | Liens de partage (token unique, mot de passe, expiration, compteur téléchargements) |
| `UploadRequest` | Demandes de dépôt (token, titre, expiration, max fichiers, mot de passe…) |
| `ReceivedFile` | Fichiers reçus via une demande (nom déposant, email, message, chemin disque…) |
| `AppSettings` | Paramètres globaux de l'application (singleton, un seul enregistrement) |

### SQLite vs MariaDB

| Critère | SQLite | MariaDB |
|---|---|---|
| Installation | Aucune (fichier unique) | Nécessite un conteneur supplémentaire |
| Adapté pour | Usage personnel, peu d'utilisateurs simultanés | Usage partagé, montée en charge |
| Fichier de données | `/data/filyo.db` | Dossier `/data/db/` |
| Configuration | `DATABASE_URL=file:/data/filyo.db` | Générée automatiquement depuis les variables `DB_*` |

---

## 18. Sécurité

- **Mots de passe** : hashés avec bcrypt (coût 12 pour les comptes, 10 pour les partages)
- **Tokens JWT** : signés avec `JWT_SECRET`, stockés dans un cookie `HttpOnly` (inaccessible au JavaScript)
- **Mot de passe SMTP** : chiffré en AES avec `JWT_SECRET` avant stockage en base
- **Headers HTTP** : Fastify Helmet active automatiquement les headers de sécurité (X-Frame-Options, X-Content-Type-Options, Referrer-Policy…)
- **IDOR** : chaque requête de fichier/résultat TUS vérifie que l'utilisateur est bien le propriétaire
- **Tokens de téléchargement** : les fichiers reçus ne sont jamais servis directement par URL — un token court-vivant est généré à la demande pour chaque téléchargement
- **Déconnexion mid-upload** : les déconnexions client en cours d'upload sont gérées proprement (code 499, pas d'erreur 500)

---

## 19. Health check

Le serveur expose un endpoint de santé :

```
GET /health
→ { "status": "ok", "version": "x.y.z" }
```

Docker Compose l'utilise toutes les 30 secondes pour vérifier que l'application répond. Si 3 vérifications échouent, le conteneur est considéré comme en mauvaise santé.
