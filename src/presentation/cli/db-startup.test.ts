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
import { ErrorCode, MemoryNexusError } from "../../domain/index.js";

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

      // Non-TTY can't prompt
      const result = await initializeDatabaseForCli({ dbPath });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(MemoryNexusError);
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

      const result = await initializeDatabaseForCli({ dbPath, json: true });

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
        expect(result.error).toBeInstanceOf(MemoryNexusError);
      }
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

      await initializeDatabaseForCli({ dbPath });

      // Should mention corruption in error output
      expect(consoleErrors.some((e) =>
        e.includes("corrupted") || e.includes("CORRUPTED")
      )).toBe(true);
    });

    test("shows TTY prompt message in non-TTY environment", async () => {
      const dbPath = createTempDbPath();
      tempPaths.push(dbPath);

      writeFileSync(dbPath, "corrupt");

      await initializeDatabaseForCli({ dbPath });

      // Should mention interactive mode for recreation
      expect(consoleErrors.some((e) =>
        e.includes("interactively")
      )).toBe(true);
    });
  });
});
