CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'USER',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `avatarUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastLogin` DATETIME(3) NULL,
    `cleanupAfterDays` INTEGER NULL,
    `storageQuotaBytes` BIGINT NULL,
    `resetToken` VARCHAR(191) NULL,
    `resetTokenExpiry` DATETIME(3) NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AppSettings` (
    `id` VARCHAR(191) NOT NULL,
    `appName` VARCHAR(191) NOT NULL DEFAULT 'Filyo',
    `logoUrl` VARCHAR(191) NULL,
    `siteUrl` VARCHAR(191) NULL,
    `smtpHost` VARCHAR(191) NULL,
    `smtpPort` INTEGER NULL,
    `smtpFrom` VARCHAR(191) NULL,
    `smtpUser` VARCHAR(191) NULL,
    `smtpPass` VARCHAR(191) NULL,
    `smtpSecure` BOOLEAN NOT NULL DEFAULT true,
    `uploaderNameReq` VARCHAR(191) NOT NULL DEFAULT 'optional',
    `uploaderEmailReq` VARCHAR(191) NOT NULL DEFAULT 'optional',
    `uploaderMsgReq` VARCHAR(191) NOT NULL DEFAULT 'optional',
    `allowRegistration` BOOLEAN NOT NULL DEFAULT false,
    `cleanupAfterDays` INTEGER NULL,
    `maxFileSizeBytes` BIGINT NULL,
    `cfBypassEnabled` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `File` (
    `id` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` BIGINT NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `downloads` INTEGER NOT NULL DEFAULT 0,
    `maxDownloads` INTEGER NULL,
    `password` VARCHAR(191) NULL,
    `batchToken` VARCHAR(191) NULL,
    `hideFilenames` BOOLEAN NOT NULL DEFAULT false,
    `userId` VARCHAR(191) NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Share` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `fileId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `downloads` INTEGER NOT NULL DEFAULT 0,
    `maxDownloads` INTEGER NULL,
    `password` VARCHAR(191) NULL,
    `label` VARCHAR(191) NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UploadRequest` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NULL,
    `password` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `maxFiles` INTEGER NULL,
    `maxSizeBytes` BIGINT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `userId` VARCHAR(191) NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ReceivedFile` (
    `id` VARCHAR(191) NOT NULL,
    `uploadRequestId` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` BIGINT NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `uploaderName` VARCHAR(191) NULL,
    `uploaderEmail` VARCHAR(191) NULL,
    `message` VARCHAR(191) NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `User_email_key` ON `User`(`email`);
CREATE UNIQUE INDEX `Share_token_key` ON `Share`(`token`);
CREATE UNIQUE INDEX `UploadRequest_token_key` ON `UploadRequest`(`token`);

ALTER TABLE `File` ADD CONSTRAINT `File_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Share` ADD CONSTRAINT `Share_fileId_fkey`
    FOREIGN KEY (`fileId`) REFERENCES `File`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UploadRequest` ADD CONSTRAINT `UploadRequest_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ReceivedFile` ADD CONSTRAINT `ReceivedFile_uploadRequestId_fkey`
    FOREIGN KEY (`uploadRequestId`) REFERENCES `UploadRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

