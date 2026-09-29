import { expect, it, mock } from "bun:test";
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";
import { captureStreams } from "../../helpers/capture-json.js";
import { createSourceOperationAdmission } from "../../../src/infrastructure/database/source-operation-admission.js";
import { executeRemoteBackupCommand, executeRemoteRestoreCommand, executeRemoteRollbackCommand } from "../../../src/presentation/cli/commands/remote.js";

it("remote backup omits the actual local authority and declares the exclusion", async () => {
  const storage = createOwnedTestDirectory("memory-remote-authority-");
  try {
    const events = join(storage.dir, "events"), log = join(events, "events-synthetic.jsonl");
    const admission = createSourceOperationAdmission(log);
    writeFileSync(log, "synthetic\n");
    const authority = join(events, ".memory-local", "admission.sqlite"), before = readFileSync(authority);
    const result = await admission.run(() => captureStreams(() => executeRemoteBackupCommand(join(storage.dir, "backups"), {
      eventsDirOverride: events, configPathOverride: join(storage.dir, "absent-config"),
    }, { json: true })));
    expect(result.exitCode).toBe(0);
    const snapshot = JSON.parse(result.stdout).data;
    expect(snapshot.eventFileCount).toBe(1);
    expect(snapshot.excludedPaths).toContain(".memory-local");
    expect(existsSync(join(snapshot.backupPath, "events", ".memory-local"))).toBe(false);
    expect(readFileSync(authority)).toEqual(before);
    expect(readFileSync(join(snapshot.backupPath, "events", "events-synthetic.jsonl"), "utf8")).toBe("synthetic\n");
  } finally { storage.cleanup(); }
});

it.each(["symbolic", "hard"])("remote backup refuses %s authority aliases", async (kind) => {
  const storage = createOwnedTestDirectory("memory-remote-authority-alias-");
  try {
    const events = join(storage.dir, "events"), log = join(events, "events-synthetic.jsonl");
    createSourceOperationAdmission(log);
    const local = join(events, ".memory-local"), authority = join(local, "admission.sqlite"), before = readFileSync(authority);
    if (kind === "symbolic") symlinkSync(local, join(events, "alias"), process.platform === "win32" ? "junction" : "dir");
    else linkSync(authority, join(events, "alias.sqlite"));
    const result = await captureStreams(() => executeRemoteBackupCommand(join(storage.dir, "backups"), {
      eventsDirOverride: events, configPathOverride: join(storage.dir, "absent-config"), now: () => new Date("2026-01-01T00:00:00Z"),
    }, { json: true }));
    expect(result.exitCode).toBe(1);
    const response = JSON.parse(result.stdout);
    expect(response.status).toBe("error");
    expect(response.errors.join(" ")).toContain("symbolic or hard links");
    expect(existsSync(join(storage.dir, "backups", "remote-sync-20260101T000000000Z", "manifest.json"))).toBe(false);
    expect(readFileSync(authority)).toEqual(before);
  } finally { storage.cleanup(); }
});

for (const command of [executeRemoteRestoreCommand, executeRemoteRollbackCommand]) {
  for (const includesEvents of [true, false]) {
    it(`${command.name} preserves a held authority with includesEvents=${includesEvents}`, async () => {
      const storage = createOwnedTestDirectory("memory-remote-restore-authority-");
      try {
        const events = join(storage.dir, "events"), log = join(events, "events-synthetic.jsonl");
        const admission = createSourceOperationAdmission(log);
        const authority = join(events, ".memory-local", "admission.sqlite");
        const identity = lstatSync(authority, { bigint: true }), before = readFileSync(authority);
        const backup = join(storage.dir, "input");
        mkdirSync(join(backup, "events", ".memory-local"), { recursive: true });
        writeFileSync(join(backup, "events", ".memory-local", "admission.sqlite"), "foreign authority");
        writeFileSync(join(backup, "events", "events-synthetic.jsonl"), "restored\n");
        writeFileSync(join(backup, "manifest.json"), JSON.stringify({
          schemaVersion: 1, kind: "memory.remoteSync.backup", backupId: "synthetic", createdAt: "2026-01-01T00:00:00Z",
          includesConfig: false, includesEvents, eventFileCount: includesEvents ? 1 : 0, excludedPaths: [".git"],
        }));
        writeFileSync(log, "before\n");
        await admission.run(async () => {
          const result = await captureStreams(() => command(backup, {
            eventsDirOverride: events, configPathOverride: join(storage.dir, "absent-config"), backupDirOverride: join(storage.dir, "rollback"),
          }, { confirm: true, json: true }));
          expect(result.exitCode).toBe(0);
          expect(readFileSync(authority)).toEqual(before);
          expect(lstatSync(authority, { bigint: true }).ino).toBe(identity.ino);
          expect(lstatSync(authority, { bigint: true }).dev).toBe(identity.dev);
          const contender = mock();
          await expect(createSourceOperationAdmission(log).run(contender)).rejects.toThrow("busy");
          expect(contender).not.toHaveBeenCalled();
          const rollback = JSON.parse(result.stdout).data.rollbackBackupPath;
          expect(existsSync(join(rollback, "events", ".memory-local"))).toBe(false);
        });
        expect(await createSourceOperationAdmission(log).run(async () => "released")).toBe("released");
        expect(existsSync(log)).toBe(includesEvents);
        if (includesEvents) expect(readFileSync(log, "utf8")).toBe("restored\n");
      } finally { storage.cleanup(); }
    });
  }
}
