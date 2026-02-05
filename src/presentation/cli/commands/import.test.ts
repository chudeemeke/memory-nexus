/**
 * Import Command Tests
 *
 * Tests for the CLI import command functionality.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Command } from "commander";
import { createImportCommand, executeImportCommand } from "./import.js";
import {
  initializeDatabase,
  closeDatabase,
} from "../../../infrastructure/database/index.js";
import * as connectionModule from "../../../infrastructure/database/connection.js";
import { exportToJson } from "../../../application/services/index.js";

// Base test directory - unique per test run
const TEST_BASE = join(tmpdir(), `memory-nexus-import-cmd-test-${process.pid}`);

describe("Import Command", () => {
  let consoleLogs: string[];
  let consoleErrors: string[];
  let originalExitCode: number | undefined;
  let testDir: string;
  let mockDbPath: string;
  let exportFilePath: string;
  let testCounter = 0;

  beforeEach(async () => {
    testCounter++;
    // Create unique test directory per test
    testDir = join(TEST_BASE, `test-${testCounter}`);
    mkdirSync(testDir, { recursive: true });

    // Capture console output
    consoleLogs = [];
    consoleErrors = [];
    spyOn(console, "log").mockImplementation((msg) =>
      consoleLogs.push(String(msg))
    );
    spyOn(console, "error").mockImplementation((msg) =>
      consoleErrors.push(String(msg))
    );

    // Reset exit code - use 0 as "no error" state since undefined doesn't clear a previous value
    originalExitCode = process.exitCode;
    process.exitCode = 0;

    // Create a test export file
    const sourceDbPath = join(testDir, "source.db");
    const { db: sourceDb } = initializeDatabase({ path: sourceDbPath });

    sourceDb.exec(`
      INSERT INTO sessions (id, project_path_encoded, project_path_decoded,
        project_name, start_time, message_count)
      VALUES ('test-session-1', 'test', '/test', 'test', '2024-01-01T00:00:00Z', 2)
    `);
    sourceDb.exec(`
      INSERT INTO messages_meta (id, session_id, role, content, timestamp)
      VALUES
        ('msg-1', 'test-session-1', 'user', 'Hello', '2024-01-01T00:00:00Z'),
        ('msg-2', 'test-session-1', 'assistant', 'Hi', '2024-01-01T00:01:00Z')
    `);

    exportFilePath = join(testDir, "backup.json");
    await exportToJson(sourceDb, exportFilePath);
    closeDatabase(sourceDb);

    // Create empty target database (fresh path each test)
    mockDbPath = join(testDir, "memory.db");
    const { db } = initializeDatabase({ path: mockDbPath });
    closeDatabase(db);

    // Mock getDefaultDbPath
    spyOn(connectionModule, "getDefaultDbPath").mockReturnValue(mockDbPath);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    // Try to clean up, ignore errors on Windows due to file locking
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createImportCommand", () => {
    test("creates command with correct name", () => {
      const cmd = createImportCommand();
      expect(cmd.name()).toBe("import");
    });

    test("has correct description", () => {
      const cmd = createImportCommand();
      expect(cmd.description()).toContain("Import database from JSON backup");
    });

    test("has required input-file argument", () => {
      const cmd = createImportCommand();
      const args = (cmd as Command & { _args: Array<{ name: () => string }> })
        ._args;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe("input-file");
    });

    test("has --clear option", () => {
      const cmd = createImportCommand();
      const clearOpt = cmd.options.find((o) => o.long === "--clear");
      expect(clearOpt).toBeDefined();
    });

    test("has --quiet option", () => {
      const cmd = createImportCommand();
      const quietOpt = cmd.options.find((o) => o.long === "--quiet");
      expect(quietOpt).toBeDefined();
    });

    test("has --json option", () => {
      const cmd = createImportCommand();
      const jsonOpt = cmd.options.find((o) => o.long === "--json");
      expect(jsonOpt).toBeDefined();
    });

    test("has --force option", () => {
      const cmd = createImportCommand();
      const forceOpt = cmd.options.find((o) => o.long === "--force");
      expect(forceOpt).toBeDefined();
    });
  });

  describe("executeImportCommand", () => {
    test("imports from valid file", async () => {
      await executeImportCommand(exportFilePath);

      // Should not have errors
      expect(process.exitCode).toBe(0);

      // Verify data was imported
      const { db } = initializeDatabase({ path: mockDbPath });
      const sessions = db
        .query<{ count: number }, []>("SELECT COUNT(*) as count FROM sessions")
        .get();
      expect(sessions?.count).toBe(1);
      closeDatabase(db);
    });

    test("outputs summary in default mode", async () => {
      await executeImportCommand(exportFilePath);

      const output = consoleLogs.join("\n");
      expect(output).toContain("Imported 1 sessions");
      expect(output).toContain("2 messages");
    });

    test("validation failure shows error", async () => {
      const invalidFile = join(testDir, "invalid.json");
      await Bun.write(invalidFile, "not valid json");

      await executeImportCommand(invalidFile);

      expect(process.exitCode).toBe(1);
      expect(consoleErrors.join("\n")).toContain("Invalid backup file");
    });

    test("sets exit code 1 for missing file", async () => {
      await executeImportCommand("/nonexistent/file.json");

      expect(process.exitCode).toBe(1);
      expect(consoleErrors.join("\n")).toContain("does not exist");
    });

    test("--clear option replaces existing data", async () => {
      // First, add some data to the target database
      const { db } = initializeDatabase({ path: mockDbPath });
      db.exec(`
        INSERT INTO sessions (id, project_path_encoded, project_path_decoded,
          project_name, start_time, message_count)
        VALUES ('existing-session', 'enc', '/dec', 'proj', '2024-02-01T00:00:00Z', 0)
      `);
      closeDatabase(db);

      // Import with --clear
      await executeImportCommand(exportFilePath, { clear: true });

      // Verify only imported data exists (existing was removed)
      const { db: checkDb } = initializeDatabase({ path: mockDbPath });
      const sessions = checkDb
        .query<{ id: string }, []>("SELECT id FROM sessions")
        .all();
      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe("test-session-1"); // From backup
      closeDatabase(checkDb);
    });

    test("--json outputs stats as JSON", async () => {
      await executeImportCommand(exportFilePath, { json: true });

      const output = JSON.parse(consoleLogs.join(""));
      expect(output.success).toBe(true);
      expect(output.path).toBe(exportFilePath);
      expect(output.stats).toBeDefined();
      expect(output.stats.sessions).toBe(1);
      expect(output.stats.messages).toBe(2);
    });

    test("--json shows error on failure", async () => {
      const invalidFile = join(testDir, "invalid.json");
      await Bun.write(invalidFile, "not valid json");

      await executeImportCommand(invalidFile, { json: true });

      const output = JSON.parse(consoleLogs.join(""));
      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
    });

    test("warns about existing data without --force or --clear", async () => {
      // Add existing data
      const { db } = initializeDatabase({ path: mockDbPath });
      db.exec(`
        INSERT INTO sessions (id, project_path_encoded, project_path_decoded,
          project_name, start_time, message_count)
        VALUES ('existing', 'enc', '/dec', 'proj', '2024-02-01T00:00:00Z', 0)
      `);
      closeDatabase(db);

      await executeImportCommand(exportFilePath);

      // Should fail without --force or --clear
      expect(process.exitCode).toBe(1);
    });

    test("--force allows merge with existing data", async () => {
      // Add existing data with DIFFERENT id
      const { db } = initializeDatabase({ path: mockDbPath });
      db.exec(`
        INSERT INTO sessions (id, project_path_encoded, project_path_decoded,
          project_name, start_time, message_count)
        VALUES ('existing-other', 'enc', '/dec', 'proj', '2024-02-01T00:00:00Z', 0)
      `);
      closeDatabase(db);

      await executeImportCommand(exportFilePath, { force: true });

      // Check for any error messages - exitCode 0 means success
      if (consoleErrors.length > 0 || process.exitCode !== 0) {
        throw new Error(`Merge failed: exit=${process.exitCode}, errors=${JSON.stringify(consoleErrors)}, logs=${JSON.stringify(consoleLogs)}`);
      }

      const { db: checkDb } = initializeDatabase({ path: mockDbPath });
      const sessions = checkDb
        .query<{ count: number }, []>("SELECT COUNT(*) as count FROM sessions")
        .get();
      expect(sessions?.count).toBe(2);
      closeDatabase(checkDb);
    });

    test("shows Replaced label when --clear is used", async () => {
      await executeImportCommand(exportFilePath, { clear: true });

      expect(consoleLogs.join("\n")).toContain("Replaced");
    });

    test("shows Imported label when not clearing", async () => {
      await executeImportCommand(exportFilePath);

      expect(consoleLogs.join("\n")).toContain("Imported");
    });
  });
});
