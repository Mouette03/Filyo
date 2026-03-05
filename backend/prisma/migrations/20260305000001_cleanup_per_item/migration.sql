-- Ajout de cleanupAfterDays par fichier et par demande de dépôt
-- null = règle globale (AppSettings.cleanupAfterDays)
-- 0    = supprimer à l'expiration exacte
-- N    = supprimer N jours après l'expiration

ALTER TABLE "File" ADD COLUMN "cleanupAfterDays" INTEGER;
ALTER TABLE "UploadRequest" ADD COLUMN "cleanupAfterDays" INTEGER;
