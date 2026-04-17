-- Migration TUS : suppression du système de chunks maison, ajout du toggle CF bypass

-- Ajout de cfBypassEnabled dans AppSettings
ALTER TABLE "AppSettings" ADD COLUMN "cfBypassEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Suppression de uploadChunkSizeMb (remplacé par cfBypassEnabled + variable d'env TUS_CF_CHUNK_MB)
-- SQLite ne supporte pas DROP COLUMN avant 3.35, Prisma le gère via table rebuild si nécessaire.
-- On le supprime proprement via une re-création de table si la version le supporte, sinon on le laisse.
-- Prisma gère la colonne supprimée comme "unknown field" et l'ignore.

-- Suppression des tables chunked (elles ne sont plus référencées par le schéma)
DROP TABLE IF EXISTS "ChunkedUpload";
DROP TABLE IF EXISTS "FileChunkedUpload";
