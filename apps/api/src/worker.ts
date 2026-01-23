 import { Worker } from 'bullmq';
import { env } from './env.js';
import { createRedisConnection } from './queue/redis.js';
import { prisma } from './db/prisma.js';
import { sendText } from './whatsapp/client.js';

if (!env.REDIS_URL) {
  console.error('REDIS_URL is missing. Worker cannot start.');
  process.exit(1);
}

const connection = createRedisConnection();

new Worker('followup', async (job) => {
  const data = job.data as { conversationId: string; kind: string };
  const convo = await prisma.conversation.findUnique({ where: { id: data.conversationId } });
  if (!convo) return;

  if (data.kind === 'HOT_LOST_REMINDER') {
    const txt = 'Te escribo por si quedó pendiente 🙌 ¿Querés que te pase stock/precio actualizado o cuotas?';
    await sendText({ to: convo.waFrom, text: txt, preview_url: false });
    await prisma.message.create({ data: { conversationId: convo.id, direction:'OUT', sender:'BOT', type:'TEXT', text: txt } });
    await prisma.conversationEvent.create({ data: { conversationId: convo.id, kind:'JOB_SENT_HOT_LOST_REMINDER', payload: {} } });
  }

  if (data.kind === 'AFTER_HOURS_FOLLOWUP') {
    const txt = 'Ya estamos en horario 👋 ¿Querés que un asesor te ayude a cerrar la compra?';
    await sendText({ to: convo.waFrom, text: txt, preview_url: false });
    await prisma.message.create({ data: { conversationId: convo.id, direction:'OUT', sender:'BOT', type:'TEXT', text: txt } });
    await prisma.conversationEvent.create({ data: { conversationId: convo.id, kind:'JOB_SENT_AFTER_HOURS', payload: {} } });
  }
}, { connection });

console.log('Worker running (followup)');
