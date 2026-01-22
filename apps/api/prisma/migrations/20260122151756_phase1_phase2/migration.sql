-- Phase 1+2: richer lead statuses + bot pause

DO $$ BEGIN
  ALTER TYPE "LeadStatus" ADD VALUE 'NEW';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "LeadStatus" ADD VALUE 'HUMAN';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "LeadStatus" ADD VALUE 'CLOSED_WON';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "LeadStatus" ADD VALUE 'CLOSED_LOST';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "botPausedUntil" TIMESTAMP(3);

-- Backfill: conversations without explicit stage become NEW only if they never had a bot/human msg.
-- We keep existing values to avoid breaking current production semantics.
UPDATE "Conversation"
SET "leadStatus" = 'NEW'
WHERE "leadStatus" = 'COLD'
  AND "lastBotMsgAt" IS NULL
  AND "lastHumanMsgAt" IS NULL;
