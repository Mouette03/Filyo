-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" DATETIME,
    "cleanupAfterDays" INTEGER,
    "resetToken" TEXT,
    "resetTokenExpiry" DATETIME
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appName" TEXT NOT NULL DEFAULT 'Filyo',
    "logoUrl" TEXT,
    "siteUrl" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpFrom" TEXT,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "uploaderNameReq" TEXT NOT NULL DEFAULT 'optional',
    "uploaderEmailReq" TEXT NOT NULL DEFAULT 'optional',
    "uploaderMsgReq" TEXT NOT NULL DEFAULT 'optional',
    "allowRegistration" BOOLEAN NOT NULL DEFAULT false,
    "cleanupAfterDays" INTEGER,
    "maxFileSizeBytes" BIGINT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "path" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "maxDownloads" INTEGER,
    "password" TEXT,
    "batchToken" TEXT,
    "hideFilenames" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Share" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "maxDownloads" INTEGER,
    "password" TEXT,
    "label" TEXT,
    CONSTRAINT "Share_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UploadRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "maxFiles" INTEGER,
    "maxSizeBytes" BIGINT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    CONSTRAINT "UploadRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReceivedFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uploadRequestId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "path" TEXT NOT NULL,
    "uploaderName" TEXT,
    "uploaderEmail" TEXT,
    "message" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReceivedFile_uploadRequestId_fkey" FOREIGN KEY ("uploadRequestId") REFERENCES "UploadRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Share_token_key" ON "Share"("token");

-- CreateIndex
CREATE UNIQUE INDEX "UploadRequest_token_key" ON "UploadRequest"("token");
