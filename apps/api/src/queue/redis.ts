import { env } from '../env.js';
import IORedis from 'ioredis';

export function createRedis() {
  if (!env.REDIS_URL) throw new Error('REDIS_URL is required to use queues/adapters');
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
}
