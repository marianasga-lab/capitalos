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

## Pruebas
```bash
npm test          # 25 pruebas de saldos, reembolsos, monedas y reportes
npm run typecheck
```
Usan su propia base (`prisma/test.db`), nunca la tuya.

## Arquitectura
| Capa | Carpeta | Qué hace |
|---|---|---|
| Reglas puras | `src/lib/finance/` | Libro mayor (`ledger.ts`) y patrimonio (`networth.ts`). Sin base de datos. |
| Validación | `src/lib/validation.ts` | Esquemas zod de toda entrada. |
| Servicios | `src/server/services/` | Lógica de negocio con Prisma, siempre en transacciones. |
| Server Actions | `src/actions/` | Validan, llaman al servicio, refrescan la UI y devuelven `{ ok, data }` o `{ ok, error }`. |

Reglas clave:
- Los saldos solo cambian por movimientos, abonos o conciliaciones (`reconcileAccountAction`).
- Un gasto reembolsable o compartido manda lo adeudado a "Cuentas por Cobrar" (en MXN);
  los abonos lo regresan a una cuenta real. Se permiten abonos parciales.
- No se puede borrar un gasto con abonos ni una cuenta con movimientos (se archiva).
- Sin login: la app es para uso local. Antes de publicarla en internet hay que agregar autenticación.
