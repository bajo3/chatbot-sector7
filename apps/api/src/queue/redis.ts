import { env } from '../env.js';

/**
 * BullMQ types depend on its own ioredis version. Passing an actual ioredis instance
 * can cause type clashes in TypeScript (duplicate ioredis in node_modules).
 *
 * Returning a plain connection options object avoids that and works at runtime.
 */
export function createRedisConnection() {
  if (!env.REDIS_URL) throw new Error('REDIS_URL is required to use queues/adapters');

  // BullMQ accepts a connection options object that includes `url`.
  return {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  } as any;
}
