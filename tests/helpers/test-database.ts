/**
 * Test Database Helper
 *
 * Provides caller-managed file-based SQLite databases for tests.
 * Cleanup verifies exclusive directory ownership before touching storage:
 *
 * 1. closeDatabase() flushes WAL and switches to DELETE journal mode,
 *    removing WAL/SHM files that hold OS locks on Windows.
 * 2. Proactive GC (if available) helps release Bun's native file handles before
 *    removal. Failed closure or removal reports the retained path and can be retried.
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
import { join } from "node:path";
import { createOwnedTestDirectory, type OwnedTestDirectory } from "./owned-test-directory";
import {
    initializeDatabase,
    closeDatabase,
} from "../../src/infrastructure/database/connection.js";

/**
 * A managed test database with explicit cleanup.
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
     * Throws with the retained path on failure; successful close is not repeated.
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

/** Local lifecycle dependencies keep failure tests isolated from other callers. */
export interface TestDatabaseDependencies {
    initialize: typeof initializeDatabase;
    close: typeof closeDatabase;
    createDirectory(prefix: string): OwnedTestDirectory;
    collect(): void;
}

const defaultDependencies: TestDatabaseDependencies = {
    initialize: initializeDatabase,
    close: closeDatabase,
    createDirectory: createOwnedTestDirectory,
    collect() {
        if (typeof globalThis.Bun?.gc === "function") Bun.gc(true);
    },
};

/**
 * Create a managed file-based test database.
 *
 * Creates a unique temp directory, initializes a SQLite database
 * with the full schema (matching production), and returns a handle
 * with a cleanup() method that closes its handle and reports retained storage.
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
export function createTestDatabase(options: TestDatabaseOptions = {}, overrides: Partial<TestDatabaseDependencies> = {}): TestDatabase {
    const {
        prefix = "memory-test-",
        walMode = true,
        applySchema = true,
    } = options;

    const dependencies = {...defaultDependencies, ...overrides};
    const storage = dependencies.createDirectory(prefix);
    const dir = storage.dir;
    const path = join(dir, "test.db");
    let result;
    try { result = dependencies.initialize({path, walMode, applySchema}); }
    catch (cause) {
        try { dependencies.collect(); storage.cleanup(); }
        catch (cleanupError) {
            throw new AggregateError([cause, cleanupError], `Test database initialization failed; retained: ${dir}`);
        }
        throw cause;
    }
    let closed = false;
    let removed = false;

    return {
        db: result.db,
        path,
        dir,
        walEnabled: result.walEnabled,
        sqliteVecAvailable: result.sqliteVecAvailable,
        cleanup: () => {
            if (removed) return;
            storage.assertOwned();
            try {
                if (!closed) { dependencies.close(result.db); closed = true; }
                dependencies.collect();
                storage.cleanup();
                removed = true;
            } catch (cause) {
                throw new Error(`Test database cleanup failed; retained: ${dir}`, {cause});
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
    return createOwnedTestDirectory(prefix);
}
