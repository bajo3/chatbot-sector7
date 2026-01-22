-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadStatus" ADD VALUE 'NEW';
ALTER TYPE "LeadStatus" ADD VALUE 'HUMAN';
ALTER TYPE "LeadStatus" ADD VALUE 'CLOSED_WON';
ALTER TYPE "LeadStatus" ADD VALUE 'CLOSED_LOST';

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "botPausedUntil" TIMESTAMP(3);
