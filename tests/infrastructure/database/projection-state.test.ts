import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { appendEvent, appendMemoryEvent, rebuildProjectionsWithReport } from "../../../src/infrastructure/database/event-log.js";
import { Fact } from "../../../src/domain/entities/fact.js";
import { DreamEntry } from "../../../src/domain/entities/dream-entry.js";
import { MemoryEventEnvelope } from "../../../src/domain/entities/memory-event.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";
import { projectionContentIdentity } from "../../../src/infrastructure/database/projection-state.js";
import { captureProjectionSource } from "../../../src/infrastructure/database/projection-source.js";
import { captureProjectionFence, createProjectionStage, promoteProjections } from "../../../src/infrastructure/database/projection-replacement.js";


const tables = ["facts", "persona_entries", "graph_edges", "dream_entries", "memory_governance", "memory_governance_events"];
function receipt(db: OwnedDatabase) { using s = db.prepare<{ manifest: string }, []>("SELECT manifest FROM projection_replay_state WHERE id=1"); return s.get()?.manifest; }
async function corpus(path: string, prefix: string, append = false) {
  if (!append) writeFileSync(path, "");
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

async function fixture(run: (db: OwnedDatabase, path: string, dbPath: string) => Promise<void>) {
  const storage = createOwnedTestDirectory("memory-projection-state-"), dbPath = join(storage.dir, "synthetic.db"), db = new OwnedDatabase(dbPath);
  try { createSchema(db); const path = join(storage.dir, "events-synthetic.jsonl"); await corpus(path, "old"); await run(db, path, dbPath); }
  finally { db.close(); storage.cleanup(); }
}
describe("automatic projection replay authority", () => {
  it("distinguishes adjacent int64 identities without JS integer rounding", async () => {
    await fixture(async (db,path) => {
      await rebuildProjectionsWithReport(db,path); db.exec("UPDATE facts SET id=9007199254740992");
      await rebuildProjectionsWithReport(db,path); db.exec("UPDATE facts SET id=9007199254740993");
      await expect(rebuildProjectionsWithReport(db,path,undefined,"automatic")).rejects.toThrow("reconciliation");
    });
  });
  it("distinguishes storage types, NULL, empty values and NUL-containing text", async () => {
    await fixture(async (db,path) => {
      await rebuildProjectionsWithReport(db,path); const hashes = new Set<string>();
      using update = db.prepare("UPDATE facts SET metadata=?");
      for (const value of [null, "", "a\u0000b", "a\u0000c", "a", new Uint8Array([97])]) {
        update.run(value); hashes.add(projectionContentIdentity(db).hash);
      }
      expect(hashes.size).toBe(6);
    });
  });
  it("distinguishes adjacent real values in one otherwise unchanged row", async () => {
    await fixture(async (db,path) => {
      await rebuildProjectionsWithReport(db,path);
      using update = db.prepare("UPDATE memory_governance SET confidence=? WHERE surface='fact' AND target_id='old'");
      update.run(0.9); const before=projectionContentIdentity(db).hash;
      update.run(0.9000000000000001); expect(projectionContentIdentity(db).hash).not.toBe(before);
    });
  });
  it("refuses malformed receipt JSON and incomplete projection schema", async () => {
    await fixture(async (db,path) => {
      await rebuildProjectionsWithReport(db,path); db.exec("UPDATE projection_replay_state SET manifest='invalid'");
      await expect(rebuildProjectionsWithReport(db,path,undefined,"automatic")).rejects.toThrow("reconciliation");
      db.exec("DROP TABLE graph_edges"); expect(() => projectionContentIdentity(db)).toThrow("complete schema");
    });
  });
  it("enforces automatic authority again at the actual promotion boundary", async () => {
    await fixture(async (db,path) => {
      await rebuildProjectionsWithReport(db,path); db.exec("DELETE FROM facts");
      const before=db.serialize(), source=await captureProjectionSource(path,undefined,()=>{}), stage=createProjectionStage();
      try { expect(()=>promoteProjections(db,stage,captureProjectionFence(db),source,true)).toThrow("reconciliation"); expect(db.serialize().equals(before)).toBe(true); }
      finally { stage.close(); }
    });
  });
  it("bootstraps an empty store and commits content identity with the source receipt", async () => {
    await fixture(async (db, path) => {
      await rebuildProjectionsWithReport(db, path, undefined, "automatic");
      expect(JSON.parse(receipt(db)!).projectionState).toMatch(/^v1:[a-f0-9]{64}$/);
    });
  });
  it("refuses to overwrite unlogged data without a receipt", async () => {
    await fixture(async (db, path) => {
      db.exec("INSERT INTO facts(uuid,type,project,content,observed_at) VALUES('unlogged','learning','synthetic','retained','synthetic')");
      const before = db.serialize();
      await expect(rebuildProjectionsWithReport(db, path, undefined, "automatic")).rejects.toThrow("reconciliation");
      expect(db.serialize().equals(before)).toBe(true);
    });
  });
  for (const table of tables) {
    it("refuses automatic resurrection after direct deletion from " + table, async () => {
      await fixture(async (db, path) => {
        await rebuildProjectionsWithReport(db, path);
        using count = db.prepare<{ n: number }, []>("SELECT COUNT(*) AS n FROM " + table);
        expect(count.get()!.n).toBeGreaterThan(0);
        db.exec("DELETE FROM " + table); const before = db.serialize();
        await expect(rebuildProjectionsWithReport(db, path, undefined, "automatic")).rejects.toThrow("reconciliation");
        expect(db.serialize().equals(before)).toBe(true);
      });
    });
  }
  for (const change of ["UPDATE facts SET content='edited'", "UPDATE facts SET id=9007199254740993", "UPDATE memory_governance SET confidence=0.9000000000000001"]) {
    it("detects exact content divergence: " + change, async () => {
      await fixture(async (db, path) => {
        await rebuildProjectionsWithReport(db, path); db.exec(change); const before = db.serialize();
        await expect(rebuildProjectionsWithReport(db, path, undefined, "automatic")).rejects.toThrow("reconciliation");
        expect(db.serialize().equals(before)).toBe(true);
      });
    });
  }
  for (const state of [undefined, "invalid", null]) {
    it("refuses old or malformed content identity: " + state, async () => {
      await fixture(async (db, path) => {
        await rebuildProjectionsWithReport(db, path); const value=JSON.parse(receipt(db)!); value.projectionState=state;
        using update=db.prepare("UPDATE projection_replay_state SET manifest=? WHERE id=1"); update.run(JSON.stringify(value)); const before=db.serialize();
        await expect(rebuildProjectionsWithReport(db, path, undefined, "automatic")).rejects.toThrow("reconciliation");
        expect(db.serialize().equals(before)).toBe(true);
        await rebuildProjectionsWithReport(db, path); expect(JSON.parse(receipt(db)!).projectionState).toMatch(/^v1:[a-f0-9]{64}$/);
      });
    });
  }
  it("recovers unchanged projections across reopen and ignored unrelated changes", async () => {
    await fixture(async (db, path, dbPath) => {
      await rebuildProjectionsWithReport(db, path); const first=receipt(db);
      db.exec("CREATE TABLE unrelated(value TEXT); INSERT INTO unrelated VALUES('synthetic')");
      const reopened=new OwnedDatabase(dbPath);
      try { await corpus(path,"new",true); expect((await rebuildProjectionsWithReport(reopened,path,undefined,"automatic")).replay.processedEvents).toBe(6); expect(receipt(reopened)).not.toBe(first); }
      finally { reopened.close(); }
    });
  });
  it("rolls back a receipt trigger that changes projected rows", async () => {
    await fixture(async (db,path) => {
      await rebuildProjectionsWithReport(db,path);
      db.exec("CREATE TRIGGER receipt_side_effect AFTER UPDATE ON projection_replay_state BEGIN UPDATE facts SET content='tampered'; END");
      const before=db.serialize(); await corpus(path,"new",true);
      await expect(rebuildProjectionsWithReport(db,path)).rejects.toThrow("content identity"); expect(db.serialize().equals(before)).toBe(true);
      db.exec("DROP TRIGGER receipt_side_effect"); await rebuildProjectionsWithReport(db,path,undefined,"automatic");
      expect(JSON.parse(receipt(db)!).projectionState).toMatch(/^v1:[a-f0-9]{64}$/);
    });
  });
  it("rolls back receipt-trigger FTS corruption and permits a clean retry", async () => {
    await fixture(async (db,path) => {
      await rebuildProjectionsWithReport(db,path);
      db.exec("CREATE TRIGGER receipt_index_effect AFTER UPDATE ON projection_replay_state BEGIN INSERT INTO facts_fts(facts_fts) VALUES('delete-all'); END");
      const before=db.serialize(); await corpus(path,"new",true);
      await expect(rebuildProjectionsWithReport(db,path)).rejects.toThrow();
      expect(db.serialize().equals(before)).toBe(true);
      db.exec("DROP TRIGGER receipt_index_effect"); await rebuildProjectionsWithReport(db,path,undefined,"automatic");
      using search=db.prepare<{ n: number }, []>("SELECT COUNT(*) AS n FROM facts_fts WHERE facts_fts MATCH 'newneedle'");
      expect(search.get()!.n).toBe(1);
    });
  });
});
