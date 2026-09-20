/**
 * Shared test helpers for .json.test.ts files (Plan 32-02).
 *
 * Captures stdout/stderr around a command invocation so envelope-shape
 * assertions can be made deterministically. Used by all 6 query commands'
 * .json.test.ts files (search/context/show/list/related/stats).
 *
 * Per Codex MEDIUM-3: no shell-specific assumptions; pure JS.
 */

import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { createOwnedTestDirectory, type OwnedTestDirectory } from "./owned-test-directory.js";

export interface CapturedStreams {
  stdout: string;
  stderr: string;
  exitCode?: number;
}

/**
 * Capture stdout and stderr emitted by `fn` while it runs.
 *
 * Monkey-patches `console.log` and `console.error` for the duration
 * of `fn`, then restores them. Returns concatenated output and the
 * function's `exitCode` (if returned).
 *
 * Single-line outputs are concatenated with newlines.
 */
export async function captureStreams<R extends { exitCode?: number } | undefined>(
  fn: () => Promise<R>
): Promise<CapturedStreams> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const log = console.log;
  const err = console.error;
  console.log = (...args: unknown[]) =>
    stdoutChunks.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  console.error = (...args: unknown[]) =>
    stderrChunks.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  try {
    const result = await fn();
    const out: CapturedStreams = {
      stdout: stdoutChunks.join("\n"),
      stderr: stderrChunks.join("\n"),
    };
    if (result?.exitCode !== undefined) out.exitCode = result.exitCode;
    return out;
  } finally {
    console.log = log;
    console.error = err;
  }
}

/** Owns each database's container without creating the database itself.
 * Cleanup accepts no paths and retains failed capabilities for a later retry.
 * The allocator seam is for local fault injection, never command input.
 */
export function createTempDatabaseTracker(
  allocate: (prefix: string) => OwnedTestDirectory = createOwnedTestDirectory,
) {
  const owned = new Set<OwnedTestDirectory>();
  return {
    makePath(command: string): string {
      const storage = allocate(`memory-json-${command}-`);
      owned.add(storage);
      return join(storage.dir, "memory.db");
    },
    async cleanup(): Promise<void> {
      const pending = [...owned];
      if (pending.length === 0) return;
      // Closed native SQLite statements can remain alive until GC and a turn.
      Bun.gc(true);
      await setImmediate();
      const failures: Error[] = [];
      for (const storage of pending) {
        try {
          storage.cleanup();
          owned.delete(storage);
        } catch (cause) {
          failures.push(new Error(`JSON test storage retained: ${storage.dir}`, { cause }));
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, failures.map(error => error.message).join("\n"));
      }
    }
  };
}
