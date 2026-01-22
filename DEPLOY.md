# Deploy (recomendado)

## Panel (Vercel)
- Root: `apps/panel`
- Build: `npm install && npm run build`
- Output: `dist`
- Env:
  - `VITE_API_BASE=https://TU_API_DOMINIO`
  - `VITE_SOCKET_URL=https://TU_API_DOMINIO`

## API (Railway / Fly.io / Render)
- Root: `apps/api`
- Start: `npm install && npm run build && node dist/index.js`
- Env: copiar `apps/api/.env.example` y completar.
- Importante:
  - HTTPS
  - `PUBLIC_BASE_URL` real
  - `PANEL_ORIGIN` real (dominio del panel)

## Worker (BullMQ)
- Servicio separado (recomendado) o mismo host.
- Comando: `npm -w apps/api run worker`
- Requiere `REDIS_URL` y `ENABLE_JOBS=true`.
