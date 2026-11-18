import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    // Base de datos separada: las pruebas nunca tocan la tuya
    env: (() => {
      const url = process.env.TEST_DATABASE_URL ?? "postgresql://capitalos:capitalos@localhost:5432/capitalos_test";
      return { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, TZ: "America/Mexico_City" };
    })(),
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
  },
});
