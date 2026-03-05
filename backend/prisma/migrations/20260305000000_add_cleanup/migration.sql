-- AlterTable: ajout du champ cleanupAfterDays dans AppSettings
ALTER TABLE "AppSettings" ADD COLUMN "cleanupAfterDays" INTEGER;
