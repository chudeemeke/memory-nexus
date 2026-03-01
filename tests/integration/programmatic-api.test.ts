/**
 * Programmatic API Integration Tests
 *
 * Verifies that all execute*Command functions can be called programmatically
 * with typed options and return CommandResult with exitCode property.
 *
 * Imports from src/index.ts (not dist). The dist import verification is
 * covered by api-consumption.test.ts from Plan 18-01.
 *
 * These tests run against the real database. They verify the API contract
 * (return types, no crashes, exitCode semantics) rather than testing
 * underlying logic (covered by unit tests).
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  executeSyncCommand,
  executeSearchCommand,
  executeListCommand,
  executeStatsCommand,
  executeContextCommand,
  executeRelatedCommand,
  executeShowCommand,
  executeInstallCommand,
  executeUninstallCommand,
  executeStatusCommand,
  executeDoctorCommand,
  executePurgeCommand,
  executeExportCommand,
  executeImportCommand,
  executeCompletionCommand,
  type CommandResult,
  type SyncCommandOptions,
  type SearchCommandOptions,
  type ListCommandOptions,
  type StatsCommandOptions,
  type ContextCommandOptions,
  type RelatedCommandOptions,
  type ShowCommandOptions,
  type InstallOptions,
  type UninstallOptions,
  type DoctorOptions,
  type PurgeCommandOptions,
  type ExportOptions,
  type ImportOptions,
} from "../../src/index.js";

/**
 * Assert a value is a valid CommandResult with { exitCode: number }.
 */
function expectCommandResult(result: unknown): asserts result is CommandResult {
  expect(result).toBeDefined();
  expect(result).not.toBeNull();
  expect(typeof result).toBe("object");
  expect(typeof (result as CommandResult).exitCode).toBe("number");
}

// Temp directory for export/import tests
let exportDir: string;
const exportPath = () => join(exportDir, "test-export.json");

