# Sector 7 – WhatsApp Coexistence Bot + Multi‑agent Panel (Producción-ready starter)

Este repo incluye:

## Stack
- Panel: React + Vite + React Router
- API: Node.js + TypeScript + Express
- DB: Postgres (Supabase)
- ORM: Prisma
- Tiempo real: Socket.IO (opcional Redis adapter)
- Jobs: BullMQ + Redis (Upstash) o n8n
- Storage: Supabase Storage (opcional)
- WhatsApp: WhatsApp Cloud API (Meta)


- **WhatsApp Cloud API webhook** (Express + TypeScript)
- **Motor de bot** (catálogo real importable + intención + respuestas cortas + máx. 3 opciones)
- **Handoff humano** (BOT_ON ↔ HUMAN_TAKEOVER) con:
  - silenciado automático del bot cuando humano escribe
  - retorno por **inactividad** (timer) o **botón** manual
  - asignación de vendedor y panel de intervención
- **Panel web** para vendedores (Vite + React + Tailwind) con:
  - lista de chats
  - chat en tiempo real
  - takeover / devolver al bot
  - asignar vendedor
  - notas internas
- **DB** con Prisma + Supabase Postgres (recomendado)

### Seguridad (panel + realtime)
- El panel usa **JWT** (login) y lo reusa para:
  - REST (`Authorization: Bearer ...`)
  - Socket.IO (handshake con token)
- Esto evita que el realtime quede público por error en producción.

> ⚠️ Nota sobre “coexistence”: esto se habilita desde el onboarding oficial de Meta (Embedded Signup / flujo oficial). El backend de este repo funciona tanto en modo Cloud API "solo" como en coexistencia (app + API). 

---

## 0) Requisitos

- Node 18+ (recomendado 20)
- npm 9+ (o pnpm)
- Un negocio/portafolio Meta con acceso a WhatsApp Business Platform
- Token y Phone Number ID válidos

---

## 1) Configuración rápida

## Supabase (100% listo)

Este proyecto viene preparado para **Supabase Postgres**.

### 1) Crear proyecto en Supabase
- Supabase → New project
- Copiá el **Connection string**: Project Settings → Database → Connection string (URI)

### 2) Setear `DATABASE_URL`
En `apps/api/.env`:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?schema=public"
```

### 3) Migraciones + seed
```bash
cd apps/api
npm install
npx prisma generate
npx prisma db push
npm run seed
```

> Tip: si querés iterar el schema en local, usá `npx prisma migrate dev`.



### 1.1 Variables de entorno

Copiá los ejemplos:

- `apps/api/.env.example` → `apps/api/.env`
- `apps/panel/.env.example` → `apps/panel/.env`

> Importante: respetá los nombres de variables del `.env` existente (no renombrar). El proyecto valida envs con Zod y espera esos nombres.

**CORS (panel)**
- `PANEL_ORIGIN`: un único origen (útil para dev)
- `PANEL_ORIGINS`: allowlist separada por comas (útil para Vercel Preview + dominio prod)

### 1.2 Instalar dependencias

Desde la raíz:

```bash
npm install
```

### 1.3 Inicializar DB (Prisma)

```bash
cd apps/api
npx prisma generate
npx prisma db push
npm run seed
```

Esto crea usuarios demo y un catálogo demo. Luego importás tu catálogo real.

---

## 2) Webhook de WhatsApp

### 2.1 Verificación (GET /webhook)

En Meta Developers / WhatsApp / Webhooks:
- Callback URL: `https://TU_DOMINIO/webhook`
- Verify token: el mismo que `META_VERIFY_TOKEN`

### 2.2 Firma del webhook

Se verifica `X-Hub-Signature-256` con `META_APP_SECRET`.
Si no querés bloquearte mientras probás, podés setear:

- `WEBHOOK_SIGNATURE_MODE=optional`

En producción: **required**.

---

## 3) Importar catálogo real (scrapeado)

Formateá un JSON como `apps/api/data/catalog.sample.json` y corré:

```bash
cd apps/api
npm run import:catalog
```

---

## 4) Correr en local

### API

```bash
cd apps/api
npm run dev
```

### Panel

```bash
cd apps/panel
npm run dev
```

Panel por defecto: http://localhost:5173  
API por defecto: http://localhost:5050

Login demo (si corrés `npm run seed`):
- Admin: `admin@sector7.local` / `ADMIN_SEED_PASSWORD`
- Vendedor: `vendedor1@sector7.local` / `SELLER_SEED_PASSWORD`
- Vendedor: `vendedor2@sector7.local` / `SELLER_SEED_PASSWORD`

---

## 5) Lógica clave (lo que definiste)

1) Si un humano empieza a responder → **el bot queda silenciado automáticamente** (HUMAN_TAKEOVER).
2) Vuelve al bot por:
   - **botón manual** en panel
   - **inactividad humana** (30/60 min configurable)
3) Intención de compra:
   - keywords: "llevo", "cuotas", "reservo", "paso", "comprar"
   - score también suma por botones/selecciones
4) Máx. 3 opciones: el bot prioriza por:
   - stock primero
   - mejor match de búsqueda
   - “popularidad” (campo opcional)
5) Si nadie toma el lead:
   - el bot **retoma automáticamente**
   - se marca como **HOT_LOST** (lead caliente perdido)

---

## 6) Deploy

- API: Render / Fly.io / Railway / VPS / etc.
- Panel: Vercel / Netlify / static hosting

Asegurate de:
- HTTPS
- variable `PUBLIC_BASE_URL` en API para links y logs
- DB persistente (Postgres) si vas a producción

### Multi-instancia (Railway con 2+ réplicas)
- Los **jobs periódicos** están protegidos con un **advisory lock** de Postgres, para que no se ejecuten duplicados.
- Si vas a mover jobs a un worker dedicado, poné `ENABLE_JOBS=false` en el servicio de API.

---

## Usuarios demo (seed)

Se crean/actualizan con los valores del `.env`:
- `ADMIN_SEED_PASSWORD`
- `SELLER_SEED_PASSWORD`

---

## Notas de producción

- Usá **System User token** (no el token “de prueba” del panel).
- Procesá el webhook rápido (200 OK) y pasá lo pesado a colas.
- Asegurá idempotencia por `wa_message_id`.

---


> Si usás el **pooler** de Supabase, asegurate que el URI sea el correcto (Session mode) para Prisma.


## Jobs / Recontactos (n8n o BullMQ)

### Opción A: BullMQ + Redis (Upstash)
1) Seteá `REDIS_URL` en `apps/api/.env`
2) Corré **API** y **worker**:

```bash
cd apps/api
npm run dev
npm run worker
```

Jobs incluidos:
- `HOT_LOST_REMINDER` (si nadie tomó el lead → bot retoma + HOT_LOST)
- `AFTER_HOURS_FOLLOWUP` (si lo querés, lo podés programar según tu lógica)

> Socket.IO escala en múltiples réplicas si `REDIS_URL` está seteado (adapter Redis).

### Opción B: n8n (rápido para MVP)
- En `/n8n/` tenés un workflow ejemplo.
- Podés disparar un webhook desde tu API cuando marque HOT_LOST, o consultar la DB.
