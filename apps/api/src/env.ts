import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(5050),
  PUBLIC_BASE_URL: z.string().default('http://localhost:5050'),
  PANEL_ORIGIN: z.string().default('http://localhost:5173'),
  // Comma-separated allowlist of panel origins (recommended for Vercel previews / multiple domains)
  PANEL_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(10),
  META_WA_TOKEN: z.string().min(10),
  META_PHONE_NUMBER_ID: z.string().min(5),
  META_VERIFY_TOKEN: z.string().min(3),
  META_APP_SECRET: z.string().min(10),
  WEBHOOK_SIGNATURE_MODE: z.enum(['required', 'optional']).default('required'),
  TZ: z.string().default('America/Argentina/Buenos_Aires'),
  HUMAN_INACTIVITY_MINUTES: z.coerce.number().default(45),
  UNCLAIMED_HOT_LEAD_MINUTES: z.coerce.number().default(60),
  HUMAN_WORKING_HOURS: z.string().default('Mon-Fri 09:00-18:00'),
  OPENAI_API_KEY: z.string().optional().or(z.literal('')).default(''),
  REDIS_URL: z.string().optional().or(z.literal('')).default(''),
  ENABLE_JOBS: z.coerce.boolean().default(true),
  SUPABASE_URL: z.string().optional().or(z.literal('')).default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().or(z.literal('')).default(''),
  SUPABASE_STORAGE_BUCKET: z.string().optional().or(z.literal('')).default('sector7'),
  
  // Seed credentials (dev convenience). Override in production.
  ADMIN_SEED_EMAIL: z.string().email().default('admin@sector7.local'),
  ADMIN_SEED_NAME: z.string().default('Sector7 Admin'),
  ADMIN_SEED_PASSWORD: z.string().min(6).default('admin123456'),
  ADMIN_SEED_ENABLED: z.coerce.boolean().default(true),
  ADMIN_SEED_FORCE_RESET: z.coerce.boolean().default(false),
  SELLER_SEED_PASSWORD: z.string().min(6).default('seller123456')
});

export const env = envSchema.parse(process.env);


// Allowed origins for CORS (express + socket.io). Prefer PANEL_ORIGINS, fallback to PANEL_ORIGIN.
export const panelOrigins = (() => {
  const raw = (env.PANEL_ORIGINS ?? env.PANEL_ORIGIN ?? '').toString();
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    // Never allow paths in origins: keep only scheme+host+port
    .map((s) => {
      try {
        const u = new URL(s);
        return u.origin;
      } catch {
        return s;
      }
    });
})();

function normalizeOrigin(input: string): string {
  try {
    return new URL(input).origin;
  } catch {
    return input;
  }
}

/**
 * Centralized allowlist logic for both Express CORS and Socket.IO.
 *
 * Why: In production (Railway + Vercel), the panel origin can vary (Vercel previews)
 * and strict origin matching causes the API to omit CORS headers, breaking both REST
 * and Socket.IO (polling/WebSocket) with 400/CORS errors.
 */
export function isAllowedPanelOrigin(origin?: string | null): boolean {
  // Allow server-to-server calls and health checks with no Origin
  if (!origin) return true;

  const o = normalizeOrigin(origin);
  if (panelOrigins.includes(o)) return true;

  // Allow Vercel production + preview domains for this panel.
  // Examples:
  // - https://chatbot-sector7-panel.vercel.app
  // - https://chatbot-sector7-panel-git-branch-username.vercel.app
  // - https://chatbot-sector7-panel-abcdef.vercel.app
  try {
    const u = new URL(o);
    const host = u.hostname.toLowerCase();
    if (host === 'chatbot-sector7-panel.vercel.app') return true;
    if (host.startsWith('chatbot-sector7-panel-') && host.endsWith('.vercel.app')) return true;
  } catch {
    // ignore
  }

  return false;
}
