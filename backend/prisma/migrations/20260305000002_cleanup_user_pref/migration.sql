-- Ajout de la préférence de nettoyage par utilisateur
-- L'admin définit un maximum dans AppSettings.cleanupAfterDays
-- Chaque utilisateur choisit sa propre valeur ≤ ce maximum

ALTER TABLE "User" ADD COLUMN "cleanupAfterDays" INTEGER;

-- Note : les colonnes File.cleanupAfterDays et UploadRequest.cleanupAfterDays
-- ajoutées dans la migration précédente (20260305000001) ne sont plus utilisées
-- par Prisma. SQLite ne supporte pas DROP COLUMN facilement ; elles restent
-- dans la base mais sont ignorées par l'ORM.
