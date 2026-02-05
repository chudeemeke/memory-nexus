/**
 * Integration Test Utilities
 *
 * Shared utilities for integration tests including database setup,
 * test data generation, and cleanup helpers.
 */

import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSchema } from "../../src/infrastructure/database/schema.js";
import type { SessionFileInfo } from "../../src/domain/ports/index.js";
import { ProjectPath } from "../../src/domain/value-objects/project-path.js";

/**
 * Test database configuration
 */
export interface TestDatabaseConfig {
  /** Enable WAL mode (default: true) */
  walMode?: boolean;
  /** Busy timeout in ms (default: 5000) */
  busyTimeout?: number;
  /** Apply schema (default: true) */
  applySchema?: boolean;
}

/**
 * Test database result
 */
export interface TestDatabase {
  /** The database instance */
  db: Database;
  /** Path to the database file (null for :memory:) */
  path: string | null;
  /** Directory containing the database (null for :memory:) */
  directory: string | null;
  /** Cleanup function */
  cleanup: () => void;
}

/**
 * Set up a test database with optimal settings.
 *
 * Creates either an in-memory database or a file-based database in a
 * temporary directory. Configures WAL mode and busy timeout for concurrent
 * access testing.
 *
 * @param config - Configuration options
 * @param useFile - If true, creates a file-based database (default: false)
 * @returns Database instance with cleanup function
 *
 * @example
 * ```typescript
 * const { db, cleanup } = setupTestDatabase();
 * try {
 *   // Run tests
 * } finally {
 *   cleanup();
 * }
 * ```
 */
export function setupTestDatabase(
  config: TestDatabaseConfig = {},
  useFile = false
): TestDatabase {
  const {
    walMode = true,
    busyTimeout = 5000,
    applySchema = true,
  } = config;

  let db: Database;
  let path: string | null = null;
  let directory: string | null = null;

  if (useFile) {
    directory = mkdtempSync(join(tmpdir(), "integration-test-db-"));
    path = join(directory, "test.db");
    db = new Database(path, { create: true });
  } else {
    db = new Database(":memory:");
  }

  // Configure database
  if (walMode && path !== null) {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec(`PRAGMA busy_timeout = ${busyTimeout};`);
  db.exec("PRAGMA foreign_keys = ON;");

  if (applySchema) {
    createSchema(db);
  }

  const cleanup = () => {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
    if (directory) {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors on Windows
      }
    }
  };

  return { db, path, directory, cleanup };
}

/**
 * Test session data
 */
export interface TestSession {
  /** Session file info for sync */
  info: SessionFileInfo;
  /** Path to the generated JSONL file */
  filePath: string;
}

/**
 * Test session options
 */
export interface TestSessionOptions {
  /** Number of sessions to generate (default: 5) */
  count?: number;
  /** Project path for sessions (default: "C:\\Projects\\test") */
  projectPath?: string;
  /** Number of messages per session (default: 4) */
  messagesPerSession?: number;
}

/**
 * Generate test sessions with JSONL files.
 *
 * Creates session JSONL files in a temporary directory with realistic
 * conversation content. Returns session info objects suitable for use
 * with SyncService.
 *
 * @param options - Generation options
 * @returns Array of test sessions with cleanup function
 *
 * @example
 * ```typescript
 * const { sessions, cleanup } = generateTestSessions({ count: 10 });
 * try {
 *   // Use sessions in tests
 * } finally {
 *   cleanup();
 * }
 * ```
 */
export function generateTestSessions(options: TestSessionOptions = {}): {
  sessions: TestSession[];
  directory: string;
  cleanup: () => void;
} {
  const {
    count = 5,
    projectPath = "C:\\Projects\\test",
    messagesPerSession = 4,
  } = options;

  const directory = mkdtempSync(join(tmpdir(), "integration-test-sessions-"));
  const sessions: TestSession[] = [];
  const projectPathObj = ProjectPath.fromDecoded(projectPath);

  for (let i = 1; i <= count; i++) {
    const filePath = join(directory, `session-${i}.jsonl`);
    const sessionId = `session-${i}`;

    // Generate session content
    const events = generateSessionEvents(i, messagesPerSession);
    writeFileSync(filePath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");

    const info: SessionFileInfo = {
      id: sessionId,
      path: filePath,
      projectPath: projectPathObj,
      modifiedTime: new Date(),
      size: 1000,
    };

    sessions.push({ info, filePath });
  }

  const cleanup = () => {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows
    }
  };

  return { sessions, directory, cleanup };
}

/**
 * Generate JSONL events for a session.
 *
 * @param sessionIndex - Index for unique content
 * @param messageCount - Number of messages to generate
 * @returns Array of event objects ready for JSON serialization
 */
function generateSessionEvents(sessionIndex: number, messageCount: number): object[] {
  const events: object[] = [];
  const baseTime = Date.now();

  for (let i = 0; i < messageCount; i++) {
    const timestamp = new Date(baseTime + i * 1000).toISOString();
    const uuid = `msg-${sessionIndex}-${i + 1}`;

    if (i % 2 === 0) {
      // User message
      events.push({
        type: "user",
        message: {
          role: "user",
          content: `User question ${i + 1} in session ${sessionIndex}: How do I implement feature X?`,
        },
        uuid,
        timestamp,
      });
    } else {
      // Assistant message
      events.push({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: `Assistant response ${i + 1} in session ${sessionIndex}: Here's how to implement feature X with TypeScript.`,
            },
          ],
        },
        uuid,
        timestamp,
      });
    }
  }

  return events;
}

/**
 * Clean up test data.
 *
 * Utility function to safely clean up temporary directories.
 * Ignores errors that may occur on Windows due to file locking.
 *
 * @param directories - Directories to clean up
 */
export function cleanupTestData(...directories: (string | null | undefined)[]): void {
  for (const dir of directories) {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors on Windows
      }
    }
  }
}

/**
 * Create a mock ISessionSource for testing.
 *
 * @param sessions - Test sessions to return from discoverSessions
 * @returns Mock session source
 */
export function createMockSessionSource(sessions: TestSession[]): {
  discoverSessions: () => Promise<SessionFileInfo[]>;
  getSessionFile: (id: string) => Promise<string | null>;
} {
  const sessionInfos = sessions.map((s) => s.info);

  return {
    discoverSessions: async () => sessionInfos,
    getSessionFile: async (id: string) => {
      const session = sessions.find((s) => s.info.id === id);
      return session?.filePath ?? null;
    },
  };
}

/**
 * Wait for a condition with timeout.
 *
 * Useful for testing async operations that should complete within a time limit.
 *
 * @param condition - Function that returns true when condition is met
 * @param timeoutMs - Maximum time to wait
 * @param pollIntervalMs - How often to check the condition
 * @returns true if condition was met, false if timeout
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  pollIntervalMs = 50
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}

/**
 * Create a promise that rejects after a timeout.
 *
 * Useful for detecting deadlocks in concurrent tests.
 *
 * @param timeoutMs - Time before rejection
 * @param message - Error message
 * @returns Promise that never resolves, only rejects
 */
export function deadlockTimeout(
  timeoutMs: number,
  message = "Deadlock detected: operation timed out"
): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), timeoutMs);
  });
}
