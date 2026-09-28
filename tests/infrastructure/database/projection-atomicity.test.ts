import { describe, expect, it, spyOn } from "bun:test";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { appendEvent, appendMemoryEvent, rebuildProjectionsWithReport } from "../../../src/infrastructure/database/event-log.js";
import { Fact } from "../../../src/domain/entities/fact.js";
import { DreamEntry } from "../../../src/domain/entities/dream-entry.js";
import { MemoryEventEnvelope } from "../../../src/domain/entities/memory-event.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

const tables = ["facts", "persona_entries", "graph_edges", "dream_entries", "memory_governance", "memory_governance_events"];
function rows(db: OwnedDatabase, sql: string) { using statement = db.prepare(sql); return statement.all(); }
function snapshot(db: OwnedDatabase) {
  return { tables: tables.map(table => rows(db, `SELECT * FROM main.${table} ORDER BY rowid`)),
    fts: rows(db, "SELECT rowid,content FROM facts_fts WHERE facts_fts MATCH 'oldneedle OR newneedle' ORDER BY rowid"),
    sequences: rows(db, "SELECT * FROM sqlite_sequence ORDER BY name"),
    unrelated: rows(db, "SELECT * FROM sessions") };
}
async function corpus(path: string, prefix: string) {
  writeFileSync(path, "");
  const time = new Date("2026-01-01T00:00:00Z");
  await appendEvent(Fact.create({ uuid: prefix, type: "preference", project: "synthetic", content: prefix + "needle",
    observedAt: time, metadata: { confidence: 0.9, graph_edges: [{ id: prefix + "edge",
      source: { type: "tool", id: "memory", label: "memory" }, target: { type: "tool", id: prefix, label: prefix },
      relationship: "uses", confidence: 0.9, why: "synthetic" }] } }), path);
  const dream = DreamEntry.create({ dreamId: prefix + "dream", kind: "supersedence_proposal", project: "synthetic",
    visibility: "project", sourceEventIds: [prefix], targetFactUuid: prefix,
    proposedFact: { uuid: prefix + "proposed", type: "decision", project: "synthetic", content: "synthetic proposal" },
    reason: "synthetic", confidence: 0.9, audit: { redactionState: "none", reviewer: "user", redactedFields: [], findingHashes: [] },
    createdAt: time, updatedAt: time });
  for (const [kind, payload] of [
    ["dream", { dream: { action: "propose", entry: dream.toJSON() } }],
    ["governance", { governance: { control: "suppress", surface: "fact", targetId: prefix, reason: "synthetic" } }],
  ] as const) {
    await appendMemoryEvent(MemoryEventEnvelope.create({ eventId: prefix + kind, machineId: "synthetic", sequence: 2,
      kind, operation: "add", occurredAt: time, observedAt: time, scope: { project: "synthetic", visibility: "project" },
      provenance: { source: "test", actor: "test", method: "fixture" }, privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] }, causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] }, payload }), path);
  }
}
async function fixture(run: (db: OwnedDatabase, path: string, other: OwnedDatabase) => Promise<void>) {
  const storage = createOwnedTestDirectory("memory-projection-atomic-");
  const dbPath = join(storage.dir, "synthetic.db"), db = new OwnedDatabase(dbPath);
  let other: OwnedDatabase | undefined;
  try {
    createSchema(db); db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=0;");
    db.exec("INSERT INTO sessions (id,project_path_encoded,project_path_decoded,project_name,start_time) VALUES ('unrelated','synthetic','synthetic','synthetic','2026-01-01')");
    const path = join(storage.dir, "events-synthetic.jsonl");
    await corpus(path, "old"); await rebuildProjectionsWithReport(db, path);
    for (const table of tables) expect(rows(db, `SELECT * FROM ${table}`).length).toBeGreaterThan(0);
    await corpus(path, "new");
    other = new OwnedDatabase(dbPath); other.exec("PRAGMA busy_timeout=0");
    await run(db, path, other);
  } finally { other?.close(); db.close(); storage.cleanup(); }
}

