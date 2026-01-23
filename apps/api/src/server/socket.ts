import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { env, isAllowedPanelOrigin } from "../env.js";
import type { Server as HttpServer } from "node:http";
import { createRequire } from "node:module";

export let io: Server;

// ESM-safe require (evita el bug de typings/resolution)
const require = createRequire(import.meta.url);

// Tipamos el constructor como "new (...args) => any" para destrabar TS2351
const RedisCtor = require("ioredis") as unknown as new (
  ...args: any[]
) => {
  duplicate(): any;
};

export function initSocket(httpServer: HttpServer) {
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

  if (env.REDIS_URL) {
    const pubClient = new RedisCtor(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
  }

  io.on("connection", (socket) => {
    socket.emit("hello", { ok: true });
  });

  return io;
}
