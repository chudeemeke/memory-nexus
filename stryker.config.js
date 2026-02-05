/**
 * Stryker mutation testing configuration.
 *
 * Validates test quality by injecting mutations (bugs) into the code
 * and verifying that tests catch them.
 *
 * Usage:
 *   bun run mutation         - Run on all source files
 *   bun run mutation:domain  - Run on domain layer only
 *
 * Note: Stryker uses Vitest as the test runner. Regular tests use Bun.
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // Use Vitest as the test runner
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.ts",
  },

  // TypeScript support disabled - Bun-specific types (bun:sqlite) are not
  // compatible with standard tsc. Vitest handles transpilation via esbuild.
  // checkers: ["typescript"],
  // tsconfigFile: "tsconfig.json",

  // Files to mutate (can be overridden via CLI --mutate flag)
  // Explicitly exclude test files and index files
  mutate: [
    "src/domain/**/*.ts",
    "!**/*.test.ts",
    "!**/index.ts",
  ],

  // Mutation score thresholds
  thresholds: {
    high: 80,
    low: 60,
    break: 80, // Fail if score drops below 80%
  },

  // Output reporters
  reporters: ["html", "clear-text", "progress"],

  // Parallel execution settings
  concurrency: 4,

  // Timeout settings (mutations can slow tests)
  timeoutMS: 60000,
  timeoutFactor: 2.5,

  // Only run tests that cover mutated code
  coverageAnalysis: "perTest",

  // HTML report output directory
  htmlReporter: {
    fileName: "reports/mutation/index.html",
  },

  // Incremental mode for faster subsequent runs
  incremental: true,
  incrementalFile: ".stryker-tmp/incremental.json",

  // Ignore patterns for specific mutation types that cause false positives
  mutator: {
    excludedMutations: [
      // String literal mutations often cause false positives in error messages
      "StringLiteral",
    ],
  },
};