describe("atomic projection replacement", () => {
  for (const table of tables) for (const action of ["DELETE", "INSERT"] as const) {
    it(`rolls back all projections and FTS after ${table} ${action} failure, then retries`, async () => {
      await fixture(async (db, path) => {
        const before = snapshot(db);
        db.exec(`CREATE TRIGGER reject_promotion BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'synthetic promotion failure'); END`);
        await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow("synthetic promotion failure");
        expect(db.inTransaction).toBe(false); expect(snapshot(db)).toEqual(before);
        db.exec("DROP TRIGGER reject_promotion");
        expect((await rebuildProjectionsWithReport(db, path)).replay.processedEvents).toBe(3);
        expect(rows(db, "SELECT uuid FROM facts")).toEqual([{ uuid: "new" }]);
        expect(rows(db, "SELECT content FROM facts_fts WHERE facts_fts MATCH 'oldneedle'")).toEqual([]);
        expect(rows(db, "SELECT content FROM facts_fts WHERE facts_fts MATCH 'newneedle'")).toEqual([{ content: "newneedle" }]);
      });
    });
  }
  it("retains stable numeric identities on repeat replay and unrelated data", async () => {
    await fixture(async (db, path) => {
      await corpus(path, "old"); const before = snapshot(db);
      await rebuildProjectionsWithReport(db, path);
      const after = snapshot(db);
      expect(after.tables.map(table => table.map((row: any) => row.id ?? row.event_id)))
        .toEqual(before.tables.map(table => table.map((row: any) => row.id ?? row.event_id)));
      expect(after.unrelated).toEqual(before.unrelated); expect(after.fts).toEqual(before.fts);
    });
  });
  for (const action of ["same-write", "other-write", "same-schema", "other-schema", "temporary-trigger", "same-rollback"]) {
    it(`refuses concurrent ${action} and preserves it`, async () => {
      await fixture(async (db, path, other) => {
        const pending = rebuildProjectionsWithReport(db, path);
        if (action === "same-write" || action === "other-write") {
          (action === "same-write" ? db : other).exec("UPDATE facts SET content='concurrentneedle'");
        } else if (action === "same-schema" || action === "other-schema") {
          (action === "same-schema" ? db : other).exec("CREATE TABLE concurrent_schema(value TEXT)");
        } else if (action === "temporary-trigger") {
          db.exec("CREATE TEMP TRIGGER concurrent_trigger BEFORE INSERT ON main.facts BEGIN SELECT RAISE(IGNORE); END");
        } else { db.exec("BEGIN; UPDATE facts SET content='temporary'; ROLLBACK"); }
        const before = snapshot(db);
        await expect(pending).rejects.toThrow("changed during projection rebuild");
        expect(snapshot(db)).toEqual(before); expect(db.inTransaction).toBe(false);
      });
    });
  }
  for (const timing of ["before", "during"]) {
    it(`refuses a caller transaction opened ${timing} replay without rolling it back`, async () => {
      await fixture(async (db, path) => {
        if (timing === "before") db.exec("BEGIN");
        const pending = rebuildProjectionsWithReport(db, path);
        if (timing === "during") db.exec("BEGIN");
        db.exec("UPDATE facts SET content='callerneedle'"); const before = snapshot(db);
        await expect(pending).rejects.toThrow("caller transaction");
        expect(db.inTransaction).toBe(true); expect(snapshot(db)).toEqual(before); db.exec("ROLLBACK");
      });
    });
  }
  it("retains all projections after a native deferred-constraint commit failure", async () => {
    await fixture(async (db, path) => {
      db.exec("CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(id INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED);");
      db.exec("CREATE TRIGGER fail_commit AFTER INSERT ON facts BEGIN INSERT INTO child VALUES(1); END");
      const before = snapshot(db);
      await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow("FOREIGN KEY");
      expect(db.inTransaction).toBe(false); expect(snapshot(db)).toEqual(before);
      expect(rows(db, "SELECT * FROM child")).toEqual([]);
      db.exec("DROP TRIGGER fail_commit"); await rebuildProjectionsWithReport(db, path);
    });
  });
  it("refuses an ignored insert instead of reporting partial success", async () => {
    await fixture(async (db, path) => {
      db.exec("CREATE TRIGGER ignore_insert BEFORE INSERT ON facts BEGIN SELECT RAISE(IGNORE); END");
      const before = snapshot(db);
      await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow();
      expect(snapshot(db)).toEqual(before);
    });
  });
  it("preserves prior state on staging payload failure and permits retry", async () => {
    await fixture(async (db, path) => {
      // Syntactically valid envelope; governance application rejects a missing target.
      const time = new Date("2026-01-02T00:00:00Z");
      await appendMemoryEvent(MemoryEventEnvelope.create({ eventId: "invalid-control", machineId: "synthetic", sequence: 3,
        kind: "governance", operation: "add", occurredAt: time, observedAt: time, scope: { project: "synthetic", visibility: "project" },
        provenance: { source: "test", actor: "test", method: "fixture" }, privacy: { redactionState: "none", containsSensitiveContent: false },
        consent: { status: "not_required", scopes: [] }, causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
        payload: { governance: { control: "suppress" } } }), path);
      const before = snapshot(db);
      await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow("source cannot be replayed");
      expect(snapshot(db)).toEqual(before);
      await corpus(path, "new"); await rebuildProjectionsWithReport(db, path);
    });
  });
  for (const sql of [
    "CREATE TRIGGER faulty BEFORE DELETE ON facts BEGIN SELECT RAISE(IGNORE); END",
    "CREATE TRIGGER faulty AFTER INSERT ON facts BEGIN UPDATE facts SET content='altered' WHERE uuid=new.uuid; END",
    "CREATE TRIGGER faulty AFTER INSERT ON facts BEGIN UPDATE facts SET id=id+100 WHERE uuid=new.uuid; END",
    "CREATE TRIGGER faulty AFTER INSERT ON memory_governance_events BEGIN UPDATE facts SET content='later-altered'; END",
    "CREATE TRIGGER faulty AFTER INSERT ON memory_governance_events BEGIN DELETE FROM facts; END",
    "DROP TRIGGER facts_fts_insert",
    "ALTER TABLE facts ADD COLUMN unknown_projection_field TEXT",
  ]) {
    it(`refuses incomplete or trigger-altered replacement: ${sql}`, async () => {
      await fixture(async (db, path) => {
        db.exec(sql); const before = snapshot(db);
        await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow();
        expect(snapshot(db)).toEqual(before); expect(db.inTransaction).toBe(false);
      });
    });
  }
  it("preserves a surviving 64-bit numeric identity exactly", async () => {
    await fixture(async (db, path) => {
      db.exec("UPDATE facts SET id=9007199254740993 WHERE uuid='old'");
      await corpus(path, "old"); await rebuildProjectionsWithReport(db, path);
      expect(rows(db, "SELECT CAST(id AS TEXT) AS id FROM facts")).toEqual([{ id: "9007199254740993" }]);
    });
  });
  it("permits concurrent reads and rejects a competing writer lock without partial replacement", async () => {
    await fixture(async (db, path, other) => {
      const pending = rebuildProjectionsWithReport(db, path); rows(other, "SELECT * FROM facts"); await pending;
      await corpus(path, "old"); const before = snapshot(db);
      other.exec("BEGIN IMMEDIATE");
      try { await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow("locked"); }
      finally { other.exec("ROLLBACK"); }
      expect(snapshot(db)).toEqual(before); expect(db.inTransaction).toBe(false);
      await rebuildProjectionsWithReport(db, path);
    });
  });
  for (const phase of ["initialization", "reset", "success"]) {
    it(`releases the isolated native stage after ${phase}`, async () => {
      await fixture(async (db, path, other) => {
        const before = snapshot(db), original = OwnedDatabase.prototype.exec;
        let stage: OwnedDatabase | undefined;
        const hook = spyOn(OwnedDatabase.prototype, "exec").mockImplementation(function(this: OwnedDatabase, ...args) {
          const result = Reflect.apply(original, this, args);
          if (this !== db && this !== other && args[0].includes("CREATE TABLE IF NOT EXISTS facts")) {
            stage = this;
            if (phase === "initialization") Reflect.apply(original, this, ["SELECT * FROM missing_synthetic_table"]);
            if (phase === "reset") Reflect.apply(original, this, ["CREATE TRIGGER reject_reset BEFORE DELETE ON facts BEGIN SELECT RAISE(ABORT,'stage reset failure'); END; INSERT INTO facts(uuid,type,project,content,observed_at) VALUES('stage','learning','synthetic','seed','synthetic')"]);
          }
          return result;
        });
        try {
          if (phase === "success") await rebuildProjectionsWithReport(db, path);
          else { await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow(); expect(snapshot(db)).toEqual(before); }
          expect(stage).toBeDefined(); expect(() => stage!.prepare("SELECT 1")).toThrow();
        } finally { hook.mockRestore(); }
      });
    });
  }
  for (const invalid of ["SELECT 9007199254740992 AS value", "SELECT -1 AS value", "SELECT 1 AS value WHERE 0"]) {
    it(`refuses unavailable conflict evidence: ${invalid}`, async () => {
      await fixture(async (db, path) => {
        const before = snapshot(db), prepare = db.prepare.bind(db);
        const hook = spyOn(db, "prepare").mockImplementation(((sql: string, ...args: unknown[]) =>
          Reflect.apply(prepare, db, [sql === "SELECT total_changes() AS value" ? invalid : sql, ...args])) as typeof db.prepare);
        try { await expect(rebuildProjectionsWithReport(db, path)).rejects.toThrow("fence unavailable"); }
        finally { hook.mockRestore(); }
        expect(snapshot(db)).toEqual(before);
      });
    });
  }
});
