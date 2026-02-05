/**
 * Browse Command Tests
 *
 * Tests for interactive browse command with session picker.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { createBrowseCommand, executeBrowseCommand, setTestDbPath } from "./browse.js";
import { setTtyOverride, setMocks } from "../pickers/session-picker.js";
import { initializeDatabase, closeDatabase } from "../../../infrastructure/database/index.js";
import { ErrorCode } from "../../../domain/errors/index.js";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Store console output for verification
let consoleOutput: string[] = [];
let consoleErrors: string[] = [];
const originalLog = console.log;
const originalError = console.error;

// Mock the picker functions
const mockSearch = mock(() => Promise.resolve("test-session-id"));
const mockSelect = mock(() => Promise.resolve("show"));

// Helper to create temp directory
function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "browse-test-"));
}

// Helper to cleanup temp directory - handles Windows file locking
function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows file locking - ignore cleanup failures in tests
    }
  }
}

describe("createBrowseCommand", () => {
  it("returns Command with 'browse' name", () => {
    const cmd = createBrowseCommand();
    expect(cmd.name()).toBe("browse");
  });

  it("has --limit option", () => {
    const cmd = createBrowseCommand();
    const options = cmd.options;
    const limitOption = options.find(
      (o) => o.short === "-l" || o.long === "--limit"
    );
    expect(limitOption).toBeDefined();
  });

  it("has description", () => {
    const cmd = createBrowseCommand();
    expect(cmd.description()).toBe("Interactive session browser");
  });
});

describe("executeBrowseCommand", () => {
  let tempDir: string;
  let dbPath: string;
  let db: ReturnType<typeof initializeDatabase>["db"];

  beforeEach(() => {
    // Capture console output
    consoleOutput = [];
    consoleErrors = [];
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(" "));
    };

    // Reset mocks
    mockSearch.mockReset();
    mockSelect.mockReset();
    mockSearch.mockImplementation(() => Promise.resolve("test-session-id"));
    mockSelect.mockImplementation(() => Promise.resolve("show"));

    // Setup temp directory and database
    tempDir = createTempDir();
    dbPath = join(tempDir, "test.db");
    setTestDbPath(dbPath);

    // Initialize database with a test session
    const result = initializeDatabase({ path: dbPath });
    db = result.db;
    db.exec(`
      INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time, message_count)
      VALUES ('test-session-id', 'encoded-test-project', 'C:\\Projects\\test-project', 'test-project', '2026-01-31T10:00:00Z', 1)
    `);
    db.exec(`
      INSERT INTO messages_meta (id, session_id, role, content, timestamp)
      VALUES ('msg-1', 'test-session-id', 'user', 'Test message', '2026-01-31T10:00:00Z')
    `);
  });

  afterEach(() => {
    // Restore console
    console.log = originalLog;
    console.error = originalError;

    // Reset TTY and mocks
    setTtyOverride(null);
    setMocks(null, null);
    setTestDbPath(null);

    // Close database before cleanup
    if (db) {
      try {
        closeDatabase(db);
      } catch {
        // Ignore close errors
      }
    }

    // Cleanup temp dir
    cleanupTempDir(tempDir);
  });

  it("shows error in non-TTY mode with helpful suggestions", async () => {
    setTtyOverride(false);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "100" });

    // Should show terminal error
    expect(consoleErrors.some((e) => e.includes("terminal"))).toBe(true);
    // Should suggest alternatives
    expect(consoleErrors.some((e) => e.includes("list") || e.includes("show") || e.includes("search"))).toBe(true);
    // Picker should not be called in non-TTY mode
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("calls picker and returns null on user cancel", async () => {
    setTtyOverride(true);
    mockSelect.mockImplementation(() => Promise.resolve("cancel"));
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "100" });

    // Picker was launched
    expect(mockSearch).toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalled();
    // No errors should be logged for user cancellation
    expect(consoleErrors.filter(e => e.includes("Error:"))).toHaveLength(0);
  });

  it("calls picker with limit option", async () => {
    setTtyOverride(true);
    mockSelect.mockImplementation(() => Promise.resolve("cancel"));
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "50" });

    // Verify picker was called (limit is passed internally to repo)
    expect(mockSearch).toHaveBeenCalled();
  });

  it("dispatches to show command on show action", async () => {
    setTtyOverride(true);
    mockSelect.mockImplementation(() => Promise.resolve("show"));
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "100" });

    // Both picker steps were called
    expect(mockSearch).toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalled();
  });

  it("dispatches to search command on search action", async () => {
    setTtyOverride(true);
    mockSelect.mockImplementation(() => Promise.resolve("search"));
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "100" });

    expect(mockSearch).toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalled();
  });

  it("dispatches to context command on context action", async () => {
    setTtyOverride(true);
    mockSelect.mockImplementation(() => Promise.resolve("context"));
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "100" });

    expect(mockSearch).toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalled();
  });

  it("dispatches to related command on related action", async () => {
    setTtyOverride(true);
    mockSelect.mockImplementation(() => Promise.resolve("related"));
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "100" });

    expect(mockSearch).toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalled();
  });

  it("handles edge cases gracefully", async () => {
    setTtyOverride(true);
    // Mock to cancel immediately - tests the "no sessions" case with fresh empty db
    mockSelect.mockImplementation(() => Promise.resolve("cancel"));
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    // Delete the test session to create empty db scenario
    const { db: db2 } = initializeDatabase({ path: dbPath });
    db2.exec("DELETE FROM sessions");
    closeDatabase(db2);

    // Should handle empty session list without error
    await executeBrowseCommand({ limit: "100" });

    // Picker should still be called even with no sessions
    expect(mockSearch).toHaveBeenCalled();
  });

  it("shows terminal warning with helpful suggestions in non-TTY", async () => {
    setTtyOverride(false);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "100" });

    // Should suggest alternatives in error message
    expect(consoleErrors.some((e) => e.includes("memory list"))).toBe(true);
    expect(consoleErrors.some((e) => e.includes("memory show"))).toBe(true);
    expect(consoleErrors.some((e) => e.includes("memory search"))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it("uses consistent exit code 1 for TTY errors", async () => {
    setTtyOverride(false);
    closeDatabase(db);

    await executeBrowseCommand({});

    expect(process.exitCode).toBe(1);
  });
});
