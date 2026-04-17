-- Migration TUS : suppression du système de chunks maison, ajout du toggle CF bypass

-- Ajout de cfBypassEnabled dans AppSettings
ALTER TABLE `AppSettings` ADD COLUMN `cfBypassEnabled` BOOLEAN NOT NULL DEFAULT false;

-- Suppression de uploadChunkSizeMb
ALTER TABLE `AppSettings` DROP COLUMN `uploadChunkSizeMb`;

-- Suppression des tables chunked
DROP TABLE IF EXISTS `ChunkedUpload`;
DROP TABLE IF EXISTS `FileChunkedUpload`;
