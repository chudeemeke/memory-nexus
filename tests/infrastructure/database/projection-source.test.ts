import { describe, expect, it, spyOn } from "bun:test";
import { appendFileSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { isProjectionSourceCurrent, captureProjectionSource, assertProjectionSource } from "../../../src/infrastructure/database/projection-source.js";
import { rebuildProjectionsWithReport } from "../../../src/infrastructure/database/event-log.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

const record = (uuid: string) => JSON.stringify({ uuid, type: "learning", project: "synthetic", content: uuid + "needle", observedAt: "2026-01-01T00:00:00Z" }) + "\n";
function facts(db: OwnedDatabase) { using s = db.prepare("SELECT uuid,content FROM facts ORDER BY uuid"); return s.all(); }
function receipt(db: OwnedDatabase) { using s = db.prepare<{ manifest: string }, []>("SELECT manifest FROM projection_replay_state WHERE id=1"); return s.get()?.manifest; }
async function fixture(run: (db: OwnedDatabase, path: string, dir: string) => Promise<void>) {
  const storage = createOwnedTestDirectory("memory-projection-source-");
  const db = new OwnedDatabase(":memory:");
  try {
    createSchema(db);
    db.exec("INSERT INTO facts(uuid,type,project,content,observed_at) VALUES('retained','learning','synthetic','retainedneedle','synthetic')");
    const path = join(storage.dir, "events-one.jsonl"); writeFileSync(path, record("one"));
    await run(db, path, storage.dir);
  } finally { db.close(); storage.cleanup(); }
}

describe("projection source cutoff", () => {
  for (const phase of ["capture", "staging"] as const) for (const change of ["append", "truncate", "replace", "remove", "new-file"] as const) {
    it(`refuses ${change} during ${phase} and retains prior projections`, async () => {
      await fixture(async (db, path, dir) => {
        const before = facts(db);
        const mutate = () => {
          if (change === "append") appendFileSync(path, record("two"));
          else if (change === "truncate") writeFileSync(path, "");
          else if (change === "replace") { renameSync(path, join(dir, "previous.txt")); writeFileSync(path, record("one")); }
          else if (change === "remove") unlinkSync(path);
          else writeFileSync(join(dir, "events-two.jsonl"), record("two"));
        };
        const exec = OwnedDatabase.prototype.exec;
        let changed = false;
        const hook = spyOn(OwnedDatabase.prototype, "exec").mockImplementation(function(this: OwnedDatabase, ...args) {
          const result = Reflect.apply(exec, this, args);
          if (phase === "staging" && this !== db && args[0].includes("CREATE TABLE IF NOT EXISTS facts")) { mutate(); changed = true; }
          return result;
        });
        try {
          const pending = rebuildProjectionsWithReport(db, undefined, dir);
          if (phase === "capture") { mutate(); changed = true; }
          await expect(pending).rejects.toThrow("source");
          expect(changed).toBe(true); expect(facts(db)).toEqual(before); expect(db.inTransaction).toBe(false);
        } finally { hook.mockRestore(); }
      });
    });
  }
  it("records the exact all-file cutoff and keeps its receipt after a late SQL failure", async () => {
    await fixture(async (db, path, dir) => {
      const second = join(dir, "events-two.jsonl"); writeFileSync(second, record("two"));
      await rebuildProjectionsWithReport(db, undefined, dir);
      const original = receipt(db)!;
      const manifest = JSON.parse(original);
      expect(manifest.scope).toEqual({ kind: "directory", path: dir });
      expect(manifest.files).toEqual([path, second].sort().map(path => ({ path, bytes: readFileSync(path).length,
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex") })));
      appendFileSync(path, record("three")); const before = facts(db);
      db.exec("CREATE TRIGGER reject_receipt BEFORE UPDATE ON projection_replay_state BEGIN SELECT RAISE(ABORT,'receipt failure'); END");
      await expect(rebuildProjectionsWithReport(db, undefined, dir)).rejects.toThrow("receipt failure");
      expect(receipt(db)).toBe(original); expect(facts(db)).toEqual(before);
      db.exec("DROP TRIGGER reject_receipt"); await rebuildProjectionsWithReport(db, undefined, dir);
      expect(receipt(db)).not.toBe(original); expect(facts(db)).toHaveLength(3);
    });
  });
  it("rejects invalid UTF-8 without storing replacement characters or disclosing bytes", async () => {
    await fixture(async (db, path) => {
      const before = facts(db), bytes = Buffer.from(record("sensitive-marker"));
      bytes[bytes.indexOf("needle")] = 0xff; writeFileSync(path, bytes);
      let error: unknown; try { await rebuildProjectionsWithReport(db, path); } catch (cause) { error = cause; }
      expect(error).toBeDefined(); expect(String(error)).not.toContain("sensitive-marker"); expect(facts(db)).toEqual(before);
    });
  });
  it("rejects a discovered directory posing as an event log", async () => {
    await fixture(async (db, path) => {
      unlinkSync(path); mkdirSync(path); const before = facts(db);
      await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow("regular file"); expect(facts(db)).toEqual(before);
    });
  });
  it("detects post-cutoff input across restart without falsely advancing the receipt", async () => {
    await fixture(async (db, path, dir) => {
      expect(await isProjectionSourceCurrent(db, undefined, dir)).toBe(false);
      const run = db.run.bind(db);
      const hook = spyOn(db, "run").mockImplementation((sql, ...args) => {
        const result = Reflect.apply(run, db, [sql, ...args]);
        if (sql === 'DELETE FROM main."facts"') appendFileSync(path, record("later"));
        return result;
      });
      try { await rebuildProjectionsWithReport(db, undefined, dir); }
      finally { hook.mockRestore(); }
      expect(facts(db)).toEqual([{ uuid: "one", content: "oneneedle" }]);
      const restored = OwnedDatabase.deserialize(db.serialize());
      try { expect(await isProjectionSourceCurrent(restored, undefined, dir)).toBe(false); }
      finally { restored.close(); }
      await rebuildProjectionsWithReport(db, undefined, dir);
      expect(await isProjectionSourceCurrent(db, undefined, dir)).toBe(true);
      expect(facts(db)).toHaveLength(2);
      expect(await isProjectionSourceCurrent(db, path)).toBe(false);
    });
  });
  it("checks bytes even when metadata appears unchanged", async () => {
    await fixture(async (_db, path) => {
      const source = await captureProjectionSource(path, undefined, () => {});
      writeFileSync(path, record("two"));
      const stat = lstatSync(path, { bigint: true });
      // Simulate metadata that failed to distinguish a same-length replacement.
      source.identities[0] = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
      expect(() => assertProjectionSource(source)).toThrow("source changed");
    });
  });
  it("preserves split UTF-8 and a complete final record without a newline", async () => {
    await fixture(async (db, path) => {
      const event = JSON.parse(record("unicode")); event.content = "é".repeat(40000);
      writeFileSync(path, "\r\n" + JSON.stringify(event));
      const report = await rebuildProjectionsWithReport(db, path);
      expect(report.invalidEvents).toBe(0); expect(facts(db)).toEqual([{ uuid: "unicode", content: event.content }]);
      expect(await isProjectionSourceCurrent(db, path)).toBe(true);
    });
  });
  for (const action of ["SELECT RAISE(IGNORE);", "UPDATE projection_replay_state SET manifest='tampered' WHERE id=1;"]) {
    it(`rolls back projections if a receipt write is ignored or altered: ${action}`, async () => {
      await fixture(async (db, path) => {
        await rebuildProjectionsWithReport(db, path); const original = receipt(db), before = facts(db);
        appendFileSync(path, record("two"));
        db.exec(`CREATE TRIGGER alter_receipt ${action.startsWith("SELECT") ? "BEFORE" : "AFTER"} UPDATE ON projection_replay_state BEGIN ${action} END`);
        await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow("receipt");
        expect(receipt(db)).toBe(original); expect(facts(db)).toEqual(before);
      });
    });
  }
});
