/**
 * Database Startup Utilities Tests
 *
 * Tests for CLI database initialization with integrity checks and recovery.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  initializeDatabaseForCli,
  isTTY,
  type DbStartupOptions,
} from "./db-startup.js";
import { closeDatabase } from "../../infrastructure/database/index.js";
import { ErrorCode, MemoryError } from "../../domain/index.js";

/**
 * Create a temporary database path in a unique directory
 */
function createTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "memory-nexus-dbstartup-"));
  return join(dir, "test.db");
}

/**
 * Clean up temporary database directory
 */
function cleanupTempDb(dbPath: string): void {
  const dir = dirname(dbPath);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may hold locks - ignore cleanup failures
  }
}

describe("db-startup", () => {
  // Track paths to clean up
  const tempPaths: string[] = [];
  const consoleLogs: string[] = [];
  const consoleErrors: string[] = [];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
    // Capture console output
    consoleLogs.length = 0;
    consoleErrors.length = 0;
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args: unknown[]) => {
      consoleLogs.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    // Restore console
    console.log = originalLog;
    console.error = originalError;

    // Clean up temp paths
    for (const path of tempPaths) {
      cleanupTempDb(path);
    }
    tempPaths.length = 0;
  });

  describe("isTTY", () => {
    test("returns boolean based on process.stdin and stdout", () => {
      const result = isTTY();
      expect(typeof result).toBe("boolean");
    });

    test("requires both stdin and stdout to be TTYs", () => {
      expect(isTTY({ isTTY: true }, { isTTY: false })).toBe(false);
      expect(isTTY({ isTTY: false }, { isTTY: true })).toBe(false);
      expect(isTTY({ isTTY: true }, { isTTY: true })).toBe(true);
      expect(isTTY({}, { isTTY: true })).toBe(false);
    });
  });

  describe("initializeDatabaseForCli", () => {
    test("succeeds with new database", async () => {
      const dbPath = createTempDbPath();
      tempPaths.push(dbPath);

      const result = await initializeDatabaseForCli({ dbPath });

      expect(result.success).toBe(true);
      if (result.success) {
        closeDatabase(result.db);
      }
    });

    test("succeeds with existing valid database", async () => {
      const dbPath = createTempDbPath();
      tempPaths.push(dbPath);

      // Create database first
      const result1 = await initializeDatabaseForCli({ dbPath });
      expect(result1.success).toBe(true);
      if (result1.success) {
        closeDatabase(result1.db);
      }

      // Re-open should work with integrity check
      const result2 = await initializeDatabaseForCli({ dbPath });
      expect(result2.success).toBe(true);
      if (result2.success) {
        closeDatabase(result2.db);
      }
    });

    test("fails with corrupted database in non-TTY", async () => {
      const dbPath = createTempDbPath();
      tempPaths.push(dbPath);

      // Create corrupted file
      writeFileSync(dbPath, "not a valid sqlite database");

      const result = await initializeDatabaseForCli({ dbPath }, { isTTY: () => false });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(MemoryError);
        expect(result.error.code).toBe(ErrorCode.DB_CORRUPTED);
      }

      // Should show error message
      expect(consoleErrors.some((e) => e.includes("DB_CORRUPTED"))).toBe(true);
    });

    test("outputs JSON error when json option is true", async () => {
      const dbPath = createTempDbPath();
      tempPaths.push(dbPath);

      // Create corrupted file
      writeFileSync(dbPath, "corrupted data");

      const result = await initializeDatabaseForCli({ dbPath, json: true }, { isTTY: () => false });

      expect(result.success).toBe(false);

      // Should output JSON
      const jsonOutput = consoleErrors.find((e) => e.includes("{"));
      expect(jsonOutput).toBeDefined();
      if (jsonOutput) {
        const parsed = JSON.parse(jsonOutput);
        expect(parsed.error.code).toBe(ErrorCode.DB_CORRUPTED);
      }
    });

    test("skips integrity check when skipCheck is true", async () => {
      const dbPath = createTempDbPath();
      tempPaths.push(dbPath);

      // Create database first
      const result1 = await initializeDatabaseForCli({ dbPath });
      if (result1.success) {
        closeDatabase(result1.db);
      }

      // Re-open with skipCheck should still work
      const result2 = await initializeDatabaseForCli({ dbPath, skipCheck: true });
      expect(result2.success).toBe(true);
      if (result2.success) {
        closeDatabase(result2.db);
      }
    });

    test("handles initialization errors", async () => {
      // Use an invalid path that cannot be created (NUL device on Windows, /dev/null on Unix)
      const invalidPath = process.platform === "win32"
        ? "NUL/cannot/create/db.sqlite"
        : "/dev/null/cannot/create/db.sqlite";

      const result = await initializeDatabaseForCli({
        dbPath: invalidPath,
      });

      // The initializeDatabaseSafe will wrap this error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(MemoryError);
      }
    });

    test("uses injected default path and disables quickCheck for missing database", async () => {
      const init = mock((config) => ({ db: { config } as any, sqliteVecAvailable: true }));

      const result = await initializeDatabaseForCli({}, {
        getDefaultDbPath: () => "custom-default.db",
        existsSync: () => false,
        initializeDatabaseSafe: init as any,
      });

      expect(result.success).toBe(true);
      expect(init).toHaveBeenCalledWith({
        path: "custom-default.db",
        quickCheck: false,
      });
    });

    test("uses quickCheck for existing database", async () => {
      const init = mock((config) => ({ db: { config } as any, sqliteVecAvailable: true }));

      const result = await initializeDatabaseForCli({ dbPath: "existing.db" }, {
        existsSync: () => true,
        initializeDatabaseSafe: init as any,
      });

      expect(result.success).toBe(true);
      expect(init).toHaveBeenCalledWith({
        path: "existing.db",
        quickCheck: true,
      });
    });

    test("aborts corrupted database recovery when interactive confirmation is declined", async () => {
      const corrupted = new MemoryError(ErrorCode.DB_CORRUPTED, "bad db");
      const init = mock(() => {
        throw corrupted;
      });
      const confirm = mock(async () => false);
      const backup = mock(() => "backup.db");

      const result = await initializeDatabaseForCli({ dbPath: "bad.db" }, {
        existsSync: () => true,
        initializeDatabaseSafe: init as any,
        isTTY: () => true,
        confirm,
        backupCorruptedDatabase: backup,
      });

      expect(result.success).toBe(false);
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(backup).not.toHaveBeenCalled();
      expect(consoleLogs.some((line) => line.includes("Aborted"))).toBe(true);
    });

    test("backs up and recreates corrupted database when interactive confirmation is accepted", async () => {
      const corrupted = new MemoryError(ErrorCode.DB_CORRUPTED, "bad db");
      const init = mock((config) => {
        if (config.quickCheck) throw corrupted;
        return { db: { recreated: true } as any, sqliteVecAvailable: true };
      });
      const backup = mock(() => "bad.db.corrupted.2026");

      const result = await initializeDatabaseForCli({ dbPath: "bad.db" }, {
        existsSync: () => true,
        initializeDatabaseSafe: init as any,
        isTTY: () => true,
        confirm: async () => true,
        backupCorruptedDatabase: backup,
      });

      expect(result.success).toBe(true);
      expect(backup).toHaveBeenCalledWith("bad.db");
      expect(init).toHaveBeenLastCalledWith({
        path: "bad.db",
        quickCheck: false,
      });
      expect(consoleLogs.some((line) => line.includes("Backed up corrupted database"))).toBe(true);
      expect(consoleLogs.some((line) => line.includes("Fresh database created"))).toBe(true);
    });

    test("wraps fresh database recreation failures after corrupted backup", async () => {
      const corrupted = new MemoryError(ErrorCode.DB_CORRUPTED, "bad db");
      const init = mock((config) => {
        if (config.quickCheck) throw corrupted;
        throw "permission denied";
      });

      const result = await initializeDatabaseForCli({ dbPath: "bad.db", json: true }, {
        existsSync: () => true,
        initializeDatabaseSafe: init as any,
        isTTY: () => true,
        confirm: async () => true,
        backupCorruptedDatabase: () => "backup.db",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ErrorCode.DB_CONNECTION_FAILED);
        expect(result.error.message).toContain("permission denied");
      }
      const jsonOutput = consoleErrors.find((line) => line.includes("DB_CONNECTION_FAILED"));
      expect(jsonOutput).toBeDefined();
    });

    test("reports JSON recovery success without human-only recovery chatter", async () => {
      const corrupted = new MemoryError(ErrorCode.DB_CORRUPTED, "bad db");
      const init = mock((config) => {
        if (config.quickCheck) throw corrupted;
        return { db: { recreated: true } as any, sqliteVecAvailable: true };
      });
      const backup = mock(() => "bad.db.corrupted.2026");

      const result = await initializeDatabaseForCli({ dbPath: "bad.db", json: true }, {
        existsSync: () => true,
        initializeDatabaseSafe: init as any,
        isTTY: () => true,
        confirm: async () => true,
        backupCorruptedDatabase: backup,
      });

      expect(result.success).toBe(true);
      expect(backup).toHaveBeenCalledWith("bad.db");
      expect(consoleLogs.some((line) => line.includes("Backed up corrupted database"))).toBe(false);
      expect(consoleLogs.some((line) => line.includes("Fresh database created"))).toBe(false);
    });

    test("preserves MemoryError from fresh database recreation failure", async () => {
      const corrupted = new MemoryError(ErrorCode.DB_CORRUPTED, "bad db");
      const recreationError = new MemoryError(ErrorCode.DB_CONNECTION_FAILED, "still locked");
      const init = mock((config) => {
        if (config.quickCheck) throw corrupted;
        throw recreationError;
      });

      const result = await initializeDatabaseForCli({ dbPath: "bad.db" }, {
        existsSync: () => true,
        initializeDatabaseSafe: init as any,
        isTTY: () => true,
        confirm: async () => true,
        backupCorruptedDatabase: () => "backup.db",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(recreationError);
      }
      expect(consoleErrors.some((line) => line.includes("still locked"))).toBe(true);
    });

    test("wraps non-MemoryError initialization failures before formatting", async () => {
      const result = await initializeDatabaseForCli({ dbPath: "bad.db", json: true }, {
        existsSync: () => true,
        initializeDatabaseSafe: (() => {
          throw "sqlite busy";
        }) as any,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ErrorCode.DB_CONNECTION_FAILED);
        expect(result.error.message).toBe("sqlite busy");
      }
      const jsonOutput = consoleErrors.find((line) => line.includes("DB_CONNECTION_FAILED"));
      expect(jsonOutput).toBeDefined();
    });

    test("respects custom dbPath option", async () => {
      const dbPath = createTempDbPath();
      tempPaths.push(dbPath);

      const result = await initializeDatabaseForCli({ dbPath });
      expect(result.success).toBe(true);

      // Verify database was created at the specified path
      expect(existsSync(dbPath)).toBe(true);

      if (result.success) {
        closeDatabase(result.db);
      }
    });
  });

  describe("corrupted database recovery", () => {
    // Note: Full recovery tests require TTY simulation which is complex
    // These tests verify the non-TTY path and error formatting

    test("shows recovery message for corrupted database in non-TTY", async () => {
      const dbPath = createTempDbPath();
      tempPaths.push(dbPath);

      writeFileSync(dbPath, "corrupt");

      await initializeDatabaseForCli({ dbPath }, { isTTY: () => false });

      // Should mention corruption in error output
      expect(consoleErrors.some((e) =>
        e.includes("corrupted") || e.includes("CORRUPTED")
      )).toBe(true);
    });

    test("shows TTY prompt message in non-TTY environment", async () => {
      const dbPath = createTempDbPath();
      tempPaths.push(dbPath);

      writeFileSync(dbPath, "corrupt");

      await initializeDatabaseForCli({ dbPath }, { isTTY: () => false });

      // Should mention interactive mode for recreation
      expect(consoleErrors.some((e) =>
        e.includes("interactively")
      )).toBe(true);
    });
  });
});
