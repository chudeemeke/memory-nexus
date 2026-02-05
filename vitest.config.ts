/**
 * Vitest configuration for Stryker mutation testing.
 *
 * Note: Regular tests use Bun (bun test).
 * Vitest is ONLY used by Stryker for mutation testing.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Alias bun:test to vitest so existing tests work
  resolve: {
    alias: {
      "bun:test": "vitest",
    },
  },
  test: {
    // Only include domain tests for mutation testing
    // Domain layer tests are pure and don't use Bun-specific features like spyOn
    include: ["src/domain/**/*.test.ts"],

    // Exclude integration and smoke tests from mutation testing
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "tests/**",
      "**/*.integration.test.ts",
    ],

    // TypeScript support via esbuild (built into Vitest)
    globals: false,

    // Timeout settings
    testTimeout: 30000,

    // Coverage configuration (for comparison with Bun)
    coverage: {
      provider: "v8",
      include: ["src/domain/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
    },
  },
});
