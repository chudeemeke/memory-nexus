/**
 * API Consumption Smoke Test
 *
 * Verifies that the dist artifacts exist and all 17 execute*Command
 * functions are importable from dist/index.js as a library consumer would.
 *
 * Requires: `bun run build` to have been run first.
 */

import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const distDir = join(import.meta.dir, "../../dist");

describe("API consumption", () => {
  describe("dist artifacts", () => {
    test("dist/index.js exists (library entry)", () => {
      expect(existsSync(join(distDir, "index.js"))).toBe(true);
    });

    test("dist/index.d.ts exists (type declarations)", () => {
      expect(existsSync(join(distDir, "index.d.ts"))).toBe(true);
    });

    test("dist/presentation/cli/index.js exists (CLI binary)", () => {
      expect(existsSync(join(distDir, "presentation/cli/index.js"))).toBe(true);
    });

    test("CLI binary has shebang", async () => {
      const content = await Bun.file(join(distDir, "presentation/cli/index.js")).text();
      expect(content.startsWith("#!/usr/bin/env bun")).toBe(true);
    });
  });

  describe("library exports", () => {
    test("all 17 execute*Command functions are importable", async () => {
      const mod = await import(join(distDir, "index.js"));

      const expectedFunctions = [
        "executeSyncCommand",
        "executeSearchCommand",
        "executeListCommand",
        "executeStatsCommand",
        "executeContextCommand",
        "executeRelatedCommand",
        "executeShowCommand",
        "executeBrowseCommand",
        "executeInstallCommand",
        "executeUninstallCommand",
        "executeStatusCommand",
        "executeDoctorCommand",
        "executeAuditSecretsCommand",
        "executePurgeCommand",
        "executeExportCommand",
        "executeImportCommand",
        "executeCompletionCommand",
      ];

      for (const fn of expectedFunctions) {
        expect(typeof mod[fn]).toBe("function");
      }
    });

    test("domain exports are available", async () => {
      const mod = await import(join(distDir, "index.js"));

      // Spot-check key domain exports
      expect(mod.SearchQuery).toBeDefined();
      expect(mod.MemoryError).toBeDefined();
      expect(mod.ErrorCode).toBeDefined();
    });
  });
});
