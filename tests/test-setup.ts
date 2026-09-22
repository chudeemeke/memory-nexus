import { afterAll, afterEach, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as os from "node:os";
import { join } from "node:path";

// Tests and their child commands must never inherit the user's live memory
// store, fallback friction file, hooks, or configuration as their defaults.
const testHome = mkdtempSync(join(tmpdir(), "memory-test-home-"));
const identity = lstatSync(testHome, { bigint: true });
const markerPath = join(testHome, ".memory-test-owner.json");
const ownerRecord = JSON.stringify({
  project: "memory-nexus", pid: process.pid, startedAt: new Date().toISOString(),
  runId: randomUUID(), device: identity.dev.toString(), inode: identity.ino.toString(),
});
writeFileSync(markerPath, ownerRecord, { flag: "wx" });
process.env.HOME = testHome;
process.env.USERPROFILE = testHome;
process.env.XDG_DATA_HOME = join(testHome, "data");
process.env.XDG_CONFIG_HOME = join(testHome, "config");
process.env.MEMORY_HOME = join(testHome, "legacy");

// Linux Bun 1.3.14 retains the startup HOME inside os.homedir(), even after
// process.env changes. This test-only built-in adapter preserves each fixture's
// explicit HOME override and prevents fallback paths from reaching the real home.
// Production code and child CLI processes keep their real OS implementation.
if (os.homedir() !== testHome) {
  const isolatedOs = { ...os, homedir: () => process.env.HOME || testHome };
  mock.module("node:os", () => ({ ...isolatedOs, default: isolatedOs }));
  mock.module("os", () => ({ ...isolatedOs, default: isolatedOs }));
}
if (os.homedir() !== testHome) throw new Error("Test storage isolation failed: os.homedir() did not redirect");

let cleaned = false;
function isOriginalDirectory(): boolean {
  const current = lstatSync(testHome, { bigint: true, throwIfNoEntry: false });
  return !!current && current.isDirectory() && !current.isSymbolicLink() &&
    current.dev === identity.dev && current.ino === identity.ino;
}

function cleanupTestHome(): void {
  if (cleaned) return;
  let owned = false;
  try {
    const marker = lstatSync(markerPath);
    owned = isOriginalDirectory() && marker.isFile() && !marker.isSymbolicLink() &&
      marker.nlink === 1 && readFileSync(markerPath, "utf-8") === ownerRecord;
  } catch { /* Missing or changed ownership is not permission to delete. */ }
  if (!owned) {
    cleaned = true;
    process.stderr.write(`Test storage cleanup skipped after ownership changed: ${testHome}\n`);
    return;
  }
  try {
    rmSync(testHome, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    cleaned = true;
  } catch (error) {
    // Windows can retain native SQLite handles during the exit event. A failed
    // recursive removal may already have deleted the marker; restore ownership
    // so a later cleanup can verify the retained directory.
    if ((error as NodeJS.ErrnoException).code !== "EBUSY" &&
        (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    if (isOriginalDirectory() && !lstatSync(markerPath, { throwIfNoEntry: false })) {
      writeFileSync(markerPath, ownerRecord, { flag: "wx" });
    }
    process.stderr.write(`Test storage retained for verified cleanup: ${testHome}\n`);
  }
}

// Bun's ordinary test completion does not reliably emit process "exit". A preload
// afterAll is the global suite teardown; exit also covers explicit process.exit.
afterAll(cleanupTestHome);
process.once("exit", cleanupTestHome);

afterEach(() => {
  process.exitCode = 0;
});
