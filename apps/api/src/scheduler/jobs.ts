import { env } from '../env.js';
import { scheduleFollowup } from '../queue/schedule.js';
import { prisma } from '../db/prisma.js';
import { minutesBetween } from '../utils/time.js';

type ConversationState = 'BOT_ON' | 'HUMAN_TAKEOVER';
type LeadStatus = 'NEW' | 'COLD' | 'WARM' | 'HOT_WAITING' | 'HOT' | 'HUMAN' | 'CLOSED_WON' | 'CLOSED_LOST' | 'HOT_LOST';

export type FollowupRequest = {
  conversationId: string;
  job: string;
  delayMs: number;
};

type DbLike = any;

/**
 * Run periodic jobs:
 * - return to bot after human inactivity
 * - retake if no human ever took it (lead caliente perdido)
 */
export async function runPeriodicJobs() {
  return runPeriodicJobsWithDb(prisma);
}

/**
 * Same jobs, but allowing the caller to pass a Prisma TransactionClient.
 * Returns follow-ups to schedule OUTSIDE the DB transaction.
 */
export async function runPeriodicJobsWithDb(db: DbLike): Promise<FollowupRequest[]> {
  const followups: FollowupRequest[] = [];
  await returnAfterHumanInactivity(db);
  await retakeUnclaimedHotLeads(db, followups);
  return followups;
}

export async function scheduleFollowups(followups: FollowupRequest[]) {
  if (!env.ENABLE_JOBS || !env.REDIS_URL) return;
  for (const f of followups) {
    await scheduleFollowup(f.conversationId, f.job as any, f.delayMs).catch(() => {
      // best-effort
    });
  }
}

async function returnAfterHumanInactivity(db: DbLike) {
  const mins = env.HUMAN_INACTIVITY_MINUTES;
  const now = new Date();

  const takeovers = await db.conversation.findMany({
    where: { state: 'HUMAN_TAKEOVER' as ConversationState },
    select: { id:true, lastHumanMsgAt:true, assignedUserId:true, waFrom:true }
  });

  for (const c of takeovers) {
    const lastHuman = c.lastHumanMsgAt;
    if (!lastHuman) continue; // handled by unclaimed job
    if (minutesBetween(now, lastHuman) >= mins) {
      await db.conversation.update({
        where: { id: c.id },
        data: { state: 'BOT_ON' as ConversationState, assignedUserId: null }
      });
      await db.conversationEvent.create({
        data: {
          conversationId: c.id,
          kind: 'AUTO_RETURN_TO_BOT_INACTIVITY',
          payload: { minutes: mins }
        }
      });
    }
  }
}

/**
 * If conversation is in HUMAN_TAKEOVER but nobody responded as human within UNCLAIMED_HOT_LEAD_MINUTES,
 * bot retakes and marks HOT_LOST (lead caliente perdido).
 */
async function retakeUnclaimedHotLeads(db: DbLike, followups: FollowupRequest[]) {
  const mins = env.UNCLAIMED_HOT_LEAD_MINUTES;
  const now = new Date();

  const candidates = await db.conversation.findMany({
    where: { state: 'HUMAN_TAKEOVER' as ConversationState, lastHumanMsgAt: null },
    select: { id:true, lastCustomerMsgAt:true, waFrom:true, leadStatus:true }
  });

  for (const c of candidates) {
    const lastCustomer = c.lastCustomerMsgAt;
    if (!lastCustomer) continue;
    if (minutesBetween(now, lastCustomer) >= mins) {
      await db.conversation.update({
        where: { id: c.id },
        data: { state: 'BOT_ON' as ConversationState, assignedUserId: null, leadStatus: 'HOT_LOST' as LeadStatus }
      });
      await db.conversationEvent.create({
        data: {
          conversationId: c.id,
          kind: 'AUTO_RETAKE_UNCLAIMED_HOT_LEAD',
          payload: { minutes: mins }
        }
      });

      // Optional follow-up job (requires Redis). Schedule outside DB tx.
      if (env.ENABLE_JOBS && env.REDIS_URL) {
        followups.push({ conversationId: c.id, job: 'HOT_LOST_REMINDER', delayMs: 2 * 60 * 60 * 1000 });
      }
    }
  }
}
