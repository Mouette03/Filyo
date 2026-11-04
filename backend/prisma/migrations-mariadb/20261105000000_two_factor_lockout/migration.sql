-- Blocage temporaire de la connexion 2FA après trop de codes erronés (par compte)

ALTER TABLE `User`
    ADD COLUMN `twoFactorFailedAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `twoFactorLockedUntil` DATETIME(3) NULL;
