import { execSync } from "node:child_process";

export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://capitalos:capitalos@localhost:5432/capitalos_test";

/** Base de pruebas desechable: borra el esquema y aplica las migraciones. */
export default function setup() {
  const env = { ...process.env, DATABASE_URL: TEST_DB, DATABASE_URL_UNPOOLED: TEST_DB };
  execSync("npx prisma db execute --stdin --schema prisma/schema.prisma", { env, input: "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;", stdio: ["pipe", "ignore", "inherit"] });
  execSync("npx prisma migrate deploy", { env, stdio: "ignore" });
}
