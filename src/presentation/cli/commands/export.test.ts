/**
 * Export Command Tests
 *
 * Tests for the CLI export command functionality.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Command } from "commander";
import { createExportCommand, executeExportCommand } from "./export.js";
import { initializeDatabase, closeDatabase } from "../../../infrastructure/database/index.js";
import * as connectionModule from "../../../infrastructure/database/connection.js";

// Test directory for file operations
const TEST_DIR = join(tmpdir(), "memory-nexus-export-cmd-test");

describe("Export Command", () => {
  let consoleLogs: string[];
  let consoleErrors: string[];
  let originalExitCode: number | undefined;
  let mockDbPath: string;

  beforeEach(() => {
    // Create fresh test directory
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });

    // Capture console output
    consoleLogs = [];
    consoleErrors = [];
    spyOn(console, "log").mockImplementation((msg) => consoleLogs.push(String(msg)));
    spyOn(console, "error").mockImplementation((msg) => consoleErrors.push(String(msg)));

    // Reset exit code - use 0 as "no error" state since undefined doesn't clear a previous value
    originalExitCode = process.exitCode;
    process.exitCode = 0;

    // Create a test database
    mockDbPath = join(TEST_DIR, "memory.db");
    const { db } = initializeDatabase({ path: mockDbPath });

    // Seed some test data
    db.exec(`
      INSERT INTO sessions (id, project_path_encoded, project_path_decoded,
        project_name, start_time, message_count)
      VALUES ('test-session-1', 'test', '/test', 'test', '2024-01-01T00:00:00Z', 2)
    `);
    db.exec(`
      INSERT INTO messages_meta (id, session_id, role, content, timestamp)
      VALUES
        ('msg-1', 'test-session-1', 'user', 'Hello', '2024-01-01T00:00:00Z'),
        ('msg-2', 'test-session-1', 'assistant', 'Hi', '2024-01-01T00:01:00Z')
    `);

    closeDatabase(db);

    // Mock getDefaultDbPath
    spyOn(connectionModule, "getDefaultDbPath").mockReturnValue(mockDbPath);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("createExportCommand", () => {
    test("creates command with correct name", () => {
      const cmd = createExportCommand();
      expect(cmd.name()).toBe("export");
    });

    test("has correct description", () => {
      const cmd = createExportCommand();
      expect(cmd.description()).toContain("Export database to JSON file");
    });

    test("has required output-file argument", () => {
      const cmd = createExportCommand();
      const args = (cmd as Command & { _args: Array<{ name: () => string }> })._args;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe("output-file");
    });

    test("has --quiet option", () => {
      const cmd = createExportCommand();
      const quietOpt = cmd.options.find((o) => o.long === "--quiet");
      expect(quietOpt).toBeDefined();
    });

    test("has --json option", () => {
      const cmd = createExportCommand();
      const jsonOpt = cmd.options.find((o) => o.long === "--json");
      expect(jsonOpt).toBeDefined();
    });
  });

  describe("executeExportCommand", () => {
    test("creates export file at specified path", async () => {
      const outputPath = join(TEST_DIR, "export.json");

      await executeExportCommand(outputPath);

      expect(existsSync(outputPath)).toBe(true);
    });

    test("outputs summary in default mode", async () => {
      const outputPath = join(TEST_DIR, "export.json");

      await executeExportCommand(outputPath);

      expect(consoleLogs.join("\n")).toContain("Exported 1 sessions");
      expect(consoleLogs.join("\n")).toContain("2 messages");
    });

    test("--quiet suppresses output except path", async () => {
      const outputPath = join(TEST_DIR, "export.json");

      await executeExportCommand(outputPath, { quiet: true });

      // Should only have the path
      expect(consoleLogs.length).toBe(1);
      expect(consoleLogs[0]).toBe(outputPath);
    });

    test("--json outputs stats as JSON", async () => {
      const outputPath = join(TEST_DIR, "export.json");

      await executeExportCommand(outputPath, { json: true });

      const output = JSON.parse(consoleLogs.join(""));
      expect(output.success).toBe(true);
      expect(output.path).toBe(outputPath);
      expect(output.stats).toBeDefined();
      expect(output.stats.sessions).toBe(1);
      expect(output.stats.messages).toBe(2);
    });

    test("sets exit code 1 for invalid output directory", async () => {
      const outputPath = join(TEST_DIR, "nonexistent", "subdir", "export.json");

      await executeExportCommand(outputPath);

      expect(process.exitCode).toBe(1);
      expect(consoleErrors.join("\n")).toContain("Directory does not exist");
    });

    test("sets exit code 1 when database does not exist", async () => {
      // Point to nonexistent database
      spyOn(connectionModule, "getDefaultDbPath").mockReturnValue(
        join(TEST_DIR, "nonexistent.db")
      );

      const outputPath = join(TEST_DIR, "export.json");
      await executeExportCommand(outputPath);

      expect(process.exitCode).toBe(1);
      expect(consoleErrors.join("\n")).toContain("Database does not exist");
    });

    test("includes file size in default output", async () => {
      const outputPath = join(TEST_DIR, "export.json");

      await executeExportCommand(outputPath);

      expect(consoleLogs.join("\n")).toMatch(/File size:\s+\d+/);
    });

    test("json output includes bytes in stats", async () => {
      const outputPath = join(TEST_DIR, "export.json");

      await executeExportCommand(outputPath, { json: true });

      const output = JSON.parse(consoleLogs.join(""));
      expect(output.stats.bytes).toBeGreaterThan(0);
    });
  });
});
