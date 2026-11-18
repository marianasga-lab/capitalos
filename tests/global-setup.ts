import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

/** Base de pruebas desechable: se borra y se recrea con las migraciones. */
export default function setup() {
  const file = path.resolve(import.meta.dirname, "../prisma/test.db");
  for (const f of [file, `${file}-journal`]) rmSync(f, { force: true });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "ignore",
  });
}
