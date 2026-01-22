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
  ADMIN_SEED_PASSWORD: z.string().min(6).default('admin123456'),
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
