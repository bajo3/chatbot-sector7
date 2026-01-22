import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import { env, panelOrigins } from './env.js';
import { webhookRouter } from './routes/webhook.js';
import { authRouter } from './routes/auth.js';
import { conversationsRouter } from './routes/conversations.js';
import { usersRouter } from './routes/users.js';
import { metricsRouter } from './routes/metrics.js';
import { initSocket } from './server/socket.js';
import { runPeriodicJobs } from './scheduler/jobs.js';

const app = express();

// Capture raw body for signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; }
}));

app.use(helmet());
const allowedOrigins = new Set(panelOrigins);

app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server calls and health checks with no Origin
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
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

const server = http.createServer(app);
initSocket(server, panelOrigins);

server.listen(env.PORT, () => {
  console.log(`API listening on ${env.PUBLIC_BASE_URL}`);
});

// Simple periodic loop (production: move to cron/queue/worker)
setInterval(() => {
  runPeriodicJobs().catch((e)=>console.error('jobs error', e));
}, 60_000);
