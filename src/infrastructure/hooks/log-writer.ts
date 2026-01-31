/**
 * Log Writer
 *
 * Structured JSON log writer with rotation support.
 * Logs stored in ~/.memory-nexus/logs/sync.log
 *
 * Features:
 * - Append-only JSON lines format (machine-parseable)
 * - Automatic directory creation
 * - Date-based log rotation
 * - Recent log reading for status display
 */

import {
    appendFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    statSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Test path override for log file
 * When set, all log operations use this path instead of the default
 */
let testLogPath: string | null = null;

/**
 * Set test log path override
 *
 * @param path Path to use, or null to reset to default behavior
 */
export function setTestLogPath(path: string | null): void {
    testLogPath = path;
}

/**
 * Log entry structure for sync operations
 *
 * Includes all relevant fields for debugging and monitoring:
 * - timestamp: ISO 8601 format
 * - level: Log severity
 * - message: Human-readable description
 * - sessionId: Optional session identifier
 * - durationMs: Optional operation duration
 * - error: Optional error message
 * - hookEvent: Optional hook trigger (SessionEnd or PreCompact)
 */
export interface LogEntry {
    /** ISO 8601 timestamp */
    timestamp: string;
    /** Log severity level */
    level: "debug" | "info" | "warn" | "error";
    /** Human-readable message */
    message: string;
    /** Session identifier (if applicable) */
    sessionId?: string;
    /** Operation duration in milliseconds */
    durationMs?: number;
    /** Error message (if applicable) */
    error?: string;
    /** Hook event that triggered this (SessionEnd or PreCompact) */
    hookEvent?: string;
}

/**
 * Input type for logSync (timestamp added automatically)
 */
export type LogEntryInput = Omit<LogEntry, "timestamp">;

/**
 * Get the path to the log directory
 *
 * @returns Path to ~/.memory-nexus/logs/ (or test override directory)
 */
export function getLogDir(): string {
    if (testLogPath !== null) {
        return dirname(testLogPath);
    }
    return join(homedir(), ".memory-nexus", "logs");
}

/**
 * Get the path to the sync log file
 *
 * @returns Path to ~/.memory-nexus/logs/sync.log (or test override)
 */
export function getLogPath(): string {
    if (testLogPath !== null) {
        return testLogPath;
    }
    return join(getLogDir(), "sync.log");
}

/**
 * Write a log entry to the sync log
 *
 * Creates the log directory if it doesn't exist.
 * Adds timestamp automatically in ISO 8601 format.
 * Appends as JSON line (newline-delimited JSON).
 *
 * Handles write errors gracefully to never break sync operations.
 *
 * @param entry Log entry data (without timestamp)
 */
export function logSync(entry: LogEntryInput): void {
    try {
        const logDir = getLogDir();
        mkdirSync(logDir, { recursive: true });

        const logPath = getLogPath();
        const logEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            ...entry,
        };

        appendFileSync(logPath, JSON.stringify(logEntry) + "\n");
    } catch {
        // Silently ignore write errors to not break sync operations
        // This is intentional - logging should never cause failures
    }
}

/**
 * Rotate logs if they exceed the retention period
 *
 * Checks the sync.log file modification time.
 * If older than retentionDays, renames to sync.log.YYYY-MM-DD.
 * This clears the main log for fresh writes.
 *
 * Handles missing file gracefully (no-op).
 *
 * @param retentionDays Number of days before rotation
 */
export function rotateLogsIfNeeded(retentionDays: number): void {
    const logPath = getLogPath();

    if (!existsSync(logPath)) {
        return;
    }

    try {
        const stats = statSync(logPath);
        const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);

        if (ageDays > retentionDays) {
            const archiveDate = new Date().toISOString().split("T")[0];
            const archivePath = `${logPath}.${archiveDate}`;
            renameSync(logPath, archivePath);
        }
    } catch {
        // Silently ignore rotation errors
    }
}

/**
 * Read recent log entries for status display
 *
 * Reads the sync.log file and parses JSON lines.
 * Returns the last `limit` entries.
 *
 * Handles gracefully:
 * - Missing file (returns empty array)
 * - Malformed lines (skips them)
 *
 * @param limit Maximum number of entries to return (default 100)
 * @returns Array of parsed log entries
 */
export function readRecentLogs(limit: number = 100): LogEntry[] {
    const logPath = getLogPath();

    if (!existsSync(logPath)) {
        return [];
    }

    try {
        const content = readFileSync(logPath, "utf-8");
        const lines = content.split("\n").filter((line) => line.trim() !== "");

        const entries: LogEntry[] = [];
        for (const line of lines) {
            try {
                const entry = JSON.parse(line) as LogEntry;
                entries.push(entry);
            } catch {
                // Skip malformed lines
                continue;
            }
        }

        // Return last `limit` entries
        return entries.slice(-limit);
    } catch {
        return [];
    }
}
