import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run the TypeScript sources — never a compiled copy left in dist/.
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    // Pinned so auth and rate-limit behaviour is deterministic rather than
    // depending on whatever the developer happens to have in .env.
    env: {
      NODE_ENV: "test",
      ADMIN_TOKEN: "test-admin-token-0123456789",
      // Config validation requires this at import time, but the tests never
      // use it — they connect to the in-memory replica set they start.
      MONGODB_URI: "mongodb://unused-by-tests",
      MONGODB_DB: "bano_zypp_ke_cm_test",
    },
    // Spinning up a real MongoDB takes a moment.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
