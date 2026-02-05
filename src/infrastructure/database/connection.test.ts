/**
 * Database Connection Tests
 *
 * Tests for database initialization, WAL mode, pragmas, busy timeout,
 * integrity checks, and cleanup.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { mkdtempSync, rmSync, existsSync, statSync, writeFileSync } from "node:fs";
import {
    initializeDatabase,
    initializeDatabaseSafe,
    closeDatabase,
    checkpointDatabase,
    getDefaultDbPath,
    type DatabaseConfig,
} from "./connection.js";
import { ErrorCode, MemoryNexusError } from "../../domain/index.js";

/**
 * Create a temporary database path in a unique directory
 */
function createTempDbPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "memory-nexus-test-"));
    return join(dir, "test.db");
}

/**
 * Clean up temporary database directory
 * Handles Windows file locking with retry
 */
function cleanupTempDb(dbPath: string): void {
    const dir = dirname(dbPath);
    try {
        rmSync(dir, { recursive: true, force: true });
    } catch {
        // Windows may hold locks briefly after db.close()
        // Ignore cleanup failures - OS will clean temp eventually
    }
}

describe("Database Connection", () => {
    // Track databases to clean up
    const tempPaths: string[] = [];
    const openDbs: Database[] = [];

    afterEach(() => {
        // Close any open databases
        for (const db of openDbs) {
            try {
                db.close();
            } catch {
                // Already closed
            }
        }
        openDbs.length = 0;

        // Clean up temp files
        for (const path of tempPaths) {
            cleanupTempDb(path);
        }
        tempPaths.length = 0;
    });

    describe("initializeDatabase", () => {
        test("initializes in-memory database", () => {
            const { db, fts5Available } = initializeDatabase({
                path: ":memory:",
            });
            openDbs.push(db);

            expect(db).toBeDefined();
            expect(fts5Available).toBe(true);
        });

        test("enables WAL mode for file-based database", () => {
            const dbPath = createTempDbPath();
            tempPaths.push(dbPath);

            const { db, walEnabled } = initializeDatabase({
                path: dbPath,
                walMode: true,
            });
            openDbs.push(db);

            expect(walEnabled).toBe(true);

            // Verify via pragma
            const result = db.query("PRAGMA journal_mode;").get() as { journal_mode: string };
            expect(result.journal_mode).toBe("wal");
        });

        test("skips WAL mode when disabled", () => {
            const { db, walEnabled } = initializeDatabase({
                path: ":memory:",
                walMode: false,
            });
            openDbs.push(db);

            expect(walEnabled).toBe(false);

            // In-memory default is "memory" journal mode
            const result = db.query("PRAGMA journal_mode;").get() as { journal_mode: string };
            expect(result.journal_mode).not.toBe("wal");
        });

        test("applies schema when applySchema is true", () => {
            const { db } = initializeDatabase({
                path: ":memory:",
                applySchema: true,
            });
            openDbs.push(db);

            // Check if sessions table exists
            const tables = db.query(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
            ).all();
            expect(tables).toHaveLength(1);
        });

        test("skips schema when applySchema is false", () => {
            const { db } = initializeDatabase({
                path: ":memory:",
                applySchema: false,
            });
            openDbs.push(db);

            // Check that sessions table does not exist
            const tables = db.query(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
            ).all();
            expect(tables).toHaveLength(0);
        });

        test("configures cache size pragma", () => {
            const customCacheSize = -32000; // 32MB
            const { db } = initializeDatabase({
                path: ":memory:",
                cacheSize: customCacheSize,
            });
            openDbs.push(db);

            const result = db.query("PRAGMA cache_size;").get() as { cache_size: number };
            expect(result.cache_size).toBe(customCacheSize);
        });

        test("enables foreign keys", () => {
            const { db } = initializeDatabase({
                path: ":memory:",
            });
            openDbs.push(db);

            const result = db.query("PRAGMA foreign_keys;").get() as { foreign_keys: number };
            expect(result.foreign_keys).toBe(1);
        });

        test("creates parent directory for new database", () => {
            const dbPath = createTempDbPath();
            const nestedPath = join(dirname(dbPath), "nested", "deep", "test.db");
            tempPaths.push(dbPath);

            const { db } = initializeDatabase({
                path: nestedPath,
            });
            openDbs.push(db);

            // The nested directories should exist
            expect(existsSync(dirname(nestedPath))).toBe(true);
            expect(existsSync(nestedPath)).toBe(true);
        });
    });

    describe("closeDatabase", () => {
        test("checkpoints WAL file on close", () => {
            const dbPath = createTempDbPath();
            tempPaths.push(dbPath);

            const { db } = initializeDatabase({
                path: dbPath,
                walMode: true,
            });

            // Insert some data to create WAL entries
            db.exec(`
                INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                VALUES ('test-session', 'C--test', '/test', 'test', datetime('now'))
            `);

            // Close database with checkpoint
            closeDatabase(db);

            // After TRUNCATE checkpoint, WAL file should be very small or non-existent
            const walPath = dbPath + "-wal";
            if (existsSync(walPath)) {
                const walStats = statSync(walPath);
                // WAL header is 32 bytes, so after truncate it should be small
                expect(walStats.size).toBeLessThanOrEqual(32);
            }
            // If WAL file doesn't exist, checkpoint succeeded
        });
    });

    describe("checkpointDatabase", () => {
        test("performs passive checkpoint without error", () => {
            const dbPath = createTempDbPath();
            tempPaths.push(dbPath);

            const { db } = initializeDatabase({
                path: dbPath,
                walMode: true,
            });
            openDbs.push(db);

            // Insert some data
            db.exec(`
                INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                VALUES ('test-session', 'C--test', '/test', 'test', datetime('now'))
            `);

            // Should not throw
            expect(() => checkpointDatabase(db)).not.toThrow();
        });
    });

    describe("getDefaultDbPath", () => {
        test("returns path containing .memory-nexus", () => {
            const path = getDefaultDbPath();
            expect(path).toContain(".memory-nexus");
        });

        test("returns path ending with memory.db", () => {
            const path = getDefaultDbPath();
            expect(path).toMatch(/memory\.db$/);
        });
    });

    describe("performance pragmas", () => {
        test("sets synchronous to NORMAL", () => {
            const { db } = initializeDatabase({
                path: ":memory:",
            });
            openDbs.push(db);

            const result = db.query("PRAGMA synchronous;").get() as { synchronous: number };
            // NORMAL = 1
            expect(result.synchronous).toBe(1);
        });

        test("sets temp_store to MEMORY", () => {
            const { db } = initializeDatabase({
                path: ":memory:",
            });
            openDbs.push(db);

            const result = db.query("PRAGMA temp_store;").get() as { temp_store: number };
            // MEMORY = 2
            expect(result.temp_store).toBe(2);
        });
    });

    describe("busy_timeout", () => {
        test("sets default busy_timeout to 5000ms", () => {
            const { db } = initializeDatabase({
                path: ":memory:",
            });
            openDbs.push(db);

            // PRAGMA busy_timeout returns { timeout: number }
            const result = db.query("PRAGMA busy_timeout;").get() as { timeout: number };
            expect(result.timeout).toBe(5000);
        });

        test("sets custom busy_timeout", () => {
            const { db } = initializeDatabase({
                path: ":memory:",
                busyTimeout: 10000,
            });
            openDbs.push(db);

            const result = db.query("PRAGMA busy_timeout;").get() as { timeout: number };
            expect(result.timeout).toBe(10000);
        });

        test("busy_timeout set for file databases", () => {
            const dbPath = createTempDbPath();
            tempPaths.push(dbPath);

            const { db } = initializeDatabase({
                path: dbPath,
            });
            openDbs.push(db);

            const result = db.query("PRAGMA busy_timeout;").get() as { timeout: number };
            expect(result.timeout).toBe(5000);
        });
    });

    describe("quick integrity check", () => {
        test("runs quick integrity check on existing file databases", () => {
            const dbPath = createTempDbPath();
            tempPaths.push(dbPath);

            // Create database first
            const { db: db1 } = initializeDatabase({
                path: dbPath,
            });
            closeDatabase(db1);

            // Reopen - should run quick_check on existing file
            const { db: db2 } = initializeDatabase({
                path: dbPath,
                quickCheck: true,
            });
            openDbs.push(db2);

            // Database should be accessible (quick_check passed)
            const result = db2.query("SELECT 1 as test").get() as { test: number };
            expect(result.test).toBe(1);
        });

        test("skips quick integrity check for :memory: databases", () => {
            // quickCheck defaults to false for :memory:
            const { db } = initializeDatabase({
                path: ":memory:",
            });
            openDbs.push(db);

            // Database should be accessible
            const result = db.query("SELECT 1 as test").get() as { test: number };
            expect(result.test).toBe(1);
        });

        test("skips quick integrity check for new file databases", () => {
            const dbPath = createTempDbPath();
            tempPaths.push(dbPath);

            // File doesn't exist yet, quickCheck should be false by default
            const { db } = initializeDatabase({
                path: dbPath,
            });
            openDbs.push(db);

            // Database should be accessible
            const result = db.query("SELECT 1 as test").get() as { test: number };
            expect(result.test).toBe(1);
        });

        test("throws DB_CORRUPTED for corrupted database", () => {
            const dbPath = createTempDbPath();
            tempPaths.push(dbPath);

            // Create a corrupted database file
            writeFileSync(dbPath, "not a valid sqlite database file with garbage data");

            // Verify the error
            try {
                initializeDatabase({
                    path: dbPath,
                    quickCheck: true,
                });
                expect(false).toBe(true); // Should not reach here
            } catch (error) {
                expect(error).toBeInstanceOf(MemoryNexusError);
                const mnError = error as MemoryNexusError;
                // DB_CORRUPTED is thrown when "file is not a database" detected
                expect(mnError.code).toBe(ErrorCode.DB_CORRUPTED);
                expect(mnError.context?.path).toBe(dbPath);
            }
        });

        test("can disable quick integrity check explicitly", () => {
            const dbPath = createTempDbPath();
            tempPaths.push(dbPath);

            // Create database first
            const { db: db1 } = initializeDatabase({
                path: dbPath,
            });
            closeDatabase(db1);

            // Reopen with quickCheck disabled
            const { db: db2 } = initializeDatabase({
                path: dbPath,
                quickCheck: false,
            });
            openDbs.push(db2);

            // Database should be accessible
            const result = db2.query("SELECT 1 as test").get() as { test: number };
            expect(result.test).toBe(1);
        });
    });

    describe("initializeDatabaseSafe", () => {
        test("returns same result as initializeDatabase for valid config", () => {
            const { db, fts5Available } = initializeDatabaseSafe({
                path: ":memory:",
            });
            openDbs.push(db);

            expect(db).toBeDefined();
            expect(fts5Available).toBe(true);
        });

        test("wraps errors in MemoryNexusError", () => {
            // Try to open a path that doesn't exist with create: false
            expect(() => initializeDatabaseSafe({
                path: "/nonexistent/path/to/database.db",
                create: false,
            })).toThrow(MemoryNexusError);
        });

        test("preserves MemoryNexusError from initializeDatabase", () => {
            const dbPath = createTempDbPath();
            tempPaths.push(dbPath);

            // Create a corrupted database file
            writeFileSync(dbPath, "corrupted data that is definitely not sqlite");

            try {
                initializeDatabaseSafe({
                    path: dbPath,
                    quickCheck: true,
                });
                expect(false).toBe(true); // Should not reach here
            } catch (error) {
                expect(error).toBeInstanceOf(MemoryNexusError);
            }
        });

        test("includes path in error context", () => {
            try {
                initializeDatabaseSafe({
                    path: "/definitely/not/a/real/path/database.db",
                    create: false,
                });
                expect(false).toBe(true); // Should not reach here
            } catch (error) {
                expect(error).toBeInstanceOf(MemoryNexusError);
                const mnError = error as MemoryNexusError;
                expect(mnError.context?.path).toBe("/definitely/not/a/real/path/database.db");
            }
        });
    });

    describe("error handling", () => {
        test("throws MemoryNexusError for connection failure", () => {
            // Try to open a path that doesn't exist with create: false
            expect(() => initializeDatabase({
                path: "/nonexistent/path/to/database.db",
                create: false,
            })).toThrow(MemoryNexusError);
        });

        test("error includes path context", () => {
            const badPath = "/nonexistent/path/to/database.db";
            try {
                initializeDatabase({
                    path: badPath,
                    create: false,
                });
                expect(false).toBe(true); // Should not reach here
            } catch (error) {
                expect(error).toBeInstanceOf(MemoryNexusError);
                const mnError = error as MemoryNexusError;
                expect(mnError.code).toBe(ErrorCode.DB_CONNECTION_FAILED);
                expect(mnError.context?.path).toBe(badPath);
            }
        });
    });
});
