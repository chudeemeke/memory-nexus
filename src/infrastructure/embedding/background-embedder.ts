/**
 * Background Embedder
 *
 * Manages background embedding processes with PID lock file lifecycle.
 * The lock file prevents concurrent embedding runs and provides status
 * information for the `memory status` command.
 *
 * Design:
 * - Spawns a detached child process that runs `memory sync --embed --quiet`
 * - PID lock file at {dataDir}/embedding.lock prevents double-run
 * - Stale lock detection via process.kill(pid, 0) signal check
 * - MEMORY_EMBED_BACKGROUND=1 env var signals background mode
 * - Background process cleans up lock file on completion (success or failure)
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  openSync,
} from "node:fs";
import { join } from "node:path";
import { getDataDir, getLogDir } from "../paths.js";

/**
 * PID lock file data structure.
 */
export interface LockData {
  pid: number;
  startedAt: string;
  totalMessages: number;
}

/**
 * Result of a lock acquisition attempt.
 */
export interface AcquireResult {
  acquired: boolean;
  staleRemoved?: boolean | undefined;
  existingPid?: number | undefined;
  startedAt?: string | undefined;
}

/**
 * Result of spawning a background embedding process.
 */
export interface SpawnResult {
  started: boolean;
  pid?: number | undefined;
  reason?: "already_running" | "spawn_failed" | undefined;
}

/**
 * Options for spawnBackgroundEmbedding.
 */
export interface SpawnBackgroundOptions {
  dataDir?: string;
  logDir?: string;
  command?: string;
}

/**
 * Get the path to the embedding lock file.
 *
 * @param dataDir Optional override for data directory
 * @returns Absolute path to embedding.lock
 */
function getLockPath(dataDir?: string): string {
  return join(dataDir ?? getDataDir(), "embedding.lock");
}

/**
 * Write a PID lock file with the given data.
 *
 * Creates the data directory if it does not exist.
 *
 * @param data Lock file data (pid, startedAt, totalMessages)
 * @param dataDir Optional override for data directory
 */
export function writeLock(data: LockData, dataDir?: string): void {
  const lockPath = getLockPath(dataDir);
  const dir = dataDir ?? getDataDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(lockPath, JSON.stringify(data));
}

/**
 * Read the PID lock file.
 *
 * @param dataDir Optional override for data directory
 * @returns Parsed lock data, or null if file does not exist or is invalid
 */
export function readLock(dataDir?: string): LockData | null {
  const lockPath = getLockPath(dataDir);
  if (!existsSync(lockPath)) return null;
  try {
    return JSON.parse(readFileSync(lockPath, "utf-8")) as LockData;
  } catch {
    return null;
  }
}

/**
 * Remove the PID lock file.
 *
 * No-op if the lock file does not exist.
 *
 * @param dataDir Optional override for data directory
 */
export function removeLock(dataDir?: string): void {
  const lockPath = getLockPath(dataDir);
  try {
    unlinkSync(lockPath);
  } catch {
    // Lock file already gone or never existed
  }
}

/**
 * Check if a process with the given PID is alive.
 *
 * Uses signal 0 (existence check) which does not actually kill the process.
 *
 * @param pid Process ID to check
 * @returns true if the process exists, false otherwise
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempt to acquire the embedding lock.
 *
 * - If no lock exists: creates lock and returns acquired:true
 * - If lock held by alive process: returns acquired:false with existingPid
 * - If lock held by dead process (stale): removes stale lock, creates new one
 *
 * @param pid Process ID to write into lock
 * @param totalMessages Total message count (informational)
 * @param dataDir Optional override for data directory
 * @returns Acquisition result
 */
export function acquireLock(
  pid: number,
  totalMessages: number,
  dataDir?: string,
): AcquireResult {
  const existing = readLock(dataDir);

  if (existing) {
    if (isProcessAlive(existing.pid)) {
      return {
        acquired: false,
        existingPid: existing.pid,
        startedAt: existing.startedAt,
      };
    }
    // Stale lock -- remove it
    removeLock(dataDir);
  }

  writeLock(
    { pid, startedAt: new Date().toISOString(), totalMessages },
    dataDir,
  );

  return {
    acquired: true,
    staleRemoved: existing !== null,
  };
}

/**
 * Spawn a background embedding process.
 *
 * Creates a detached child process that runs `memory sync --embed --quiet`
 * with MEMORY_EMBED_BACKGROUND=1 in its environment. The parent process
 * can exit immediately after spawning.
 *
 * If the lock is already held by an alive process, returns without spawning.
 *
 * @param options Configuration options
 * @returns Spawn result with PID or failure reason
 */
export function spawnBackgroundEmbedding(options?: SpawnBackgroundOptions): SpawnResult {
  const {
    dataDir,
    logDir: logDirOverride,
    command = process.execPath,
  } = options ?? {};

  // Check for existing lock first (before spawning)
  const existing = readLock(dataDir);
  if (existing && isProcessAlive(existing.pid)) {
    return {
      started: false,
      reason: "already_running",
      pid: existing.pid,
    };
  }

  // Remove stale lock if present
  if (existing) {
    removeLock(dataDir);
  }

  const logDirPath = logDirOverride ?? getLogDir();
  mkdirSync(logDirPath, { recursive: true });

  const logPath = join(logDirPath, "sync.log");
  const out = openSync(logPath, "a");
  const err = openSync(logPath, "a");

  // Build args: re-invoke the memory CLI with --embed --quiet
  const entryPoint = process.argv[1] ?? "";
  const args = [entryPoint, "sync", "--embed", "--quiet"];

  const subprocess = spawn(command, args, {
    detached: true,
    stdio: ["ignore", out, err],
    env: {
      ...process.env,
      MEMORY_EMBED_BACKGROUND: "1",
    },
  } as any) as any;
  subprocess.unref();

  if (subprocess.pid === undefined) {
    return { started: false, reason: "spawn_failed" };
  }

  // Write lock file with spawned process PID
  // totalMessages is 0 -- status command queries database for live counts
  const lockResult = acquireLock(subprocess.pid, 0, dataDir);
  if (!lockResult.acquired) {
    return {
      started: false,
      reason: "already_running",
      pid: lockResult.existingPid,
    };
  }

  return { started: true, pid: subprocess.pid };
}

/**
 * Clean up the PID lock file.
 *
 * Called by the background embedding process on completion (both success
 * and failure) to release the lock.
 *
 * @param dataDir Optional override for data directory
 */
export function cleanupLock(dataDir?: string): void {
  removeLock(dataDir);
}

/**
 * Check if the current process is a background embedding process.
 *
 * The foreground sync command sets MEMORY_EMBED_BACKGROUND=1 when
 * spawning the background process. This function checks that env var
 * so the background process does NOT re-spawn another background process.
 *
 * @returns true if running as background embedding process
 */
export function isBackgroundEmbedding(): boolean {
  return process.env.MEMORY_EMBED_BACKGROUND === "1";
}
