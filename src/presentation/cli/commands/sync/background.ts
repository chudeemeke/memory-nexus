/**
 * Sync Background Mode
 *
 * Handles --background flag for embedding generation.
 * Spawns a detached background process to run embedding asynchronously.
 */

import type { CommandResult } from "../../command-result.js";
import type { SyncCommandOptions, BackgroundModeDeps } from "./types.js";

/**
 * Handle --background mode for embedding.
 *
 * Checks that --embed is also set, then spawns a detached background
 * process to run embedding asynchronously. Returns immediately with
 * a status message including the PID.
 *
 * Accepts optional dependency overrides for testing (avoid spawning
 * real child processes in tests).
 *
 * @param options Sync command options
 * @param deps Optional dependency overrides (testing support)
 * @returns Command result with exit code
 */
export async function handleBackgroundMode(
  options: SyncCommandOptions,
  deps?: BackgroundModeDeps,
): Promise<CommandResult> {
  if (!options.embed) {
    console.log("--background requires --embed flag");
    console.log("  Usage: memory sync --embed --background");
    return { exitCode: 0 };
  }

  // Load dependencies (lazy import for production, overrides for testing)
  const {
    spawnBackgroundEmbedding: spawnFn,
    readLock: readLockFn,
    isProcessAlive: isAliveFn,
  } = deps ?? await loadBackgroundDeps();

  // Check existing lock
  const existingLock = readLockFn();
  if (existingLock && isAliveFn(existingLock.pid)) {
    console.log(
      `Embedding already in progress (PID ${existingLock.pid}). ` +
      `Use 'memory status' to check progress.`
    );
    return { exitCode: 0 };
  }

  // Spawn background process
  const result = spawnFn();

  if (result.started) {
    console.log(
      `Background embedding started (PID ${result.pid}). ` +
      `Use 'memory status' to check progress.`
    );
  } else {
    console.error(`Failed to start background embedding: ${result.reason}`);
    return { exitCode: 1 };
  }

  return { exitCode: 0 };
}

/**
 * Lazy-load background embedder dependencies.
 * Private to this module -- not exported.
 */
async function loadBackgroundDeps(): Promise<BackgroundModeDeps> {
  const mod = await import(
    "../../../../infrastructure/embedding/background-embedder.js"
  );
  return {
    spawnBackgroundEmbedding: mod.spawnBackgroundEmbedding,
    readLock: mod.readLock,
    isProcessAlive: mod.isProcessAlive,
  };
}
