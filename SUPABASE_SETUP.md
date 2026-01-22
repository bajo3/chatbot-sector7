# Supabase Setup (rápido)

1) Supabase → Project Settings → Database → Connection string (URI)
2) Pegalo en `apps/api/.env`:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?schema=public"
```

3) Migraciones:

```bash
cd apps/api
npx prisma generate
npx prisma db push
npm run seed
```

4) (Opcional) Para desarrollo local con Supabase CLI:
- Podés levantar Supabase local y apuntar `DATABASE_URL` al Postgres local.
