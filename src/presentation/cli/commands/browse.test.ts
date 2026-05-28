/**
 * Browse Command Tests
 *
 * Tests for interactive browse command with session picker.
 * Dispatch targets are injected via the dispatchers parameter so tests
 * verify dispatch logic only, without hitting real infrastructure.
 *
 * Why DI instead of mock.module: Bun's mock.module() persists across
 * test files in the same process, polluting tests for context/search/
 * show/related commands. Dependency injection scopes mocks to this file.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  createBrowseCommand,
  executeBrowseCommand,
  type BrowseCommandDeps,
} from "./browse.js";

// Dispatch target mocks - injected per-test, never module-mocked
const mockExecuteShow = mock(() =>
  Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })
);
const mockExecuteSearch = mock(() =>
  Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })
);
const mockExecuteContext = mock(() =>
  Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })
);
const mockExecuteRelated = mock(() =>
  Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })
);
import { setTtyOverride, setMocks } from "../pickers/session-picker.js";
import { initializeDatabase, closeDatabase } from "../../../infrastructure/database/index.js";
import { ErrorCode, MemoryError } from "../../../domain/errors/index.js";
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

  /** Build deps for executeBrowseCommand using current test state. */
  function deps(): BrowseCommandDeps {
    return {
      dbPath,
      show: mockExecuteShow as unknown as BrowseCommandDeps["show"],
      search: mockExecuteSearch as unknown as BrowseCommandDeps["search"],
      context: mockExecuteContext as unknown as BrowseCommandDeps["context"],
      related: mockExecuteRelated as unknown as BrowseCommandDeps["related"],
    };
  }

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

    // Reset picker mocks
    mockSearch.mockReset();
    mockSelect.mockReset();
    mockSearch.mockImplementation(() => Promise.resolve("test-session-id"));
    mockSelect.mockImplementation(() => Promise.resolve("show"));

    // Reset dispatch mocks
    mockExecuteShow.mockReset();
    mockExecuteSearch.mockReset();
    mockExecuteContext.mockReset();
    mockExecuteRelated.mockReset();
    mockExecuteShow.mockImplementation(() =>
      Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })
    );
    mockExecuteSearch.mockImplementation(() =>
      Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })
    );
    mockExecuteContext.mockImplementation(() =>
      Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })
    );
    mockExecuteRelated.mockImplementation(() =>
      Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })
    );

    // Setup temp directory and database
    tempDir = createTempDir();
    dbPath = join(tempDir, "test.db");

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

    await executeBrowseCommand({ limit: "100" }, deps());

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

    await executeBrowseCommand({ limit: "100" }, deps());

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

    await executeBrowseCommand({ limit: "50" }, deps());

    // Verify picker was called (limit is passed internally to repo)
    expect(mockSearch).toHaveBeenCalled();
  });

  it("dispatches to show command on show action", async () => {
    setTtyOverride(true);
    mockSelect.mockImplementation(() => Promise.resolve("show"));
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "100" }, deps());

    expect(mockSearch).toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalled();
    expect(mockExecuteShow).toHaveBeenCalledWith("test-session-id", {});
  });

  it("dispatches to search command on search action", async () => {
    setTtyOverride(true);
    mockSelect.mockImplementation(() => Promise.resolve("search"));
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "100" }, deps());

    expect(mockSearch).toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalled();
    expect(mockExecuteSearch).toHaveBeenCalledWith("*", { session: "test-session-id" });
  });

  it("dispatches to context command on context action", async () => {
    setTtyOverride(true);
    mockSelect.mockImplementation(() => Promise.resolve("context"));
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "100" }, deps());

    expect(mockSearch).toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalled();
    // Context command receives the project name extracted from the session
    expect(mockExecuteContext).toHaveBeenCalledWith("test-project", {});
  });

  it("does not dispatch context when the selected session no longer exists", async () => {
    setTtyOverride(true);
    mockSearch.mockImplementation(() => Promise.resolve("missing-session-id"));
    mockSelect.mockImplementation(() => Promise.resolve("context"));
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    const result = await executeBrowseCommand({ limit: "100" }, deps());

    expect(result.exitCode).toBe(0);
    expect(mockExecuteContext).not.toHaveBeenCalled();
  });

  it("dispatches to related command on related action", async () => {
    setTtyOverride(true);
    mockSelect.mockImplementation(() => Promise.resolve("related"));
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "100" }, deps());

    expect(mockSearch).toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalled();
    expect(mockExecuteRelated).toHaveBeenCalledWith("test-session-id", {});
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
    await executeBrowseCommand({ limit: "100" }, deps());

    // Picker should still be called even with no sessions
    expect(mockSearch).toHaveBeenCalled();
  });

  it("formats MemoryError failures without wrapping them again", async () => {
    setTtyOverride(true);
    mockSearch.mockImplementation(() => {
      throw new MemoryError(ErrorCode.DB_CONNECTION_FAILED, "picker storage failed");
    });
    setMocks(mockSearch, mockSelect);
    closeDatabase(db);

    const result = await executeBrowseCommand({ limit: "100" }, deps());

    expect(result.exitCode).toBe(1);
    expect(consoleErrors.join("\n")).toContain("picker storage failed");
  });

  it("shows terminal warning with helpful suggestions in non-TTY", async () => {
    setTtyOverride(false);
    closeDatabase(db);

    await executeBrowseCommand({ limit: "100" }, deps());

    // Should suggest alternatives in error message
    expect(consoleErrors.some((e) => e.includes("memory list"))).toBe(true);
    expect(consoleErrors.some((e) => e.includes("memory show"))).toBe(true);
    expect(consoleErrors.some((e) => e.includes("memory search"))).toBe(true);
  });

  it("uses consistent exit code 1 for TTY errors", async () => {
    setTtyOverride(false);
    closeDatabase(db);

    const result = await executeBrowseCommand({}, deps());

    expect(result.exitCode).toBe(1);
  });
});
