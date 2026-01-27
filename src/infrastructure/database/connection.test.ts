/**
 * Database Connection Tests
 *
 * Tests for database initialization, WAL mode, pragmas, and cleanup.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import {
    initializeDatabase,
    closeDatabase,
    checkpointDatabase,
    getDefaultDbPath,
    type DatabaseConfig,
} from "./connection.js";

/**
 * Create a temporary database path in a unique directory
 */
function createTempDbPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "memory-nexus-test-"));
    return join(dir, "test.db");
}

/**
 * Clean up temporary database directory
 */
function cleanupTempDb(dbPath: string): void {
    const dir = dirname(dbPath);
    rmSync(dir, { recursive: true, force: true });
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
});
