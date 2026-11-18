# CapitalOS

Finanzas personales y patrimonio. Next.js 16 + Prisma 6 + PostgreSQL. Protegida con contraseña.

## Publicar en Vercel (para usarla desde el celular)
1. En vercel.com, entra con tu cuenta de GitHub → **Add New… → Project** → importa `capitalos`.
2. Antes de **Deploy**, en **Environment Variables** agrega `APP_PASSWORD` (mínimo 12 caracteres).
3. Deploy (el primero puede fallar porque aún no hay base de datos; es normal).
4. En el proyecto: **Storage → Create Database → Neon (Postgres)** → conéctala al proyecto.
   Esto crea `DATABASE_URL` y `DATABASE_URL_UNPOOLED`.
5. **Deployments → ⋯ → Redeploy**. Cada deploy aplica las migraciones y prepara la base (sin borrar nada).
6. Abre la URL, entra con tu contraseña y en el celular: *Compartir → Agregar a pantalla de inicio*.

Cada `git push` a `main` publica una versión nueva automáticamente.
Para cambiar la contraseña: cambia `APP_PASSWORD` en Vercel y haz Redeploy (cierra todas las sesiones).

## Desarrollo local
Necesitas PostgreSQL (local o una rama de Neon).
```bash
npm install
cp .env.example .env      # llena DATABASE_URL, DATABASE_URL_UNPOOLED y APP_PASSWORD
npx prisma migrate dev    # crea las tablas y carga datos de prueba
npm run dev               # http://localhost:3000
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
En producción la base empieza vacía (con categorías y tipos de cambio). En **Ajustes**, da de alta
tus cuentas (con su saldo de hoy) y tus tarjetas (con su deuda de hoy).

En local: `npm run db:vacio` (borra todo) o `npm run db:demo` (borra y carga datos de prueba).
`npm run db:seed` nunca borra: si ya hay datos, no hace nada.

## Respaldo
- **Ajustes → Respaldo completo (.json)**: copia exacta, sirve para restaurar.
- **Movimientos (.csv)**: se abre en Excel y se puede volver a importar.
- **Importar CSV**: revisa el archivo, muestra errores por línea y guarda todo o nada. Descarga la plantilla para ver el formato.
- Neon también guarda historial de la base (puedes restaurar a un punto anterior desde su panel).

## Seguridad
- Una sola contraseña (`APP_PASSWORD`). La sesión es una cookie firmada, `httpOnly` y `secure`, por 30 días.
- Se verifica en tres capas: `src/proxy.ts`, cada Server Action (`runAction`) y cada lectura de datos.
- Tras 8 intentos fallidos desde una IP (o 40 en total) se bloquea el acceso 15 minutos.
- La app pide no aparecer en buscadores.

## Reglas del libro mayor
Todas viven en `src/lib/finance/ledger.ts`. Cada movimiento cambia saldos dentro de una
transacción de base de datos; los saldos nunca se editan a mano.

## Pruebas
```bash
npm test          # 48 pruebas: saldos, monedas, reembolsos, bolsas, tarjetas, respaldo
npm run typecheck
```
Usan su propia base (`capitalos_test` o `TEST_DATABASE_URL`), nunca la tuya.

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
