import { Queue } from 'bullmq';
import { createRedis } from './redis.js';

export const followupQueue = new Queue('followup', {
  connection: createRedis()
});

export type FollowupJobData = {
  conversationId: string;
  kind: 'HOT_LOST_REMINDER' | 'AFTER_HOURS_FOLLOWUP';
};
