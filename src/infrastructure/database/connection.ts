/**
 * Database Connection and Initialization
 *
 * Provides SQLite database initialization with WAL mode,
 * performance pragmas, busy timeout, integrity checks, and FTS5 verification.
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createSchema, checkFts5Support } from "./schema.js";
import { ErrorCode, MemoryError } from "../../domain/index.js";
import { getDbPath as pathsGetDbPath } from "../paths.js";

/**
 * Database configuration options
 */
export interface DatabaseConfig {
    /** Path to the database file. Use ":memory:" for in-memory database. */
    path: string;
    /** Whether to create the database if it doesn't exist. Default: true */
    create?: boolean;
    /** Whether to apply schema on initialization. Default: true */
    applySchema?: boolean;
    /** Whether to enable WAL mode. Default: true */
    walMode?: boolean;
    /** Cache size in KB (negative) or pages (positive). Default: -64000 (64MB) */
    cacheSize?: number;
    /** Busy timeout in milliseconds for handling database locks. Default: 5000 */
    busyTimeout?: number;
    /** Whether to run quick integrity check on startup. Default: true for file DB, false for :memory: */
    quickCheck?: boolean;
}

/**
 * Result of database initialization
 */
export interface DatabaseInitResult {
    /** The initialized database instance */
    db: Database;
    /** Whether WAL mode was successfully enabled */
    walEnabled: boolean;
    /** Whether FTS5 extension is available */
    fts5Available: boolean;
    /** Whether sqlite-vec extension is loaded (vector search available) */
    sqliteVecAvailable: boolean;
}

/**
 * Attempt to load the sqlite-vec extension into a database.
 *
 * sqlite-vec enables vector similarity search via vec0 virtual tables.
 * If the extension is not available (e.g., not installed), this returns false
 * and the database continues to work with FTS5-only search.
 *
 * @param db - Database instance to load the extension into
 * @returns true if loaded successfully, false otherwise
 */
export function loadSqliteVecExtension(db: Database): boolean {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const sqliteVec = require("sqlite-vec");
        sqliteVec.load(db);
        return true;
    } catch {
        // sqlite-vec not available -- vector search will be disabled
        return false;
    }
}

/**
 * Get the default database path
 *
 * @returns Path to the database file
 */
export function getDefaultDbPath(): string {
    return pathsGetDbPath();
}

/**
 * Initialize a SQLite database with optimal settings
 *
 * Configures:
 * - Foreign keys enabled
 * - WAL mode (for file-based databases)
 * - Performance pragmas (synchronous, cache_size, temp_store)
 * - FTS5 support verification
 * - Schema creation (optional)
 *
 * @param config - Database configuration options
 * @returns Database instance with initialization status
 * @throws Error if FTS5 is not available
 *
 * @example
 * ```typescript
 * // In-memory database
 * const { db } = initializeDatabase({ path: ":memory:" });
 *
 * // File-based database with custom cache
 * const { db, walEnabled } = initializeDatabase({
 *     path: "./data/memory.db",
 *     cacheSize: -32000  // 32MB
 * });
 * ```
 */
export function initializeDatabase(config: DatabaseConfig): DatabaseInitResult {
    const {
        path,
        create = true,
        applySchema = true,
        walMode = true,
        cacheSize = -64000,
        busyTimeout = 5000,
    } = config;

    // Determine quickCheck default: true for file DB (if exists), false for :memory:
    const isFileDb = path !== ":memory:";
    const fileExists = isFileDb && existsSync(path);
    const quickCheck = config.quickCheck ?? (isFileDb && fileExists);

    // Ensure directory exists for file-based databases
    if (isFileDb) {
        try {
            mkdirSync(dirname(path), { recursive: true });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new MemoryError(
                ErrorCode.DB_CONNECTION_FAILED,
                `Failed to create database directory: ${message}`,
                { path: dirname(path) }
            );
        }
    }

    // Create database connection
    let db: Database;
    try {
        db = new Database(path, { create });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errno = (error as NodeJS.ErrnoException).code;
        throw new MemoryError(
            ErrorCode.DB_CONNECTION_FAILED,
            `Failed to connect to database: ${message}`,
            { path, ...(errno ? { errno } : {}) }
        );
    }

    // Helper to handle corrupted file errors
    const handleDbError = (error: unknown): never => {
        db.close();
        const message = error instanceof Error ? error.message : String(error);
        // "file is not a database" or similar indicates corruption
        if (message.includes("not a database") || message.includes("SQLITE_NOTADB")) {
            throw new MemoryError(
                ErrorCode.DB_CORRUPTED,
                "Database file is corrupted or not a valid SQLite database",
                { path }
            );
        }
        throw new MemoryError(
            ErrorCode.DB_CONNECTION_FAILED,
            `Failed to initialize database: ${message}`,
            { path }
        );
    };

    try {
        // Enable foreign keys - this also validates the database file
        db.exec("PRAGMA foreign_keys = ON;");

        // Configure WAL mode
        let walEnabled = false;
        if (walMode && isFileDb) {
            db.exec("PRAGMA journal_mode = WAL;");
            const result = db.query("PRAGMA journal_mode;").get() as { journal_mode: string };
            walEnabled = result.journal_mode === "wal";
            if (!walEnabled) {
                console.warn(`Warning: WAL mode not enabled. Current mode: ${result.journal_mode}`);
            }
        }

        // Set busy timeout for concurrent access handling
        db.exec(`PRAGMA busy_timeout = ${busyTimeout};`);

        // Performance pragmas
        db.exec("PRAGMA synchronous = NORMAL;");
        db.exec(`PRAGMA cache_size = ${cacheSize};`);
        db.exec("PRAGMA temp_store = MEMORY;");

        // Check FTS5 support
        const fts5Available = checkFts5Support(db);
        if (!fts5Available) {
            // Get SQLite version for error context before closing
            const versionResult = db.query<{ version: string }, []>("SELECT sqlite_version() as version").get();
            db.close();
            throw new MemoryError(
                ErrorCode.DB_CONNECTION_FAILED,
                "FTS5 is not available. memory requires FTS5 for full-text search.",
                { sqliteVersion: versionResult?.version ?? "unknown" }
            );
        }

        // Run quick integrity check if enabled (for existing file databases)
        if (quickCheck) {
            const result = db.query<{ quick_check: string }, []>("PRAGMA quick_check(1);").get();
            if (result?.quick_check !== "ok") {
                db.close();
                throw new MemoryError(
                    ErrorCode.DB_CORRUPTED,
                    "Database integrity check failed",
                    { path, checkResult: result?.quick_check ?? "unknown" }
                );
            }
        }

        // Load sqlite-vec extension (optional -- vector search disabled if unavailable)
        const sqliteVecAvailable = loadSqliteVecExtension(db);

        // Apply schema
        if (applySchema) {
            createSchema(db, { sqliteVecAvailable });
        }

        return { db, walEnabled, fts5Available, sqliteVecAvailable };
    } catch (error) {
        if (error instanceof MemoryError) {
            throw error;
        }
        handleDbError(error);
    }
}

