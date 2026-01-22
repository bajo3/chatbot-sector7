import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../auth/middleware.js';
import { z } from 'zod';

export const metricsRouter = Router();
metricsRouter.use(requireAuth);

metricsRouter.get('/summary', async (req, res) => {
  const schema = z.object({ days: z.string().optional() });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const days = Math.min(90, Math.max(1, Number(parsed.data.days || 7)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totalConversations, openTakeovers] = await Promise.all([
    prisma.conversation.count({ where: { createdAt: { gte: since } } }),
    prisma.conversation.count({ where: { state: 'HUMAN_TAKEOVER' } })
  ]);

  const byLeadStatus = await prisma.conversation.groupBy({
    by: ['leadStatus'],
    _count: { _all: true },
    where: { createdAt: { gte: since } }
  });

  const byState = await prisma.conversation.groupBy({
    by: ['state'],
    _count: { _all: true },
    where: { createdAt: { gte: since } }
  });

  // Avg first response time (in seconds) for conversations created in range.
  // Uses messages table to compute first IN -> first OUT.
  const rows = await prisma.$queryRaw<
    { id: string; first_in: Date | null; first_out: Date | null }[]
  >`
    SELECT c."id" as id,
      MIN(CASE WHEN m."direction" = 'IN' THEN m."timestamp" END) as first_in,
      MIN(CASE WHEN m."direction" = 'OUT' THEN m."timestamp" END) as first_out
    FROM "Conversation" c
    JOIN "Message" m ON m."conversationId" = c."id"
    WHERE c."createdAt" >= ${since}
    GROUP BY c."id";
  `;

  let sum = 0;
  let n = 0;
  for (const r of rows) {
    if (r.first_in && r.first_out) {
      const diff = (new Date(r.first_out).getTime() - new Date(r.first_in).getTime()) / 1000;
      if (diff >= 0 && diff < 60 * 60 * 24) {
        sum += diff;
        n += 1;
      }
    }
  }
  const avgFirstResponseSec = n ? sum / n : null;

  return res.json({
    windowDays: days,
    since,
    totalConversations,
    openTakeovers,
    byLeadStatus,
    byState,
    avgFirstResponseSec
  });
});
