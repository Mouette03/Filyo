-- Double authentification (TOTP), codes de secours et révocation des sessions

ALTER TABLE `User`
    ADD COLUMN `twoFactorEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `twoFactorSecret` VARCHAR(191) NULL,
    ADD COLUMN `twoFactorPendingSecret` VARCHAR(191) NULL,
    ADD COLUMN `twoFactorPendingExpiry` DATETIME(3) NULL,
    ADD COLUMN `twoFactorLastUsedStep` INTEGER NULL,
    ADD COLUMN `twoFactorEnabledAt` DATETIME(3) NULL,
    ADD COLUMN `sessionVersion` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `AppSettings`
    ADD COLUMN `twoFactorRequired` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `TwoFactorRecoveryCode` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `TwoFactorRecoveryCode_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TwoFactorChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `TwoFactorChallenge_tokenHash_key`(`tokenHash`),
    INDEX `TwoFactorChallenge_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TwoFactorRecoveryCode` ADD CONSTRAINT `TwoFactorRecoveryCode_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TwoFactorChallenge` ADD CONSTRAINT `TwoFactorChallenge_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
