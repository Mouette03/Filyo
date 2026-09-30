# Correctifs de sécurité du conteneur, septembre 2026

## Périmètre

Cette branche prépare une image corrigée. Elle ne publie aucune image, ne modifie
aucune base de production et ne garantit pas que les images déjà déployées sont
corrigées. Après revue, reconstruire, scanner et déployer une nouvelle image.

## Changements

- Les dépendances frontend et backend sont verrouillées par `package-lock.json`.
  Docker et les workflows utilisent `npm ci`.
- Le stage final installe ses propres dépendances natives sur l'architecture cible
  et glibc. Il ne récupère pas les `node_modules` du builder Alpine.
- npm, npx, Yarn et le cache npm sont retirés du système de fichiers final après
  installation. Prisma reste une dépendance de production.
- L'entrypoint appelle `/app/node_modules/.bin/prisma migrate deploy` directement.
  Le comportement d'arrêt sur erreur de migration est conservé.
- Les builds de publication demandent une base actualisée avec `pull: true`.
- Les audits npm de CI sont bloquants au seuil `high`.
- Une CI distincte construit les variantes SQLite et MariaDB, vérifie l'absence
  des gestionnaires de paquets, le démarrage, une requête SQL et le redémarrage,
  puis scanne l'image avec Trivy. Elle ne se connecte pas à GHCR et ne publie rien.
  Le scan bloque les vulnérabilités HIGH/CRITICAL ayant un correctif connu ;
  ce filtre ne signifie pas qu'aucune autre vulnérabilité n'existe.

## Dépendances corrigées

- Nodemailer passe à `^10.0.13`. La v10 nécessite Node >=20, compatible avec
  Node 24 utilisé ici. Voir les
  [notes de version](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.0)
  et un des [avis corrigés](https://github.com/advisories/GHSA-v53p-9fqp-m79j).
- `@prisma/adapter-mariadb` utilise temporairement `mariadb@3.4.7` via un override
  ciblé plutôt que sa dépendance exacte `3.4.5`.
  [Avis MariaDB](https://github.com/advisories/GHSA-cqhc-2h57-wpxf).
- `prisma` utilise temporairement `mysql2@3.24.5` via un override ciblé plutôt que
  `3.15.3`.
  [Avis MySQL2](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr).
- `@prisma/config` utilise temporairement `deepmerge-ts@8.0.2` plutôt que `7.1.5`.
  Cette montée majeure change notamment la fusion des Map ; elle n'est pas
  présentée comme universellement compatible. Le chargement de la configuration,
  la génération et les migrations SQLite du projet sont testés.
  [Avis](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) et
  [changements v8](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0).

Retirer les overrides lorsque Prisma embarquera des versions corrigées, après
régénération du lockfile et validation des tests.

La résolution backend contient `fast-uri@3.1.8`/`4.2.1` et
`brace-expansion@5.0.12`. `tar`, `undici` et `ip-address` ne sont pas présents
comme paquets npm autonomes dans cet arbre applicatif. Cela ne constitue pas
un inventaire du binaire Node ou des images déjà publiées.

## Vérifications locales

Effectuées avec Node 24.21.0 et npm 11.21.0 :

- `npm ci` dans les deux projets.
- Builds TypeScript backend et TypeScript/Vite frontend réussis.
- 14 tests Zod réussis.
- `node --test test/security-smoke.test.mjs` : deux tests réussis.
  Les migrations SQLite sont lancées deux fois avec uniquement Node dans le PATH,
  puis le client Prisma effectue des requêtes. Le test Nodemailer compose un
  message localement et vérifie les options TLS sans envoyer d'e-mail.
- Audits npm complets backend/frontend : zéro vulnérabilité signalée au moment
  de la vérification, résultat dépendant de la base d'avis npm.
- Vérification syntaxique de l'entrypoint avec `sh -n`.

Docker n'étant pas disponible dans l'environnement local, les tests d'image et
MariaDB réel sont confiés au workflow `Container security and smoke tests`.
Ce workflow teste l'architecture native amd64 du runner ; arm64 doit encore être
validé avant une publication multiarchitecture.

## Publication après revue

Ne pas déduire l'état de l'image installée à partir du seul audit npm.
Vérifier les résultats du workflow, puis scanner également l'image finale et
l'architecture utilisées sur le serveur. Le workflow existant de publication
reste déclenché manuellement ou par tag ; pousser cette branche ne le déclenche
pas automatiquement.

Le Dockerfile secondaire `backend/Dockerfile` n'est pas utilisé par la publication
de l'image unique et n'est pas modernisé dans ce correctif.
