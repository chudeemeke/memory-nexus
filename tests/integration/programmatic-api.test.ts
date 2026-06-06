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
  executeBrowseCommand,
  executeInstallCommand,
  executeUninstallCommand,
  executeStatusCommand,
  executeDoctorCommand,
  executeAuditSecretsCommand,
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
  type BrowseCommandOptions,
  type InstallOptions,
  type UninstallOptions,
  type DoctorOptions,
  type AuditSecretsOptions,
  type PurgeCommandOptions,
  type ExportOptions,
  type ImportOptions,
  type SearchMode,
  type HybridSearchOptions,
  type IStatsService,
  type StatsResult,
  type ProjectStats,
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
  let oldXdgConfig: string | undefined;
  let oldXdgData: string | undefined;
  let oldMemoryHome: string | undefined;
  let oldUserProfile: string | undefined;
  let oldHome: string | undefined;

  beforeAll(() => {
    exportDir = mkdtempSync(join(tmpdir(), "memory-api-test-"));

    // Save old environment variables
    oldXdgConfig = process.env.XDG_CONFIG_HOME;
    oldXdgData = process.env.XDG_DATA_HOME;
    oldMemoryHome = process.env.MEMORY_HOME;
    oldUserProfile = process.env.USERPROFILE;
    oldHome = process.env.HOME;

    // Set new sandboxed environments
    process.env.XDG_CONFIG_HOME = join(exportDir, "config");
    process.env.XDG_DATA_HOME = join(exportDir, "data");
    process.env.MEMORY_HOME = join(exportDir, "memory");
    process.env.USERPROFILE = exportDir;
    process.env.HOME = exportDir;
  });

  afterAll(() => {
    // Restore environment variables
    if (oldXdgConfig !== undefined) {
      process.env.XDG_CONFIG_HOME = oldXdgConfig;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }

    if (oldXdgData !== undefined) {
      process.env.XDG_DATA_HOME = oldXdgData;
    } else {
      delete process.env.XDG_DATA_HOME;
    }

    if (oldMemoryHome !== undefined) {
      process.env.MEMORY_HOME = oldMemoryHome;
    } else {
      delete process.env.MEMORY_HOME;
    }

    if (oldUserProfile !== undefined) {
      process.env.USERPROFILE = oldUserProfile;
    } else {
      delete process.env.USERPROFILE;
    }

    if (oldHome !== undefined) {
      process.env.HOME = oldHome;
    } else {
      delete process.env.HOME;
    }

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
    }, 30_000);

    test("quiet sync returns CommandResult with exitCode 0", async () => {
      const options: SyncCommandOptions = { quiet: true };
      const result = await executeSyncCommand(options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    }, 60_000);

    test("exitCode is a number", async () => {
      const result = await executeSyncCommand({ dryRun: true, quiet: true });
      expect(typeof result.exitCode).toBe("number");
    }, 30_000);
  });

  describe("executeSearchCommand", () => {
    test("nonexistent term returns CommandResult", async () => {
      const options: SearchCommandOptions = { quiet: true };
      const result = await executeSearchCommand("nonexistent-term-xyz-9999", options);
      expectCommandResult(result);
    }, 30_000);

    test("search with limit returns CommandResult with exitCode 0", async () => {
      const options: SearchCommandOptions = { limit: "5", quiet: true };
      const result = await executeSearchCommand("test", options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    }, 30_000);

    test("JSON mode returns CommandResult with exitCode 0", async () => {
      const options: SearchCommandOptions = { json: true, quiet: true };
      const result = await executeSearchCommand("test", options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    }, 30_000);

    test("explicit FTS mode returns CommandResult with exitCode 0", async () => {
      const options: SearchCommandOptions = { mode: "fts", quiet: true };
      const result = await executeSearchCommand("test", options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    }, 30_000);
  });

  describe("executeListCommand", () => {
    test("returns CommandResult", async () => {
      const options: ListCommandOptions = { quiet: true };
      const result = await executeListCommand(options);
      expectCommandResult(result);
    }, 30_000);

    test("with limit returns CommandResult with exitCode 0", async () => {
      const options: ListCommandOptions = { limit: "3", quiet: true };
      const result = await executeListCommand(options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    }, 30_000);

    test("JSON mode returns CommandResult with exitCode 0", async () => {
      const options: ListCommandOptions = { json: true, quiet: true };
      const result = await executeListCommand(options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    }, 30_000);
  });

  describe("executeStatsCommand", () => {
    test("returns CommandResult", async () => {
      const options: StatsCommandOptions = { quiet: true };
      const result = await executeStatsCommand(options);
      expectCommandResult(result);
    }, 30_000);

    test("returns CommandResult with exitCode 0", async () => {
      const options: StatsCommandOptions = { quiet: true };
      const result = await executeStatsCommand(options);
      expect(result.exitCode).toBe(0);
    }, 30_000);

    test("JSON mode returns CommandResult with exitCode 0", async () => {
      const options: StatsCommandOptions = { json: true, quiet: true };
      const result = await executeStatsCommand(options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    }, 30_000);
  });

  describe("executeContextCommand", () => {
    test("nonexistent project returns CommandResult", async () => {
      const options: ContextCommandOptions = { quiet: true };
      const result = await executeContextCommand("nonexistent-project-xyz", options);
      expectCommandResult(result);
    }, 30_000);

    test("returns CommandResult with exitCode as a number", async () => {
      const options: ContextCommandOptions = { quiet: true };
      const result = await executeContextCommand("memory", options);
      expectCommandResult(result);
      expect(typeof result.exitCode).toBe("number");
    }, 30_000);

    test("JSON mode with days filter returns CommandResult", async () => {
      const options: ContextCommandOptions = { json: true, days: 365, quiet: true };
      const result = await executeContextCommand("memory", options);
      expectCommandResult(result);
      expect(typeof result.exitCode).toBe("number");
    }, 30_000);
  });

  describe("executeRelatedCommand", () => {
    test("with session ID returns CommandResult", async () => {
      const options: RelatedCommandOptions = { quiet: true };
      const result = await executeRelatedCommand("session-1", options);
      expectCommandResult(result);
      expect(typeof result.exitCode).toBe("number");
    }, 30_000);

    test("JSON mode returns CommandResult", async () => {
      const options: RelatedCommandOptions = { json: true, quiet: true };
      const result = await executeRelatedCommand("session-1", options);
      expectCommandResult(result);
    }, 30_000);

    test("nonexistent session returns CommandResult", async () => {
      const options: RelatedCommandOptions = { quiet: true };
      const result = await executeRelatedCommand("nonexistent-session-id", options);
      expectCommandResult(result);
    }, 30_000);
  });

  describe("executeShowCommand", () => {
    test("with session ID returns CommandResult", async () => {
      const options: ShowCommandOptions = { quiet: true };
      const result = await executeShowCommand("session-1", options);
      expectCommandResult(result);
    }, 30_000);

    test("JSON mode returns CommandResult", async () => {
      const options: ShowCommandOptions = { json: true, quiet: true };
      const result = await executeShowCommand("session-1", options);
      expectCommandResult(result);
    }, 30_000);

    test("nonexistent session returns CommandResult with exitCode 1", async () => {
      const options: ShowCommandOptions = { quiet: true };
      const result = await executeShowCommand("nonexistent-session-id", options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(1);
    }, 30_000);
  });

  describe("executeBrowseCommand", () => {
    test("non-TTY returns CommandResult with exitCode 1", async () => {
      const options: BrowseCommandOptions = {};
      const result = await executeBrowseCommand(options);
      expectCommandResult(result);
      // In test environment (non-TTY), browse returns exitCode 1
      // with guidance to use specific commands instead
      expect(result.exitCode).toBe(1);
    }, 30_000);

    test("exitCode is a number", async () => {
      const result = await executeBrowseCommand({});
      expect(typeof result.exitCode).toBe("number");
    }, 30_000);
  });

  describe("executeInstallCommand", () => {
    test("returns CommandResult with exitCode as a number", async () => {
      const options: InstallOptions = {};
      const result = await executeInstallCommand(options);
      expectCommandResult(result);
    }, 30_000);

    test("has exitCode property", async () => {
      const result = await executeInstallCommand({});
      expect(result).toHaveProperty("exitCode");
    }, 30_000);
  });

  describe("executeUninstallCommand", () => {
    test("returns CommandResult with exitCode as a number", async () => {
      const options: UninstallOptions = {};
      const result = await executeUninstallCommand(options);
      expectCommandResult(result);
    }, 30_000);

    test("has exitCode property", async () => {
      const result = await executeUninstallCommand({});
      expect(result).toHaveProperty("exitCode");
    }, 30_000);
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
    }, 30_000);

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
    }, 30_000);

    test("exitCode is a number", async () => {
      const result = await executePurgeCommand({
        olderThan: "999y",
        dryRun: true,
        quiet: true,
      });
      expect(typeof result.exitCode).toBe("number");
    }, 30_000);
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
    }, 30_000);

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
    }, 30_000);

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
    }, 15_000);

    test("JSON mode returns CommandResult", async () => {
      const options: DoctorOptions = { json: true };
      const result = await executeDoctorCommand(options);
      expectCommandResult(result);
    }, 15_000);

    test("exitCode is a number", async () => {
      const result = await executeDoctorCommand({});
      expect(typeof result.exitCode).toBe("number");
    }, 15_000);
  });

  describe("executeStatusCommand", () => {
    test("returns CommandResult", async () => {
      const result = await executeStatusCommand({});
      expectCommandResult(result);
    }, 30_000);

    test("JSON mode returns CommandResult", async () => {
      const result = await executeStatusCommand({ json: true });
      expectCommandResult(result);
    }, 30_000);
  });

  describe("executeCompletionCommand", () => {
    test("bash shell returns CommandResult with exitCode 0", () => {
      const result = executeCompletionCommand("bash");
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    }, 30_000);
  });

  describe("executeAuditSecretsCommand", () => {
    test("returns CommandResult for an explicit empty scan", async () => {
      const options: AuditSecretsOptions = { skipDb: true, skipEvents: true, json: true };
      const result = await executeAuditSecretsCommand(options);
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);
    }, 30_000);
  });

  describe("Public API type exports", () => {
    test("SearchMode union covers all valid modes", () => {
      const modes: SearchMode[] = ["auto", "fts", "vector", "hybrid"];
      expect(modes).toHaveLength(4);
      expect(modes).toContain("auto");
      expect(modes).toContain("fts");
      expect(modes).toContain("vector");
      expect(modes).toContain("hybrid");
    }, 30_000);

    test("HybridSearchOptions is assignable with mode and limit", () => {
      const opts: HybridSearchOptions = { mode: "fts", limit: 5 };
      expect(opts.mode).toBe("fts");
      expect(opts.limit).toBe(5);
    }, 30_000);

    test("StatsResult shape matches domain definition", () => {
      const result: StatsResult = {
        totalSessions: 10,
        totalMessages: 100,
        totalToolUses: 50,
        databaseSizeBytes: 1024,
        projectBreakdown: [],
      };
      expect(result.totalSessions).toBe(10);
      expect(result.totalMessages).toBe(100);
      expect(result.totalToolUses).toBe(50);
      expect(result.databaseSizeBytes).toBe(1024);
      expect(result.projectBreakdown).toEqual([]);
    }, 30_000);

    test("ProjectStats shape is consumable", () => {
      const stats: ProjectStats = {
        projectName: "test-project",
        sessionCount: 5,
        messageCount: 42,
      };
      expect(stats.projectName).toBe("test-project");
      expect(stats.sessionCount).toBe(5);
      expect(stats.messageCount).toBe(42);
    }, 30_000);

    test("IStatsService interface is importable", () => {
      const mockService: IStatsService = {
        getStats: async (_projectLimit?: number) => ({
          totalSessions: 0,
          totalMessages: 0,
          totalToolUses: 0,
          databaseSizeBytes: 0,
          projectBreakdown: [],
        }),
      };
      expect(typeof mockService.getStats).toBe("function");
    }, 30_000);
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
        await executeAuditSecretsCommand({ skipDb: true, skipEvents: true }),
        executeCompletionCommand("bash"),
      ];

      for (const result of results) {
        expect(typeof result.exitCode).toBe("number");
        expect(Number.isFinite(result.exitCode)).toBe(true);
      }
    }, 30000);

    test("no execute*Command function calls process.exit()", async () => {
      const savedExitCode = process.exitCode;

      const exitCodeBeforeSync = process.exitCode;
      await executeSyncCommand({ dryRun: true, quiet: true });
      expect(process.exitCode).toBe(exitCodeBeforeSync);

      const exitCodeBeforeList = process.exitCode;
      await executeListCommand({ quiet: true });
      expect(process.exitCode).toBe(exitCodeBeforeList);

      const exitCodeBeforeCompletion = process.exitCode;
      executeCompletionCommand("bash");
      expect(process.exitCode).toBe(exitCodeBeforeCompletion);

      // Restore
      process.exitCode = savedExitCode;
    }, 15_000);
  });
});
