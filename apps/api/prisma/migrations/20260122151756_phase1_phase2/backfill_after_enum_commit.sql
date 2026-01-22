-- Corre DESPUÉS del ALTER TYPE (nuevo commit), para que Postgres ya permita usar 'NEW'

UPDATE "Conversation"
SET "leadStatus" = 'NEW'
WHERE "leadStatus" = 'COLD'
  AND ("lastBotMsgAt" IS NULL)
  AND ("lastHumanMsgAt" IS NULL);
