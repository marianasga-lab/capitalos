# CapitalOS

Finanzas personales y patrimonio (Net Worth). Next.js 16 + Prisma 6 + SQLite.

## Arrancar
```bash
npm install
npx prisma migrate dev     # crea prisma/capitalos.db
npm run db:seed            # datos de prueba ficticios
npm run dev                # http://localhost:3000
```

## Pantallas
- **Resumen** (`/`): fortuna neta, liquidez, inversiones, por cobrar, flujo del mes (capital propio vs. apoyo familiar), Runway, evolución mensual, quién te debe y bolsas.
- **Patrimonio** (`/patrimonio`): efectivo en pesos, dólares y euros; dinero por moneda; activos y pasivos.
- **Movimientos** (`/movimientos`): libro mayor por mes, con filtros, edición y borrado.
- **Tarjetas** (`/tarjetas`): pago para no generar intereses por ciclo, alerta a 5 días del pago, simulador de intereses con IVA.
- **Bolsas** (`/bolsas`): dinero de terceros (ej. la colegiatura que deposita Papá) y si cuadra.
- **Metas** (`/metas`): progreso, cuánto ahorrar al mes y predicción con tu ritmo real.
- **Ajustes** (`/ajustes`): tipos de cambio, cuentas, tarjetas, conciliación, cierre de mes, respaldo e importación.
- **Registro rápido**: `Ctrl K` (o `⌘ K`) desde cualquier pantalla.

## Empezar con tus datos reales
```bash
npm run db:vacio   # BORRA todo y deja la app lista (categorías y tipos de cambio)
```
Luego, en **Ajustes**, da de alta tus cuentas (con su saldo de hoy) y tus tarjetas (con su deuda de hoy).
Para volver a los datos de prueba: `npm run db:demo` (también borra todo).
`npm run db:seed` nunca borra: si ya hay datos, no hace nada.

## Respaldo
- **Ajustes → Respaldo completo (.json)**: copia exacta, sirve para restaurar.
- **Movimientos (.csv)**: se abre en Excel y se puede volver a importar.
- **Importar CSV**: revisa el archivo, muestra errores por línea y guarda todo o nada. Descarga la plantilla para ver el formato.
- El archivo `prisma/capitalos.db` también es tu base completa: copiarlo es un respaldo.

## Tu base de datos
Es un solo archivo: `prisma/capitalos.db` (no se sube a git). Para respaldarla, cópialo.
Para migrar a PostgreSQL: cambia `provider` en `prisma/schema.prisma` y `DATABASE_URL`.

## Reglas del libro mayor
Todas viven en `src/lib/finance/ledger.ts`. Cada movimiento cambia saldos dentro de una
transacción de base de datos; los saldos nunca se editan a mano.

## Pruebas
```bash
npm test          # 48 pruebas: saldos, monedas, reembolsos, bolsas, tarjetas, respaldo
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