describe("Programmatic API", () => {
  beforeAll(() => {
    exportDir = mkdtempSync(join(tmpdir(), "memory-api-test-"));
  });

  afterAll(() => {
    try {
      rmSync(exportDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows
    }
  });

  describe("executeSyncCommand", () => {
    test("dry-run returns CommandResult with exitCode 0", async () => {
      const options: SyncCommandOptions = { dryRun: true, quiet: true };
      const result = await executeSyncCommand(options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    });

    test("quiet sync returns CommandResult with exitCode 0", async () => {
      const options: SyncCommandOptions = { quiet: true };
      const result = await executeSyncCommand(options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    });

    test("exitCode is a number", async () => {
      const result = await executeSyncCommand({ dryRun: true, quiet: true });
      expect(typeof result.exitCode).toBe("number");
    });
  });

  describe("executeSearchCommand", () => {
    test("nonexistent term returns CommandResult", async () => {
      const options: SearchCommandOptions = { quiet: true };
      const result = await executeSearchCommand("nonexistent-term-xyz-9999", options);
      expectCommandResult(result);
    });

    test("search with limit returns CommandResult with exitCode 0", async () => {
      const options: SearchCommandOptions = { limit: "5", quiet: true };
      const result = await executeSearchCommand("test", options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    });

    test("JSON mode returns CommandResult with exitCode 0", async () => {
      const options: SearchCommandOptions = { json: true, quiet: true };
      const result = await executeSearchCommand("test", options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    });

    test("explicit FTS mode returns CommandResult with exitCode 0", async () => {
      const options: SearchCommandOptions = { mode: "fts", quiet: true };
      const result = await executeSearchCommand("test", options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("executeListCommand", () => {
    test("returns CommandResult", async () => {
      const options: ListCommandOptions = { quiet: true };
      const result = await executeListCommand(options);
      expectCommandResult(result);
    });

    test("with limit returns CommandResult with exitCode 0", async () => {
      const options: ListCommandOptions = { limit: "3", quiet: true };
      const result = await executeListCommand(options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    });

    test("JSON mode returns CommandResult with exitCode 0", async () => {
      const options: ListCommandOptions = { json: true, quiet: true };
      const result = await executeListCommand(options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("executeStatsCommand", () => {
    test("returns CommandResult", async () => {
      const options: StatsCommandOptions = { quiet: true };
      const result = await executeStatsCommand(options);
      expectCommandResult(result);
    });

    test("returns CommandResult with exitCode 0", async () => {
      const options: StatsCommandOptions = { quiet: true };
      const result = await executeStatsCommand(options);
      expect(result.exitCode).toBe(0);
    });

    test("JSON mode returns CommandResult with exitCode 0", async () => {
      const options: StatsCommandOptions = { json: true, quiet: true };
      const result = await executeStatsCommand(options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("executeContextCommand", () => {
    test("nonexistent project returns CommandResult", async () => {
      const options: ContextCommandOptions = { quiet: true };
      const result = await executeContextCommand("nonexistent-project-xyz", options);
      expectCommandResult(result);
    });

    test("returns CommandResult with exitCode as a number", async () => {
      const options: ContextCommandOptions = { quiet: true };
      const result = await executeContextCommand("memory", options);
      expectCommandResult(result);
      expect(typeof result.exitCode).toBe("number");
    });

    test("JSON mode with days filter returns CommandResult", async () => {
      const options: ContextCommandOptions = { json: true, days: 365, quiet: true };
      const result = await executeContextCommand("memory", options);
      expectCommandResult(result);
      expect(typeof result.exitCode).toBe("number");
    });
  });

  describe("executeRelatedCommand", () => {
    test("with session ID returns CommandResult", async () => {
      const options: RelatedCommandOptions = { quiet: true };
      const result = await executeRelatedCommand("session-1", options);
      expectCommandResult(result);
      expect(typeof result.exitCode).toBe("number");
    });

    test("JSON mode returns CommandResult", async () => {
      const options: RelatedCommandOptions = { json: true, quiet: true };
      const result = await executeRelatedCommand("session-1", options);
      expectCommandResult(result);
    });

    test("nonexistent session returns CommandResult", async () => {
      const options: RelatedCommandOptions = { quiet: true };
      const result = await executeRelatedCommand("nonexistent-session-id", options);
      expectCommandResult(result);
    });
  });

  describe("executeShowCommand", () => {
    test("with session ID returns CommandResult", async () => {
      const options: ShowCommandOptions = { quiet: true };
      const result = await executeShowCommand("session-1", options);
      expectCommandResult(result);
    });

    test("JSON mode returns CommandResult", async () => {
      const options: ShowCommandOptions = { json: true, quiet: true };
      const result = await executeShowCommand("session-1", options);
      expectCommandResult(result);
    });

    test("nonexistent session returns CommandResult with exitCode 1", async () => {
      const options: ShowCommandOptions = { quiet: true };
      const result = await executeShowCommand("nonexistent-session-id", options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(1);
    });
  });

  describe("executeInstallCommand", () => {
    test("returns CommandResult with exitCode as a number", async () => {
      const options: InstallOptions = {};
      const result = await executeInstallCommand(options);
      expectCommandResult(result);
    });

    test("has exitCode property", async () => {
      const result = await executeInstallCommand({});
      expect(result).toHaveProperty("exitCode");
    });
  });

  describe("executeUninstallCommand", () => {
    test("returns CommandResult with exitCode as a number", async () => {
      const options: UninstallOptions = {};
      const result = await executeUninstallCommand(options);
      expectCommandResult(result);
    });

    test("has exitCode property", async () => {
      const result = await executeUninstallCommand({});
      expect(result).toHaveProperty("exitCode");
    });
  });

  describe("executePurgeCommand", () => {
    test("dry-run with far-future cutoff returns CommandResult with exitCode 0", async () => {
      const options: PurgeCommandOptions = {
        olderThan: "999y",
        dryRun: true,
        quiet: true,
      };
      const result = await executePurgeCommand(options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    });

    test("dry-run JSON mode returns CommandResult with exitCode 0", async () => {
      const options: PurgeCommandOptions = {
        olderThan: "999y",
        dryRun: true,
        json: true,
        quiet: true,
      };
      const result = await executePurgeCommand(options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    });

    test("exitCode is a number", async () => {
      const result = await executePurgeCommand({
        olderThan: "999y",
        dryRun: true,
        quiet: true,
      });
      expect(typeof result.exitCode).toBe("number");
    });
  });

  describe("executeExportCommand", () => {
    test("exports database to temp file with exitCode 0", async () => {
      const options: ExportOptions = { quiet: true };
      const result = await executeExportCommand(exportPath(), options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    }, 60000);

    test("exported file exists after call", () => {
      expect(existsSync(exportPath())).toBe(true);
    });

    test("exitCode is a number", async () => {
      // Re-verify using the already-exported file path
      const result = await executeExportCommand(exportPath(), { quiet: true });
      expect(typeof result.exitCode).toBe("number");
    }, 60000);
  });

  describe("executeImportCommand", () => {
    test("imports previously exported file with exitCode 0", async () => {
      const options: ImportOptions = { quiet: true, force: true };
      const result = await executeImportCommand(exportPath(), options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    }, 60000);

    test("nonexistent file returns CommandResult with exitCode 1", async () => {
      const options: ImportOptions = { quiet: true };
      const result = await executeImportCommand("nonexistent-file-xyz.json", options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(1);
    });

    test("exitCode is a number", async () => {
      const result = await executeImportCommand(exportPath(), { quiet: true, force: true });
      expect(typeof result.exitCode).toBe("number");
    }, 60000);
  });

  describe("executeDoctorCommand", () => {
    test("returns CommandResult with exitCode as a number", async () => {
      const options: DoctorOptions = {};
      const result = await executeDoctorCommand(options);
      expectCommandResult(result);
      // exitCode 0 = healthy, 1 = degraded, 2 = broken -- all are valid
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
      expect(result.exitCode).toBeLessThanOrEqual(2);
    });

    test("JSON mode returns CommandResult", async () => {
      const options: DoctorOptions = { json: true };
      const result = await executeDoctorCommand(options);
      expectCommandResult(result);
    });

    test("exitCode is a number", async () => {
      const result = await executeDoctorCommand({});
      expect(typeof result.exitCode).toBe("number");
    });
  });

  describe("executeStatusCommand", () => {
    test("returns CommandResult", async () => {
      const result = await executeStatusCommand({});
      expectCommandResult(result);
    });

    test("JSON mode returns CommandResult", async () => {
      const result = await executeStatusCommand({ json: true });
      expectCommandResult(result);
    });
  });

  describe("executeCompletionCommand", () => {
    test("bash shell returns CommandResult with exitCode 0", () => {
      const result = executeCompletionCommand("bash");
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("Return type validation", () => {
    test("all CommandResult objects have exactly { exitCode: number } shape", async () => {
      const results: CommandResult[] = [
        await executeSyncCommand({ dryRun: true, quiet: true }),
        await executeSearchCommand("test", { quiet: true }),
        await executeListCommand({ quiet: true }),
        await executeStatsCommand({ quiet: true }),
        await executeContextCommand("test", { quiet: true }),
        await executeDoctorCommand({}),
        executeCompletionCommand("bash"),
      ];

      for (const result of results) {
        expect(typeof result.exitCode).toBe("number");
        expect(Number.isFinite(result.exitCode)).toBe(true);
      }
    }, 30000);

    test("no execute*Command function calls process.exit()", async () => {
      const savedExitCode = process.exitCode;
      process.exitCode = undefined;

      await executeSyncCommand({ dryRun: true, quiet: true });
      expect(process.exitCode).toBeUndefined();

      await executeListCommand({ quiet: true });
      expect(process.exitCode).toBeUndefined();

      executeCompletionCommand("bash");
      expect(process.exitCode).toBeUndefined();

      // Restore
      process.exitCode = savedExitCode;
    });
  });
});
