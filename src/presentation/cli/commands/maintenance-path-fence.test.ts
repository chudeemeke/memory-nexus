import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createOwnedTestDirectory } from "../../../../tests/helpers/owned-test-directory.js";
import { OwnedDatabase } from "../../../infrastructure/database/owned-database.js";
import { createSchema } from "../../../infrastructure/database/schema.js";
import { executeBackupCreateCommand, executeRestoreCommand } from "./backup.js";
import { executeRemoteBackupCommand, executeRemoteRestoreCommand } from "./remote.js";

describe("maintenance refuses invalid target types before mutation", () => {
  let storage: ReturnType<typeof createOwnedTestDirectory>;
  let log: ReturnType<typeof spyOn<typeof console, "log">>;
  beforeEach(() => {
    storage = createOwnedTestDirectory("memory-maintenance-targets-");
    log = spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    log.mockRestore();
    storage.cleanup();
  });

  function fixture(name: string, eventFence = false) {
    const root = join(storage.dir, name);
    mkdirSync(root);
    const dbPathOverride = join(root, "memory.db");
    const configPathOverride = join(root, "config.json");
    const eventsDirOverride = join(root, "events");
    const backupDirOverride = join(root, "backups");
    const db = new OwnedDatabase(dbPathOverride);
    try {
      createSchema(db);
      db.run("INSERT INTO facts(uuid,type,project,content,observed_at) VALUES(?,'learning','fixture',?,'2026-09-28T10:00:00.000Z')", [name, name]);
    } finally { db.close(); }
    writeFileSync(configPathOverride, JSON.stringify({ machineId: name }));
    if (eventFence) writeFileSync(eventsDirOverride, "routing fence");
    else mkdirSync(eventsDirOverride);
    return { dbPathOverride, configPathOverride, eventsDirOverride, backupDirOverride };
  }

  for (const kind of ["local", "remote"] as const) {
    it(`${kind} backup refuses a configuration directory without creating output`, async () => {
      const target = fixture("target");
      unlinkSync(target.configPathOverride);
      mkdirSync(target.configPathOverride);
      const before = readFileSync(target.dbPathOverride);
      const result = kind === "local"
        ? await executeBackupCreateCommand(undefined, target, { json: true })
        : await executeRemoteBackupCommand(undefined, target, { json: true });
      expect(result.exitCode).toBe(1);
      expect(readFileSync(target.dbPathOverride)).toEqual(before);
      expect(existsSync(target.backupDirOverride)).toBe(false);
    });
    it(`${kind} backup refuses a source file without checkpointing or creating output`, async () => {
      const target = fixture("target", true);
      const before = readFileSync(target.dbPathOverride);
      const result = kind === "local"
        ? await executeBackupCreateCommand(undefined, target, { json: true })
        : await executeRemoteBackupCommand(undefined, target, { json: true });
      expect(result.exitCode).toBe(1);
      expect(readFileSync(target.dbPathOverride)).toEqual(before);
      expect(readFileSync(target.eventsDirOverride, "utf8")).toBe("routing fence");
      expect(existsSync(target.backupDirOverride)).toBe(false);
    });

    it(`${kind} restore refuses a source file before replacing database or configuration`, async () => {
      const donor = fixture("donor");
      const target = fixture("target", true);
      const made = kind === "local"
        ? await executeBackupCreateCommand(undefined, donor, { json: true })
        : await executeRemoteBackupCommand(undefined, donor, { json: true });
      expect(made.exitCode).toBe(0);
      const report = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as { data: { backupPath: string } };
      const beforeDb = readFileSync(target.dbPathOverride);
      const beforeConfig = readFileSync(target.configPathOverride);
      const result = kind === "local"
        ? await executeRestoreCommand(report.data.backupPath, target, { confirm: true, json: true })
        : await executeRemoteRestoreCommand(report.data.backupPath, target, { confirm: true, json: true });
      expect(result.exitCode).toBe(1);
      expect(readFileSync(target.dbPathOverride)).toEqual(beforeDb);
      expect(readFileSync(target.configPathOverride)).toEqual(beforeConfig);
      expect(readFileSync(target.eventsDirOverride, "utf8")).toBe("routing fence");
      expect(existsSync(target.backupDirOverride)).toBe(false);
    });
  }
  it("local backup refuses a database directory without creating output", async () => {
    const target = fixture("target");
    unlinkSync(target.dbPathOverride);
    mkdirSync(target.dbPathOverride);
    const result = await executeBackupCreateCommand(undefined, target, { json: true });
    expect(result.exitCode).toBe(1);
    expect(existsSync(target.backupDirOverride)).toBe(false);
  });
});
