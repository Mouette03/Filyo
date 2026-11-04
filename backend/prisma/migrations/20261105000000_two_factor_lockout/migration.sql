-- Blocage temporaire de la connexion 2FA après trop de codes erronés (par compte)

-- AlterTable
ALTER TABLE "User" ADD COLUMN "twoFactorFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "twoFactorLockedUntil" DATETIME;
