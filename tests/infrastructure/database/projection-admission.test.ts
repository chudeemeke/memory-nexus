import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { rebuildProjections, rebuildProjectionsWithReport, readMemoryEventsWithReport } from "../../../src/infrastructure/database/event-log.js";
import { executeProjectionsRebuildCommand } from "../../../src/presentation/cli/commands/projections.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";
import { captureStreams } from "../../helpers/capture-json.js";

const valid = JSON.stringify({ uuid: "incoming", type: "learning", project: "synthetic", content: "incomingneedle", observedAt: "2026-01-02T00:00:00Z" });
async function fixture(run: (db: OwnedDatabase, dir: string, path: string) => Promise<void>) {
  const storage = createOwnedTestDirectory("memory-projection-admission-");
  try {
    const db = new OwnedDatabase(":memory:");
    try {
      createSchema(db);
      db.exec("INSERT INTO facts (uuid,type,project,content,observed_at) VALUES ('retained','learning','synthetic','retainedneedle','2026-01-01T00:00:00Z')");
      await run(db, storage.dir, join(storage.dir, "events-synthetic.jsonl"));
    } finally { db.close(); }
  } finally { storage.cleanup(); }
}

describe("required projection source admission", () => {
  it("reports missing sources as not ready without creating a database", async () => {
    await fixture(async (_db, dir) => {
      const dbPath = join(dir, "uncreated.db");
      const result = await captureStreams(() => executeProjectionsRebuildCommand({ dbPathOverride: dbPath, eventsDirOverride: join(dir, "missing") }, { verify: true, json: true }));
      expect(result.exitCode).toBe(1); expect(JSON.parse(result.stdout).data.ready).toBe(false);
      expect(existsSync(dbPath)).toBe(false);
    });
  });

  for (const content of ["not JSON\n", valid + "\nnot JSON\n", JSON.stringify({ uuid: "invalid" }) + "\n"]) {
    it(`rejects invalid source before any database mutation (${content.length} bytes)`, async () => {
      await fixture(async (db, _dir, path) => {
        writeFileSync(path, content);
        const before = db.serialize();
        const report = await rebuildProjectionsWithReport(db, path);
        expect(report.invalidEvents).toBe(1);
        expect(report.replay).toEqual({ processedEvents: 0, skippedDuplicateEvents: 0, appliedProjections: [] });
        expect(db.serialize().equals(before)).toBe(true);
        await expect(rebuildProjections(db, path)).rejects.toThrow("invalid event log");
        expect(db.serialize().equals(before)).toBe(true);
      });
    });
  }

  it("does not disclose invalid record contents in public verification or rebuild errors", async () => {
    await fixture(async (db, dir, path) => {
      const marker = "synthetic-private-record-value";
      writeFileSync(path, valid + "\n" + marker + "\n");
      const opts = { dbPathOverride: join(dir, "memory.db"), eventsDirOverride: dir };
      writeFileSync(opts.dbPathOverride, db.serialize());
      const verify = await captureStreams(() => executeProjectionsRebuildCommand(opts, { verify: true, json: true }));
      expect(verify.exitCode).toBe(1); expect(JSON.parse(verify.stdout).data.ready).toBe(false);
      expect(verify.stdout + verify.stderr).not.toContain(marker);
      const rebuild = await captureStreams(() => executeProjectionsRebuildCommand(opts, { confirm: true, json: true }));
      expect(rebuild.exitCode).toBe(1); expect(rebuild.stdout + rebuild.stderr).not.toContain(marker);
      const stored = new Database(opts.dbPathOverride, { readonly: true });
      try {
        using statement = stored.prepare("SELECT uuid FROM facts");
        expect(statement.all()).toEqual([{ uuid: "retained" }]);
      } finally { stored.close(); }
      const report = await rebuildProjectionsWithReport(db, path);
      expect(report.invalidEventLines[0]?.reason).toContain("line 2");
      expect(report.invalidEventLines[0]?.line).toBe("");
    });
  });

  it("preserves tolerant read-only reporting independently of rebuild admission", async () => {
    await fixture(async (db, _dir, path) => {
      const before = db.serialize();
      expect(await readMemoryEventsWithReport(path)).toEqual({ events: [], invalidEvents: [] });
      writeFileSync(path, valid + "\nnot JSON\n");
      const report = await readMemoryEventsWithReport(path);
      expect(report.events.length).toBe(1); expect(report.invalidEvents.length).toBe(1);
      expect(db.serialize().equals(before)).toBe(true);
    });
  });

  it("admits explicitly empty and valid logs with accurate projection results", async () => {
    await fixture(async (db, dir, path) => {
      writeFileSync(path, "");
      expect((await rebuildProjectionsWithReport(db, path)).replay.processedEvents).toBe(0);
      { using read = db.prepare("SELECT uuid FROM facts"); expect(read.all()).toEqual([]); }
      writeFileSync(path, valid + "\n");
      expect((await rebuildProjectionsWithReport(db, path)).replay.processedEvents).toBe(1);
      { using read = db.prepare("SELECT content FROM facts_fts WHERE facts_fts MATCH 'incomingneedle'"); expect(read.all()).toEqual([{ content: "incomingneedle" }]); }
      const verify = await captureStreams(() => executeProjectionsRebuildCommand({ eventsDirOverride: dir, dbPathOverride: join(dir, "uncreated.db") }, { verify: true, json: true }));
      expect(verify.exitCode).toBe(0); expect(JSON.parse(verify.stdout).data.ready).toBe(true);
    });
  });
});
