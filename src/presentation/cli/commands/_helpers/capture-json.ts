/**
 * Shared test helpers for .json.test.ts files (Plan 32-02).
 *
 * Captures stdout/stderr around a command invocation so envelope-shape
 * assertions can be made deterministically. Used by all 6 query commands'
 * .json.test.ts files (search/context/show/list/related/stats).
 *
 * Per Codex MEDIUM-3: no shell-specific assumptions; pure JS.
 */

import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";

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
    return {
      stdout: stdoutChunks.join("\n"),
      stderr: stderrChunks.join("\n"),
      exitCode: result?.exitCode,
    };
  } finally {
    console.log = log;
    console.error = err;
  }
}

/**
 * Per-test temp DB path tracker. Returns a path + a cleanup hook.
 *
 * Pattern:
 *   const tempPaths: string[] = [];
 *   const dbPath = makeTempDbPath("search", tempPaths);
 *   afterEach(() => cleanupTempPaths(tempPaths));
 */
export function makeTempDbPath(cmd: string, tracker: string[]): string {
  const p = path.join(tmpdir(), `32-02-${cmd}-${randomUUID()}.db`);
  tracker.push(p);
  return p;
}

export function cleanupTempPaths(tracker: string[]): void {
  for (const p of tracker) {
    try {
      rmSync(p, { force: true });
      rmSync(`${p}-wal`, { force: true });
      rmSync(`${p}-shm`, { force: true });
    } catch {
      // Best effort
    }
  }
  tracker.length = 0;
}
