import { afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests and their child commands must never inherit the user's live memory
// store, fallback friction file, hooks, or configuration as their defaults.
const testHome = mkdtempSync(join(tmpdir(), "memory-test-home-"));
const ownerRecord = JSON.stringify({
  project: "memory-nexus", pid: process.pid, startedAt: new Date().toISOString(),
});
writeFileSync(join(testHome, ".memory-test-owner.json"), ownerRecord);
process.env.HOME = testHome;
process.env.USERPROFILE = testHome;
process.env.XDG_DATA_HOME = join(testHome, "data");
process.env.XDG_CONFIG_HOME = join(testHome, "config");
process.env.MEMORY_HOME = join(testHome, "legacy");

process.once("exit", () => {
  try {
    rmSync(testHome, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (error) {
    // Windows can retain native SQLite handles during the exit event. A failed
    // recursive removal may already have deleted the marker; restore ownership
    // so a later cleanup can verify the retained directory.
    if ((error as NodeJS.ErrnoException).code !== "EBUSY" &&
        (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    mkdirSync(testHome, { recursive: true });
    writeFileSync(join(testHome, ".memory-test-owner.json"), ownerRecord);
    process.stderr.write(`Test storage retained for verified cleanup: ${testHome}\n`);
  }
});

afterEach(() => {
  process.exitCode = 0;
});
