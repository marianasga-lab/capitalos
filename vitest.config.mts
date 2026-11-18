import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    // Base de datos separada: las pruebas nunca tocan capitalos.db
    env: { DATABASE_URL: "file:./test.db" },
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
  },
});
