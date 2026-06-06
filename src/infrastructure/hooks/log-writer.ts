/**
 * Log Writer
 *
 * Structured JSON log writer with rotation support.
 * Logs stored at the XDG data path via centralized paths module.
 *
 * Features:
 * - Append-only JSON lines format (machine-parseable)
 * - Automatic directory creation
 * - Date-based log rotation
 * - Recent log reading for status display
 *
 * Each function accepts an optional `path` argument. When omitted, the
 * production XDG-resolved path is used. When provided, that path is used
 * directly (used by tests to point at a temp file). This avoids
 * module-level mutable state and the test-pollution risk that comes with
 * it; see scripts/check-test-isolation.ts.
 */

import {
    appendFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { getLogDir as pathsGetLogDir } from "../paths.js";
import { PatternRedactor } from "../security/pattern-redactor.js";

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
    sessionId?: string | undefined;
    /** Operation duration in milliseconds */
    durationMs?: number | undefined;
    /** Error message (if applicable) */
    error?: string | undefined;
    /** Hook event that triggered this (SessionEnd or PreCompact) */
    hookEvent?: string | undefined;
}

/**
 * Input type for logSync (timestamp added automatically)
 */
export type LogEntryInput = Omit<LogEntry, "timestamp">;

const LOG_REDACTOR = new PatternRedactor();

/**
 * Get the directory containing the log file.
 *
 * @param logPathOverride Optional explicit log file path. The directory
 *   is derived from this path. Used by tests.
 * @returns Path to the logs directory
 */
export function getLogDir(logPathOverride?: string): string {
    if (logPathOverride !== undefined) {
        return dirname(logPathOverride);
    }
    return pathsGetLogDir();
}

/**
 * Get the path to the sync log file.
 *
 * @param logPathOverride Optional explicit log file path. Used by tests.
 * @returns Path to sync.log
 */
export function getLogPath(logPathOverride?: string): string {
    if (logPathOverride !== undefined) {
        return logPathOverride;
    }
    return join(pathsGetLogDir(), "sync.log");
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
 * @param logPathOverride Optional explicit log file path (used by tests)
 */
export function logSync(entry: LogEntryInput, logPathOverride?: string): void {
    try {
        const logPath = getLogPath(logPathOverride);
        mkdirSync(dirname(logPath), { recursive: true });

        const logEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            ...redactLogEntry(entry),
        };

        appendFileSync(logPath, JSON.stringify(logEntry) + "\n");
    } catch {
        // Silently ignore write errors to not break sync operations
        // This is intentional - logging should never cause failures
    }
}

function redactLogEntry(entry: LogEntryInput): LogEntryInput {
    return LOG_REDACTOR.redactJson(entry).value;
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
 * @param logPathOverride Optional explicit log file path (used by tests)
 */
export function rotateLogsIfNeeded(retentionDays: number, logPathOverride?: string): void {
    const logPath = getLogPath(logPathOverride);

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
 * @param logPathOverride Optional explicit log file path (used by tests)
 * @returns Array of parsed log entries
 */
export function readRecentLogs(limit: number = 100, logPathOverride?: string): LogEntry[] {
    const logPath = getLogPath(logPathOverride);

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
