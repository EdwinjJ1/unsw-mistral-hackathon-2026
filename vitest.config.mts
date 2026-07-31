import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    // bot/dispatch.test.ts uses node:test and runs via `npm run test:core`.
    exclude: ["dist/**", "node_modules/**", "bot/dispatch.test.ts"],
    include: ["lib/mistral/__tests__/**/*.test.ts", "bot/**/*.test.ts"],
    restoreMocks: true,
  },
});
