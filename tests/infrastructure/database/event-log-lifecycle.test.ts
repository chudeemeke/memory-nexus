import { describe, expect, it } from "bun:test";
import type { Statement } from "bun:sqlite";
import { dirname, join } from "node:path";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { appendEvent, rebuildProjectionsWithReport } from "../../../src/infrastructure/database/event-log.js";
import { Fact } from "../../../src/domain/entities/fact.js";

async function withFixture(run: (db: OwnedDatabase, path: string, released: () => void) => Promise<void>): Promise<void> {
  const storage = createOwnedTestDirectory("memory-event-lifecycle-");
  const db = new OwnedDatabase(":memory:");
  try {
    createSchema(db); db.transaction(() => {})();
    const statements: Statement[] = [], prepare = db.prepare.bind(db);
    db.prepare = ((...args: Parameters<typeof db.prepare>) => {
      const statement = Reflect.apply(prepare, db, args) as Statement;
      statements.push(statement); return statement;
    }) as typeof db.prepare;
    const path = join(storage.dir, "events-synthetic.jsonl"); writeFileSync(path, "");
    await run(db, path, () => {
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
      statements.length = 0;
    });
  } finally { db.close(); storage.cleanup(); }
}
function all(db: OwnedDatabase, sql: string): unknown[] { using statement = db.prepare(sql); return statement.all(); }
function governanceSeed(db: OwnedDatabase): void {
  db.exec(`INSERT INTO memory_governance
    (surface, target_id, visibility, source_event_ids, transformation_method, actor, confidence,
     redaction_state, consent_status, consent_scopes, scope, status, created_at, updated_at)
    VALUES ('fact','synthetic','project','[]','synthetic','test',1,'none','not_required','[]','{}','active','synthetic','synthetic');
    INSERT INTO memory_governance_events (event_id,kind,control,surface,target_id,actor,occurred_at,payload)
    VALUES ('audit','governance','suppress','fact','synthetic','test','synthetic','{}');`);
}
async function writeFacts(path: string): Promise<void> {
  const original = Fact.create({ uuid: "original", type: "learning", project: "synthetic", content: "originalneedle", observedAt: new Date("2026-01-01T00:00:00Z") });
  await appendEvent(original, path);
  await appendEvent(Fact.create({ uuid: "replacement", type: "learning", project: "synthetic", content: "replacementneedle", observedAt: new Date("2026-01-02T00:00:00Z") }), path);
  await appendEvent(Fact.create({ uuid: "supersedence", type: "supersedence", project: "synthetic", content: "replacement decision", metadata: { superseded_uuid: "original", superseded_by_uuid: "replacement" }, observedAt: new Date("2026-01-03T00:00:00Z") }), path);
  await appendEvent(original, path);
}

describe("event-log statement lifetime and governance reset", () => {
  it("preserves existing facts when the selected log is missing or discovery is empty", async () => {
    await withFixture(async (db, path, released) => {
      db.exec("INSERT INTO facts (uuid,type,project,content,observed_at) VALUES ('retained','learning','synthetic','retainedneedle','2026-01-01T00:00:00Z')");
      unlinkSync(path);
      await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow("Event log unavailable");
      expect(all(db, "SELECT uuid FROM facts")).toEqual([{ uuid: "retained" }]); released();
      const emptyDirectory = join(dirname(path), "empty"); mkdirSync(emptyDirectory);
      await expect(rebuildProjectionsWithReport(db, undefined, emptyDirectory)).rejects.toThrow("No event log files");
      expect(all(db, "SELECT uuid FROM facts")).toEqual([{ uuid: "retained" }]); released();
    });
  });

  it("releases native fact and supersedence writes across repeated real-log replay", async () => {
    await withFixture(async (db, path, released) => {
      await writeFacts(path);
      for (let iteration = 0; iteration < 10; iteration++) {
        const result = await rebuildProjectionsWithReport(db, path);
        expect(result.invalidEvents).toBe(0);
        expect(result.replay.processedEvents).toBe(3); expect(result.replay.skippedDuplicateEvents).toBe(1);
        expect(all(db, "SELECT superseded_by FROM facts WHERE uuid = 'original'")).toEqual([{ superseded_by: "replacement" }]);
        expect(all(db, "SELECT rowid FROM facts_fts WHERE facts_fts MATCH 'originalneedle'")).toHaveLength(1);
        expect(all(db, "SELECT uuid FROM facts ORDER BY uuid")).toEqual([{ uuid: "original" }, { uuid: "replacement" }, { uuid: "supersedence" }]);
        released();
      }
    });
  });

  it("releases direct statements after native insert and supersedence failures", async () => {
    await withFixture(async (db, path, released) => {
      await writeFacts(path);
      db.exec("CREATE TRIGGER reject_fact BEFORE INSERT ON facts BEGIN SELECT RAISE(ABORT,'synthetic fact failure'); END");
      await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow("synthetic fact failure"); released();
      db.exec("DROP TRIGGER reject_fact; CREATE TRIGGER reject_supersedence BEFORE UPDATE OF superseded_by ON facts BEGIN SELECT RAISE(ABORT,'synthetic supersedence failure'); END");
      await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow("synthetic supersedence failure"); released();
      db.exec("DROP TRIGGER reject_supersedence");
      expect((await rebuildProjectionsWithReport(db, path)).replay.processedEvents).toBe(3); released();
    });
  });

  it("clears governance audit and projection together through public replay", async () => {
    await withFixture(async (db, path, released) => {
      governanceSeed(db);
      expect((await rebuildProjectionsWithReport(db, path)).replay.processedEvents).toBe(0);
      expect(all(db, "SELECT * FROM memory_governance_events")).toEqual([]);
      expect(all(db, "SELECT * FROM memory_governance")).toEqual([]); released();
    });
  });

  it("preserves both governance tables when the second delete fails, then permits retry", async () => {
    await withFixture(async (db, path, released) => {
      governanceSeed(db);
      const entries = all(db, "SELECT * FROM memory_governance"), events = all(db, "SELECT * FROM memory_governance_events"); released();
      db.exec("CREATE TRIGGER reject_governance_clear BEFORE DELETE ON memory_governance BEGIN SELECT RAISE(ABORT,'synthetic governance reset failure'); END");
      await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow("synthetic governance reset failure");
      expect(all(db, "SELECT * FROM memory_governance")).toEqual(entries);
      expect(all(db, "SELECT * FROM memory_governance_events")).toEqual(events);
      expect(db.inTransaction).toBe(false); released();
      db.exec("DROP TRIGGER reject_governance_clear");
      await rebuildProjectionsWithReport(db, path);
      expect(all(db, "SELECT * FROM memory_governance")).toEqual([]);
      expect(all(db, "SELECT * FROM memory_governance_events")).toEqual([]); released();
    });
  });

  it("keeps governance clearing inside an enclosing caller transaction", async () => {
    await withFixture(async (db, path, released) => {
      governanceSeed(db); const before = all(db, "SELECT * FROM memory_governance_events"); released();
      db.exec("BEGIN"); await rebuildProjectionsWithReport(db, path);
      expect(db.inTransaction).toBe(true);
      expect(all(db, "SELECT * FROM memory_governance_events")).toEqual([]);
      db.exec("ROLLBACK");
      expect(all(db, "SELECT * FROM memory_governance_events")).toEqual(before);
      expect(all(db, "SELECT * FROM memory_governance")).toHaveLength(1); released();
    });
  });
});