/**
 * Close the database connection with proper cleanup
 *
 * Performs a WAL checkpoint before closing to ensure all changes are
 * written to the main database file. Switches journal mode to DELETE
 * to remove WAL/SHM files that would otherwise retain OS-level locks
 * on Windows.
 *
 * initializeDatabase() re-enables WAL on the next open, so the
 * journal mode switch has no functional impact on subsequent connections.
 *
 * Note: On Windows, Bun's SQLite binding may hold the .db file descriptor
 * until garbage collection. Test code that needs to delete the database
 * file immediately after close should use tests/helpers/test-database.ts
 * which handles this with a conditional GC + retry strategy.
 *
 * @param db - Database instance to close
 */
export function closeDatabase(db: Database): void {
    // Checkpoint WAL before closing
    try {
        db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
        // Ignore errors (e.g., if not in WAL mode or :memory: database)
    }
    // Switch to DELETE journal mode to remove WAL/SHM files.
    try {
        db.exec("PRAGMA journal_mode = DELETE;");
    } catch {
        // Ignore errors (e.g., if database is read-only)
    }
    db.close();
}

/**
 * Perform a passive WAL checkpoint
 *
 * Checkpoints as much of the WAL as possible without blocking.
 * Use this for periodic checkpointing during long operations.
 *
 * @param db - Database instance to checkpoint
 */
export function checkpointDatabase(db: Database): void {
    db.exec("PRAGMA wal_checkpoint(PASSIVE);");
}

/**
 * Result of a WAL checkpoint operation
 */
export interface CheckpointResult {
    /** Number of WAL frames that could not be checkpointed (busy) */
    busy: number;
    /** Total number of frames in the WAL file */
    log: number;
    /** Number of frames successfully checkpointed */
    checkpointed: number;
}

/**
 * Perform a truncating WAL checkpoint after bulk operations
 *
 * Uses TRUNCATE mode which:
 * 1. Checkpoints all frames from WAL to main database
 * 2. Truncates the WAL file to zero size
 * 3. May block briefly if other connections are active
 *
 * Call this after bulk insert operations to:
 * - Reduce WAL file size
 * - Ensure all changes are in main database file
 * - Optimize subsequent read performance
 *
 * @param db - Database instance to checkpoint
 * @returns Checkpoint result with frame counts
 */
export function bulkOperationCheckpoint(db: Database): CheckpointResult {
    const result = db.query<{ busy: number; log: number; checkpointed: number }, []>(
        "PRAGMA wal_checkpoint(TRUNCATE);"
    ).get();

    return result ?? { busy: 0, log: 0, checkpointed: 0 };
}

/**
 * Initialize a database with error wrapping
 *
 * Wraps initializeDatabase and ensures all errors are MemoryError instances.
 * Use this for CLI entry points where structured error handling is needed.
 *
 * @param config - Database configuration options
 * @returns Database instance with initialization status
 * @throws MemoryError for any initialization failure
 *
 * @example
 * ```typescript
 * try {
 *     const { db } = initializeDatabaseSafe({ path: "./data/memory.db" });
 * } catch (error) {
 *     if (error instanceof MemoryError) {
 *         console.error(`[${error.code}] ${error.message}`);
 *     }
 * }
 * ```
 */
export function initializeDatabaseSafe(config: DatabaseConfig): DatabaseInitResult {
    try {
        return initializeDatabase(config);
    } catch (error) {
        // Already a MemoryError, rethrow
        if (error instanceof MemoryError) {
            throw error;
        }

        // Wrap generic errors
        const message = error instanceof Error ? error.message : String(error);
        const errno = (error as NodeJS.ErrnoException).code;
        throw new MemoryError(
            ErrorCode.DB_CONNECTION_FAILED,
            `Database initialization failed: ${message}`,
            { path: config.path, ...(errno ? { errno } : {}) }
        );
    }
}
