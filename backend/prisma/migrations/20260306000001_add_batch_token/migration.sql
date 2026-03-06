-- AlterTable: add batchToken and hideFilenames to File
ALTER TABLE "File" ADD COLUMN "batchToken" TEXT;
ALTER TABLE "File" ADD COLUMN "hideFilenames" BOOLEAN NOT NULL DEFAULT false;
