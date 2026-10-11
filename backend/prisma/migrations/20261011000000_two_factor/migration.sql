-- Double authentification (TOTP), codes de secours et révocation des sessions

-- AlterTable
ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "twoFactorSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "twoFactorPendingSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "twoFactorPendingExpiry" DATETIME;
ALTER TABLE "User" ADD COLUMN "twoFactorLastUsedStep" INTEGER;
ALTER TABLE "User" ADD COLUMN "twoFactorEnabledAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TwoFactorRecoveryCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwoFactorRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TwoFactorChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwoFactorChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryCode_userId_idx" ON "TwoFactorRecoveryCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorChallenge_tokenHash_key" ON "TwoFactorChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "TwoFactorChallenge_userId_idx" ON "TwoFactorChallenge"("userId");
