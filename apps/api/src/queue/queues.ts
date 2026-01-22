import { Queue } from 'bullmq';
import { createRedisConnection } from './redis.js';

export const followupQueue = new Queue('followup', {
  connection: createRedisConnection()
});

export type FollowupJobData = {
  conversationId: string;
  kind: 'HOT_LOST_REMINDER' | 'AFTER_HOURS_FOLLOWUP';
};
