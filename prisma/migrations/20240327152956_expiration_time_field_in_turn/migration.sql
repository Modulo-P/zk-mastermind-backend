/*
  Warnings:

  - Added the required column `expirationTime` to the `Turn` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Turn" ADD COLUMN     "expirationTime" BIGINT NOT NULL;
