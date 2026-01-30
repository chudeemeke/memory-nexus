/**
 * Hook Runner
 *
 * Background process spawner for sync operations.
 * Spawns detached processes that survive parent termination.
 *
 * Design:
 * - Detached process runs in own process group
 * - Parent can exit without waiting (unref)
 * - Output redirected to sync.log for debugging
 * - MEMORY_NEXUS_HOOK env var allows sync to detect hook invocation
 */

import { spawn, type ChildProcess } from "node:child_process";
import { openSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Options for spawnBackgroundSync
 */
export interface SpawnOptions {
    /** Override CLI command (default: "aidev") */
    command?: string;
    /** Include --quiet flag (default: true) */
    quiet?: boolean;
    /** Override log directory (for testing) */
    logDir?: string;
}

/**
 * Result of spawn operation
 */
export interface SpawnResult {
    /** Process ID of spawned child, or undefined if spawn failed */
    pid: number | undefined;
}

/**
 * Get the path to the sync log file
 *
 * @returns Path to ~/.memory-nexus/logs/sync.log
 */
export function getLogPath(): string {
    return join(homedir(), ".memory-nexus", "logs", "sync.log");
}

/**
 * Ensure the log directory exists
 *
 * Creates the directory recursively if it doesn't exist.
 * Safe to call multiple times.
 *
 * @param logDir Optional custom log directory path
 */
export function ensureLogDirectory(logDir?: string): void {
    const dir = logDir ?? join(homedir(), ".memory-nexus", "logs");
    mkdirSync(dir, { recursive: true });
}

/**
 * Spawn a background sync process for the given session
 *
 * Creates a detached child process that:
 * - Runs independently of the parent process
 * - Survives parent termination
 * - Logs output to sync.log
 *
 * The spawned command runs:
 * `aidev memory sync --session <sessionId> [--quiet]`
 *
 * Key implementation details:
 * - detached: true - Process runs in own process group
 * - stdio: Redirect stdout/stderr to log file (stdin ignored)
 * - unref() - Parent can exit without waiting
 * - MEMORY_NEXUS_HOOK=1 - Sync can detect hook invocation
 *
 * @param sessionId Session identifier to sync
 * @param options Configuration options
 * @returns Spawn result with PID (if successful)
 */
export function spawnBackgroundSync(
    sessionId: string,
    options: SpawnOptions = {}
): SpawnResult {
    const { command = "aidev", quiet = true, logDir } = options;

    // Ensure log directory exists
    const logDirPath = logDir ?? join(homedir(), ".memory-nexus", "logs");
    ensureLogDirectory(logDirPath);

    // Open log file for append (stdout and stderr)
    const logPath = join(logDirPath, "sync.log");
    const out = openSync(logPath, "a");
    const err = openSync(logPath, "a");

    // Build command arguments
    const args = ["memory", "sync", "--session", sessionId];
    if (quiet) {
        args.push("--quiet");
    }

    // Spawn detached process
    const subprocess: ChildProcess = spawn(command, args, {
        detached: true,
        stdio: ["ignore", out, err],
        env: { ...process.env, MEMORY_NEXUS_HOOK: "1" },
    });

    // Allow parent to exit without waiting for child
    subprocess.unref();

    return { pid: subprocess.pid };
}
