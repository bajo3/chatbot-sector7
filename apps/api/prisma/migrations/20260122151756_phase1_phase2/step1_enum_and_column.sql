-- 1) Agregar valores al enum (NO usar 'NEW' en ningún otro statement acá)

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

-- 2) Agregar la columna (esto NO usa el enum)
ALTER TABLE "Conversation"
ADD COLUMN IF NOT EXISTS "botPausedUntil" TIMESTAMP(3);
