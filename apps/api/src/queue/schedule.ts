import { followupQueue } from './queues.js';

export async function scheduleFollowup(
  conversationId: string,
  kind: 'HOT_LOST_REMINDER'|'AFTER_HOURS_FOLLOWUP',
  delayMs: number
) {
  await followupQueue.add(kind, { conversationId, kind }, {
    delay: delayMs,
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000
  });
}
