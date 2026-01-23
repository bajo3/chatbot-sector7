import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import { env, isAllowedPanelOrigin } from './env.js';
import { webhookRouter } from './routes/webhook.js';
import { authRouter } from './routes/auth.js';
import { conversationsRouter } from './routes/conversations.js';
import { usersRouter } from './routes/users.js';
import { metricsRouter } from './routes/metrics.js';
import { initSocket } from './server/socket.js';
import { runPeriodicJobsWithDb, scheduleFollowups } from './scheduler/jobs.js';
import { ensureAdminUser } from './bootstrap/ensureAdmin.js';
import { catalogRouter } from "./catalog/catalog.routes.js";
import { prisma } from './db/prisma.js';

const app = express();

// Railway/Vercel sit behind a proxy; helps Express generate correct URLs and trust X-Forwarded-*.
app.set('trust proxy', 1);

//catalogo
app.use("/catalog", catalogRouter);

// Capture raw body for signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; }
}));

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server calls and health checks with no Origin
    if (isAllowedPanelOrigin(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// Ensure preflight requests always succeed for allowed origins
app.options('*', cors({
  origin: (origin, cb) => {
    if (isAllowedPanelOrigin(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok:true }));

app.use('/webhook', webhookRouter);
app.use('/auth', authRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/users', usersRouter);
app.use('/api/metrics', metricsRouter);

// Friendly CORS error (otherwise Express returns a generic 500 without context)
app.use((err: any, _req: any, res: any, next: any) => {
  if (err?.message?.startsWith('CORS blocked origin')) {
    return res.status(403).json({ error: 'CORS', message: err.message });
  }
  return next(err);
});

const server = http.createServer(app);
initSocket(server);

function lockKeyPair(key: string): [number, number] {
  // Stable 32-bit hash (FNV-1a). We return 2 ints to use pg_try_advisory_xact_lock(int,int)
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  // Split into two signed int32 parts (avoid collisions a bit)
  const a = (h | 0) as number;
  const b = ((h ^ 0x9e3779b9) | 0) as number;
  return [a, b];
}

async function runJobsTick() {
  // Allow disabling periodic jobs in production if you move them to a dedicated worker.
  if (!env.ENABLE_JOBS) return;

  const [k1, k2] = lockKeyPair('sector7:periodic_jobs');

  // Use a transaction-scoped advisory lock so multi-instance deployments don't double-run jobs.
  const followups = await prisma.$transaction(async (tx: any) => {
const rows = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${k1}::int, ${k2}::int) AS locked`;
    const locked = Array.isArray(rows) ? Boolean((rows as any)[0]?.locked) : false;
    if (!locked) return [];
    return runPeriodicJobsWithDb(tx);
  });

  // Queue/redis operations are performed outside the DB transaction.
  await scheduleFollowups(followups as any);
}

(async () => {
  try {
    await ensureAdminUser();
  } catch (e) {
    console.error('[bootstrap] ensureAdminUser error', e);
  }

  server.listen(env.PORT, () => {
    console.log(`API listening on ${env.PUBLIC_BASE_URL}`);
  });

  // Periodic loop (guarded by advisory lock; safe for multi-instance)
  setInterval(() => {
    runJobsTick().catch((e) => console.error('jobs error', e));
  }, 60_000);
})();

