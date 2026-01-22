import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { env, isAllowedPanelOrigin } from '../env.js';
import IORedis from 'ioredis';

export let io: Server;

export function initSocket(httpServer: any) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (isAllowedPanelOrigin(origin)) return cb(null, true);
        return cb(new Error(`CORS blocked origin: ${origin}`), false);
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });


  // Optional: scale Socket.IO horizontally with Redis adapter
  if (env.REDIS_URL) {
    const pubClient = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient as any, subClient as any));
  }
  io.on('connection', (socket) => {
    socket.emit('hello', { ok: true });
  });
  return io;
}
