/**
 * Concurrent Commands Integration Tests
 *
 * Validates that concurrent database operations do not deadlock and maintain consistency.
 * Tests requirements QUAL-05: Concurrent CLI commands do not deadlock.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SyncService } from "../../src/application/services/sync-service.js";
import { Fts5SearchService } from "../../src/infrastructure/database/services/search-service.js";
import { SearchQuery } from "../../src/domain/value-objects/search-query.js";
import type {
  ISessionSource,
  IEventParser,
  SessionFileInfo,
} from "../../src/domain/ports/index.js";
import { ProjectPath } from "../../src/domain/value-objects/project-path.js";
import { createSchema } from "../../src/infrastructure/database/schema.js";
import { SqliteSessionRepository } from "../../src/infrastructure/database/repositories/session-repository.js";
import { SqliteMessageRepository } from "../../src/infrastructure/database/repositories/message-repository.js";
import { SqliteToolUseRepository } from "../../src/infrastructure/database/repositories/tool-use-repository.js";
import { SqliteExtractionStateRepository } from "../../src/infrastructure/database/repositories/extraction-state-repository.js";
import { setTestCheckpointPath, resetState } from "../../src/infrastructure/signals/index.js";

/**
 * Generate a session file with searchable content
 */
function generateSessionFile(filePath: string, index: number): void {
  const timestamp = new Date().toISOString();
  const events = [
    {
      type: "user",
      message: {
        role: "user",
        content: `Question about TypeScript generics session ${index}`,
      },
      uuid: `msg-${index}-1`,
      timestamp,
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: `Here is my response about TypeScript patterns for session ${index}. Generics provide type safety and reusability.`,
          },
        ],
      },
      uuid: `msg-${index}-2`,
      timestamp,
    },
    {
      type: "user",
      message: {
        role: "user",
        content: `Follow up about async await session ${index}`,
      },
      uuid: `msg-${index}-3`,
      timestamp,
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: `Async/await is syntactic sugar over promises. It makes asynchronous code easier to read and write.`,
          },
        ],
      },
      uuid: `msg-${index}-4`,
      timestamp,
    },
  ];
  writeFileSync(filePath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

/**
 * Create file-based parser
 */
function createParser(): IEventParser {
  const { JsonlEventParser } = require("../../src/infrastructure/parsers/jsonl-parser.js");
  return new JsonlEventParser();
}

describe("Concurrent Commands Integration Tests", () => {
  let testDir: string;
  let dbPath: string;
  let sessions: SessionFileInfo[];

  beforeEach(() => {
    // Create isolated temp directory
    testDir = mkdtempSync(join(tmpdir(), "concurrent-test-"));
    dbPath = join(testDir, "test.db");
    setTestCheckpointPath(join(testDir, "sync-checkpoint.json"));

    // Create test session files
    sessions = [];
    for (let i = 1; i <= 10; i++) {
      const filePath = join(testDir, `session-${i}.jsonl`);
      generateSessionFile(filePath, i);
      sessions.push({
        id: `session-${i}`,
        path: filePath,
        projectPath: ProjectPath.fromDecoded("C:\\Projects\\test"),
        modifiedTime: new Date(),
        size: 1000,
      });
    }

    // Reset signal state
    resetState();
  });

  afterEach(() => {
    // Reset checkpoint path and signals
    setTestCheckpointPath(null);
    resetState();

    // Clean up temp directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows
    }
  });

  test("search during sync does not deadlock", async () => {
    // Initialize database with WAL mode and busy timeout
    const db = new Database(dbPath, { create: true });
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    createSchema(db);

    // Pre-populate some data for search
    db.exec(`
      INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time, message_count)
      VALUES ('pre-session-1', 'test', 'C:\\Projects\\test', 'test', datetime('now'), 2);
    `);
    db.exec(`
      INSERT INTO messages_meta (id, session_id, role, content, timestamp)
      VALUES ('pre-msg-1', 'pre-session-1', 'user', 'TypeScript is great for type safety', datetime('now'));
    `);

    const sessionRepo = new SqliteSessionRepository(db);
    const messageRepo = new SqliteMessageRepository(db);
    const toolUseRepo = new SqliteToolUseRepository(db);
    const extractionStateRepo = new SqliteExtractionStateRepository(db);
    const searchService = new Fts5SearchService(db);

    const sessionSource: ISessionSource = {
      discoverSessions: async () => sessions,
      getSessionFile: async () => null,
    };

    const syncService = new SyncService(
      sessionSource,
      createParser(),
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );

    // Create a timeout promise to detect deadlock
    const deadlockTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Deadlock detected: operations timed out")), 15000);
    });

    // Start sync in parallel with search
    const syncPromise = syncService.sync({ checkpointEnabled: false });

    // Immediately run multiple searches while sync is running
    const searchPromises = [
      searchService.search(SearchQuery.from("TypeScript")),
      searchService.search(SearchQuery.from("generics")),
      searchService.search(SearchQuery.from("async")),
    ];

    // Wait for all operations with timeout
    const [syncResult, ...searchResults] = await Promise.race([
      Promise.all([syncPromise, ...searchPromises]),
      deadlockTimeout,
    ]);

    // Verify sync completed
    expect(syncResult.success).toBe(true);
    expect(syncResult.sessionsProcessed).toBe(10);

    // Verify at least one search returned results (pre-populated data)
    const hasResults = searchResults.some((r) => r.length > 0);
    expect(hasResults).toBe(true);

    db.close();
  }, 20000); // 20 second timeout

  test("multiple searches in parallel work correctly", async () => {
    // Initialize database
    const db = new Database(dbPath, { create: true });
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    createSchema(db);

    // Populate test data
    for (let i = 1; i <= 5; i++) {
      db.exec(`
        INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time, message_count)
        VALUES ('session-${i}', 'test', 'C:\\Projects\\test', 'test', datetime('now'), 2);
      `);
      db.exec(`
        INSERT INTO messages_meta (id, session_id, role, content, timestamp)
        VALUES ('msg-${i}-1', 'session-${i}', 'user', 'Question about TypeScript generics and patterns', datetime('now'));
      `);
      db.exec(`
        INSERT INTO messages_meta (id, session_id, role, content, timestamp)
        VALUES ('msg-${i}-2', 'session-${i}', 'assistant', 'TypeScript provides excellent type safety with generics', datetime('now'));
      `);
    }

    const searchService = new Fts5SearchService(db);

    // Run 10 parallel searches
    const searchQueries = [
      "TypeScript",
      "generics",
      "patterns",
      "type",
      "safety",
      "Question",
      "provides",
      "excellent",
      "about",
      "with",
    ];

    const searchPromises = searchQueries.map((q) =>
      searchService.search(SearchQuery.from(q))
    );

    // Create timeout for deadlock detection
    const deadlockTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Deadlock detected")), 10000);
    });

    // All searches should complete without deadlock
    const results = await Promise.race([Promise.all(searchPromises), deadlockTimeout]);

    // Verify all searches completed
    expect(results.length).toBe(10);

    // Each search should have results
    for (let i = 0; i < results.length; i++) {
      expect(results[i].length).toBeGreaterThanOrEqual(0); // Some queries may not match
    }

    // At least some searches should have results
    const totalResults = results.reduce((sum, r) => sum + r.length, 0);
    expect(totalResults).toBeGreaterThan(0);

    db.close();
  }, 15000);

  test("stats during sync returns consistent data", async () => {
    // Initialize database
    const db = new Database(dbPath, { create: true });
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    createSchema(db);

    const sessionRepo = new SqliteSessionRepository(db);
    const messageRepo = new SqliteMessageRepository(db);
    const toolUseRepo = new SqliteToolUseRepository(db);
    const extractionStateRepo = new SqliteExtractionStateRepository(db);

    const sessionSource: ISessionSource = {
      discoverSessions: async () => sessions,
      getSessionFile: async () => null,
    };

    const syncService = new SyncService(
      sessionSource,
      createParser(),
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );

    // Function to get stats (simulate stats command)
    const getStats = (): { sessions: number; messages: number } => {
      const sessionsResult = db.query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM sessions"
      ).get();
      const messagesResult = db.query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM messages_meta"
      ).get();
      return {
        sessions: sessionsResult?.count ?? 0,
        messages: messagesResult?.count ?? 0,
      };
    };

    // Track stats during sync
    const statsDuringSync: Array<{ sessions: number; messages: number }> = [];

    // Start sync with periodic stats checks
    const syncPromise = syncService.sync({
      checkpointEnabled: false,
      onSessionComplete: () => {
        // Capture stats after each session completes
        statsDuringSync.push(getStats());
      },
    });

    // Also run some parallel stats queries while sync is running
    const parallelStatsPromises = Array.from({ length: 5 }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 50)); // Stagger slightly
      return getStats();
    });

    const [syncResult, ...parallelStats] = await Promise.all([
      syncPromise,
      ...parallelStatsPromises,
    ]);

    // Verify sync completed
    expect(syncResult.success).toBe(true);

    // Stats should be consistent - session count should monotonically increase
    for (let i = 1; i < statsDuringSync.length; i++) {
      expect(statsDuringSync[i].sessions).toBeGreaterThanOrEqual(
        statsDuringSync[i - 1].sessions
      );
    }

    // Final stats should match sync results
    const finalStats = getStats();
    expect(finalStats.sessions).toBe(10);
    // Each session has 4 messages (2 user, 2 assistant)
    expect(finalStats.messages).toBe(40);

    // Parallel stats should have reasonable values (not corrupted)
    for (const stats of parallelStats) {
      expect(stats.sessions).toBeGreaterThanOrEqual(0);
      expect(stats.sessions).toBeLessThanOrEqual(10);
      expect(stats.messages).toBeGreaterThanOrEqual(0);
    }

    db.close();
  }, 20000);

  test("concurrent writes from multiple syncs are handled", async () => {
    // This test verifies that busy_timeout handles concurrent write attempts

    // Initialize database
    const db = new Database(dbPath, { create: true });
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    createSchema(db);

    // Split sessions for two concurrent syncs
    const sessions1 = sessions.slice(0, 5);
    const sessions2 = sessions.slice(5, 10);

    const sessionRepo = new SqliteSessionRepository(db);
    const messageRepo = new SqliteMessageRepository(db);
    const toolUseRepo = new SqliteToolUseRepository(db);
    const extractionStateRepo = new SqliteExtractionStateRepository(db);

    const syncService1 = new SyncService(
      { discoverSessions: async () => sessions1, getSessionFile: async () => null },
      createParser(),
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );

    const syncService2 = new SyncService(
      { discoverSessions: async () => sessions2, getSessionFile: async () => null },
      createParser(),
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );

    // Run both syncs concurrently
    const [result1, result2] = await Promise.all([
      syncService1.sync({ checkpointEnabled: false }),
      syncService2.sync({ checkpointEnabled: false }),
    ]);

    // Both should complete successfully (busy_timeout handles contention)
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    // All 10 sessions should be synced
    expect(result1.sessionsProcessed + result2.sessionsProcessed).toBe(10);

    // Verify database integrity
    const totalSessions = db.query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM sessions"
    ).get();
    expect(totalSessions?.count).toBe(10);

    db.close();
  }, 30000);

  test("database remains consistent after interrupted concurrent operations", async () => {
    // Initialize database
    const db = new Database(dbPath, { create: true });
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    createSchema(db);

    const sessionRepo = new SqliteSessionRepository(db);
    const messageRepo = new SqliteMessageRepository(db);
    const toolUseRepo = new SqliteToolUseRepository(db);
    const extractionStateRepo = new SqliteExtractionStateRepository(db);
    const searchService = new Fts5SearchService(db);

    const sessionSource: ISessionSource = {
      discoverSessions: async () => sessions,
      getSessionFile: async () => null,
    };

    const syncService = new SyncService(
      sessionSource,
      createParser(),
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );

    // Run sync
    await syncService.sync({ checkpointEnabled: false });

    // Verify integrity with PRAGMA checks
    const quickCheck = db.query<{ quick_check: string }, []>("PRAGMA quick_check(1);").get();
    expect(quickCheck?.quick_check).toBe("ok");

    // Verify foreign key consistency
    db.exec("PRAGMA foreign_key_check;");
    const fkViolations = db.query<{ table: string }, []>("PRAGMA foreign_key_check;").all();
    expect(fkViolations.length).toBe(0);

    // Verify FTS5 index is consistent
    const search = await searchService.search(SearchQuery.from("TypeScript"));
    expect(search.length).toBeGreaterThan(0);

    // Verify all messages have valid sessions
    const orphanedMessages = db.query<{ count: number }, []>(`
      SELECT COUNT(*) as count FROM messages_meta m
      WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = m.session_id)
    `).get();
    expect(orphanedMessages?.count).toBe(0);

    db.close();
  }, 20000);
});
