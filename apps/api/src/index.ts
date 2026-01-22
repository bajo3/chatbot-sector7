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
import { runPeriodicJobs } from './scheduler/jobs.js';
import { ensureAdminUser } from './bootstrap/ensureAdmin.js';

const app = express();

// Railway/Vercel sit behind a proxy; helps Express generate correct URLs and trust X-Forwarded-*.
app.set('trust proxy', 1);

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

(async () => {
  try {
    await ensureAdminUser();
  } catch (e) {
    console.error('[bootstrap] ensureAdminUser error', e);
  }

  server.listen(env.PORT, () => {
    console.log(`API listening on ${env.PUBLIC_BASE_URL}`);
  });

  // Simple periodic loop (production: move to cron/queue/worker)
  setInterval(() => {
    runPeriodicJobs().catch((e)=>console.error('jobs error', e));
  }, 60_000);
})();

