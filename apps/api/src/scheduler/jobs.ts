import { env } from '../env.js';
import { scheduleFollowup } from '../queue/schedule.js';
import { prisma } from '../db/prisma.js';
import { minutesBetween, isWithinHumanHours } from '../utils/time.js';

type ConversationState = 'BOT_ON' | 'HUMAN_TAKEOVER';
type LeadStatus = 'COLD' | 'WARM' | 'HOT_WAITING' | 'HOT' | 'HOT_LOST';

/**
 * Run periodic jobs:
 * - return to bot after human inactivity
 * - retake if no human ever took it (lead caliente perdido)
 */
export async function runPeriodicJobs() {
  await returnAfterHumanInactivity();
  await retakeUnclaimedHotLeads();
}

async function returnAfterHumanInactivity() {
  const mins = env.HUMAN_INACTIVITY_MINUTES;
  const now = new Date();

  const takeovers = await prisma.conversation.findMany({
    where: { state: 'HUMAN_TAKEOVER' as ConversationState },
    select: { id:true, lastHumanMsgAt:true, assignedUserId:true, waFrom:true }
  });

  for (const c of takeovers) {
    const lastHuman = c.lastHumanMsgAt;
    if (!lastHuman) continue; // handled by unclaimed job
    if (minutesBetween(now, lastHuman) >= mins) {
      await prisma.conversation.update({
        where: { id: c.id },
        data: { state: 'BOT_ON' as ConversationState, assignedUserId: null }
      });
      await prisma.conversationEvent.create({ data: { conversationId: c.id, kind:'AUTO_RETURN_TO_BOT_INACTIVITY', payload: { minutes: mins } } });
    }
  }
}

/**
 * If conversation is in HUMAN_TAKEOVER but nobody responded as human within UNCLAIMED_HOT_LEAD_MINUTES,
 * bot retakes and marks HOT_LOST (lead caliente perdido).
 */
async function retakeUnclaimedHotLeads() {
  const mins = env.UNCLAIMED_HOT_LEAD_MINUTES;
  const now = new Date();

  const candidates = await prisma.conversation.findMany({
    where: { state: 'HUMAN_TAKEOVER' as ConversationState, lastHumanMsgAt: null },
    select: { id:true, lastCustomerMsgAt:true, waFrom:true, leadStatus:true }
  });

  for (const c of candidates) {
    const lastCustomer = c.lastCustomerMsgAt;
    if (!lastCustomer) continue;
    if (minutesBetween(now, lastCustomer) >= mins) {
      await prisma.conversation.update({
        where: { id: c.id },
        data: { state: 'BOT_ON' as ConversationState, assignedUserId: null, leadStatus: 'HOT_LOST' as LeadStatus }
      });
      await prisma.conversationEvent.create({ data: { conversationId: c.id, kind:'AUTO_RETAKE_UNCLAIMED_HOT_LEAD', payload: { minutes: mins } } });

// Optional follow-up job (requires Redis)
if (env.ENABLE_JOBS && env.REDIS_URL) {
  // Reminder in 2 hours (tune as needed)
  await scheduleFollowup(c.id, 'HOT_LOST_REMINDER', 2 * 60 * 60 * 1000).catch(()=>{});
}


      // If it's outside hours, keep status HOT_LOST but bot can still answer next message.
      if (!isWithinHumanHours(new Date())) {
        await prisma.conversationEvent.create({ data: { conversationId: c.id, kind:'OUT_OF_HOURS_WHEN_RETAKE', payload: {} } });
      }
    }
  }
}
