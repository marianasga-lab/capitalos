# CapitalOS

Finanzas personales y patrimonio (Net Worth). Next.js 16 + Prisma 6 + SQLite.

## Arrancar
```bash
npm install
npx prisma migrate dev     # crea prisma/capitalos.db
npm run db:seed            # datos de prueba ficticios
npm run dev                # http://localhost:3000
```

## Tu base de datos
Es un solo archivo: `prisma/capitalos.db` (no se sube a git). Para respaldarla, cópialo.
Para migrar a PostgreSQL: cambia `provider` en `prisma/schema.prisma` y `DATABASE_URL`.

## Reglas del libro mayor
Todas viven en `src/lib/finance/ledger.ts`. Cada movimiento cambia saldos dentro de una
transacción de base de datos; los saldos nunca se editan a mano.
