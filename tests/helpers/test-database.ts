/**
 * Test Database Helper
 *
 * Provides managed file-based SQLite databases for tests.
 * Handles platform-specific cleanup:
 *
 * 1. closeDatabase() flushes WAL and switches to DELETE journal mode,
 *    removing WAL/SHM files that hold OS locks on Windows.
 * 2. Proactive GC (if available) releases Bun's internal file descriptor
 *    before attempting directory removal. Without this, the .db file
 *    stays locked on Windows until the next GC cycle.
 *
 * The GC call is guarded by a runtime check (globalThis.Bun?.gc) so
 * this helper remains portable if the project moves off Bun or if
 * Bun fixes the file descriptor release behavior in a future version.
 *
 * Usage:
 *   const testDb = createTestDatabase();
 *   // ... seed data, run tests ...
 *   testDb.cleanup();
 *
 * Or with schema-only (no seeding needed):
 *   const testDb = createTestDatabase();
 *   const repo = new SomeRepository(testDb.db);
 */

import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
    initializeDatabase,
    closeDatabase,
    type DatabaseInitResult,
} from "../../src/infrastructure/database/connection.js";

/**
 * A managed test database with automatic cleanup.
 */
export interface TestDatabase {
    /** The initialized SQLite database instance */
    db: Database;
    /** Full path to the .db file */
    path: string;
    /** Path to the temp directory containing the database */
    dir: string;
    /** Whether WAL mode is enabled */
    walEnabled: boolean;
    /** Whether sqlite-vec is available */
    sqliteVecAvailable: boolean;
    /**
     * Close the database and remove all temp files.
     * Safe to call multiple times. Handles Windows file locking via
     * closeDatabase() (journal_mode=DELETE) and proactive GC to release
     * Bun's file descriptor before directory removal.
     */
    cleanup: () => void;
}

export interface TestDatabaseOptions {
    /** Custom temp directory prefix. Default: "memory-test-" */
    prefix?: string;
    /** Whether to enable WAL mode. Default: true (matches production) */
    walMode?: boolean;
    /** Whether to apply schema. Default: true */
    applySchema?: boolean;
}

/**
 * Create a managed file-based test database.
 *
 * Creates a unique temp directory, initializes a SQLite database
 * with the full schema (matching production), and returns a handle
 * with a cleanup() method that properly releases all file locks.
 *
 * @example
 * ```typescript
 * let testDb: TestDatabase;
 *
 * beforeEach(() => {
 *   testDb = createTestDatabase();
 *   // Seed data
 *   testDb.db.exec(`INSERT INTO sessions ...`);
 * });
 *
 * afterEach(() => {
 *   testDb.cleanup();
 * });
 * ```
 */
export function createTestDatabase(options: TestDatabaseOptions = {}): TestDatabase {
    const {
        prefix = "memory-test-",
        walMode = true,
        applySchema = true,
    } = options;

    const dir = mkdtempSync(join(tmpdir(), prefix));
    const path = join(dir, "test.db");

    const result: DatabaseInitResult = initializeDatabase({
        path,
        walMode,
        applySchema,
    });

    let closed = false;

    return {
        db: result.db,
        path,
        dir,
        walEnabled: result.walEnabled,
        sqliteVecAvailable: result.sqliteVecAvailable,
        cleanup: () => {
            if (closed) return;
            closed = true;

            try {
                closeDatabase(result.db);
            } catch {
                // Already closed or errored -- proceed to file cleanup
            }

            // Release Bun's internal file descriptor before deleting.
            // Bun's SQLite binding holds the .db file handle until GC,
            // causing EBUSY on Windows. Guarded so this is a no-op if
            // the runtime changes or Bun fixes the behavior.
            if (typeof globalThis.Bun?.gc === "function") {
                Bun.gc(true);
            }

            try {
                rmSync(dir, { recursive: true, force: true });
            } catch {
                // Best-effort cleanup. OS will reclaim temp on reboot.
            }
        },
    };
}

/**
 * Create a temp directory for test file operations (exports, logs, etc.).
 * Returns the path and a cleanup function.
 *
 * @example
 * ```typescript
 * let tmp: { dir: string; cleanup: () => void };
 *
 * beforeEach(() => {
 *   tmp = createTestDir();
 * });
 *
 * afterEach(() => {
 *   tmp.cleanup();
 * });
 * ```
 */
export function createTestDir(prefix = "memory-test-"): {
    dir: string;
    cleanup: () => void;
} {
    const dir = mkdtempSync(join(tmpdir(), prefix));

    return {
        dir,
        cleanup: () => {
            try {
                rmSync(dir, { recursive: true, force: true });
            } catch {
                // Best-effort
            }
        },
    };
}
