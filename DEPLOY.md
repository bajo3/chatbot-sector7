# Deploy (recomendado)

## Panel (Vercel)
- Root: `apps/panel`
- Build: `npm install && npm run build`
- Output: `dist`
- Env:
  - `VITE_API_BASE=https://TU_API_DOMINIO`
  - `VITE_SOCKET_URL=https://TU_API_DOMINIO`
  - Tip: usá `apps/panel/.env.example` como base.

## API (Railway / Fly.io / Render)
- Root: `apps/api`
- Start (simple): `npm install && npm run build && npm start`
- Env: copiar `apps/api/.env.example` → `apps/api/.env` y completar.
- Importante:
  - HTTPS
  - `PUBLIC_BASE_URL` real
  - `PANEL_ORIGIN` real (dominio del panel)

### Railway (Nixpacks)
1) En Railway, setear **Root Directory = `apps/api`**
2) Dejar que Nixpacks use `apps/api/nixpacks.toml` (incluido) para correr build antes de start.

## Worker (BullMQ)
- Servicio separado (recomendado) o mismo host.
- Comando: `npm -w apps/api run worker`
- Requiere `REDIS_URL` y `ENABLE_JOBS=true`.
