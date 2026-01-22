import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import { env } from './env.js';
import { webhookRouter } from './routes/webhook.js';
import { authRouter } from './routes/auth.js';
import { conversationsRouter } from './routes/conversations.js';
import { usersRouter } from './routes/users.js';
import { initSocket } from './server/socket.js';
import { runPeriodicJobs } from './scheduler/jobs.js';

const app = express();

// Capture raw body for signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; }
}));

app.use(helmet());
app.use(cors({ origin: env.PANEL_ORIGIN, credentials: true }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok:true }));

app.use('/webhook', webhookRouter);
app.use('/auth', authRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/users', usersRouter);

const server = http.createServer(app);
initSocket(server, env.PANEL_ORIGIN);

server.listen(env.PORT, () => {
  console.log(`API listening on ${env.PUBLIC_BASE_URL}`);
});

// Simple periodic loop (production: move to cron/queue/worker)
setInterval(() => {
  runPeriodicJobs().catch((e)=>console.error('jobs error', e));
}, 60_000);
