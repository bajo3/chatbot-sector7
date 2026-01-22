import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createRedis } from '../queue/redis.js';
import { env } from '../env.js';

export let io: Server;

export function initSocket(httpServer: any, corsOrigin: string) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET','POST'] }
  });

  // Optional: scale Socket.IO horizontally with Redis adapter
  if (env.REDIS_URL) {
    const pubClient = createRedis();
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient as any, subClient as any));
  }
  io.on('connection', (socket) => {
    socket.emit('hello', { ok: true });
  });
  return io;
}
