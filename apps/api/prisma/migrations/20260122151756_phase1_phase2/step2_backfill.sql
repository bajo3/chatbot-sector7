-- Ahora SÍ se puede usar 'NEW' (porque step1 ya committeó)

UPDATE "Conversation"
SET "leadStatus" = 'NEW'
WHERE "leadStatus" = 'COLD'
  AND ("lastBotMsgAt" IS NULL)
  AND ("lastHumanMsgAt" IS NULL);
