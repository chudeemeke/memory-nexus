import { describe, expect, it } from "bun:test";
import type { Statement } from "bun:sqlite";
import { OwnedDatabase } from "../../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../../src/infrastructure/database/schema.js";
import { SqliteGraphRepository } from "../../../../src/infrastructure/database/repositories/graph-repository.js";
import { SqlitePersonaRepository } from "../../../../src/infrastructure/database/repositories/persona-repository.js";
import { GraphEdge } from "../../../../src/domain/entities/graph-edge.js";
import { PersonaEntry } from "../../../../src/domain/entities/persona-entry.js";

async function withFixture(run: (db: OwnedDatabase, released: (count: number) => void) => Promise<void>): Promise<void> {
  const db = new OwnedDatabase(":memory:");
  try {
    createSchema(db); db.finalizeStatements(); db.transaction(() => {})();
    const statements: Statement[] = [], prepare = db.prepare.bind(db);
    db.prepare = ((...args: Parameters<typeof db.prepare>) => {
      const statement = Reflect.apply(prepare, db, args) as Statement;
      statements.push(statement); return statement;
    }) as typeof db.prepare;
    await run(db, count => {
      expect(statements).toHaveLength(count);
      for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
      statements.length = 0;
    });
  } finally { db.close(); }
}
const timestamp = new Date("2026-01-01T00:00:00Z");
function edge(edgeId = "one", why = "Synthetic relation"): GraphEdge {
  return GraphEdge.create({ edgeId, source: { type: "tool", id: "source", label: "Source" }, target: { type: "project", id: "target", label: "Target" },
    relationship: "supports", project: "synthetic", visibility: "project", sourceEventIds: ["event"], sourceKinds: ["decision"], confidence: 0.9,
    validFrom: timestamp, why, metadata: { synthetic: true }, createdAt: timestamp, updatedAt: timestamp });
}
function persona(entryId = "one", content = "Synthetic preference"): PersonaEntry {
  return PersonaEntry.create({ entryId, kind: "preference", content, project: "synthetic", visibility: "project", sourceEventIds: ["event"], sourceKinds: ["preference"], confidence: 0.9,
    scope: { project: "synthetic", visibility: "project" }, reviewStatus: "reviewed", reviewAfter: timestamp, why: "Synthetic source", createdAt: timestamp, updatedAt: timestamp });
}

describe("graph/persona repository statement lifetime", () => {
  it("releases graph upserts, batch work, filtering and deletion across repeated owners", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const repo = new SqliteGraphRepository(db);
        expect((await repo.save(edge())).edgeId).toBe("one"); released(2);
        expect((await repo.saveMany([edge(), edge("two")])).map(row => row.edgeId)).toEqual(["one", "two"]); released(4);
        expect((await repo.findByEdgeId("one"))?.metadata).toEqual({ synthetic: true }); released(1);
        expect(await repo.findByEdgeId("absent")).toBeNull(); released(1);
        expect(await repo.findCurrent({ project: "synthetic", nodeId: "source", relationship: "supports", limit: 2, asOf: timestamp })).toHaveLength(2); released(1);
        expect(await repo.pruneStale(timestamp)).toBe(0); released(1);
        await repo.deleteByProject("other"); released(1);
        await repo.clearAll(); released(1);
        expect(await repo.findCurrent()).toEqual([]); released(1);
        expect(await repo.saveMany([])).toEqual([]); released(0);
      }
    });
  });

  it("releases persona upserts, batches, scope filters and deletion across repeated owners", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const repo = new SqlitePersonaRepository(db);
        expect((await repo.save(persona())).entryId).toBe("one"); released(2);
        expect((await repo.saveMany([persona(), persona("two")])).map(row => row.entryId)).toEqual(["one", "two"]); released(4);
        expect((await repo.findByEntryId("one"))?.content).toBe("Synthetic preference"); released(1);
        expect(await repo.findByEntryId("absent")).toBeNull(); released(1);
        expect(await repo.findAll({ project: "synthetic", kind: "preference", visibility: "project", limit: 2 })).toHaveLength(2); released(1);
        expect(await repo.findForContext("synthetic")).toHaveLength(2); released(1);
        expect(await repo.findForContext("other", { includeGlobal: false })).toEqual([]); released(1);
        await repo.deleteByProject("other"); released(1);
        await repo.clearAll(); released(1);
        expect(await repo.findAll()).toEqual([]); released(1);
        expect(await repo.saveMany([])).toEqual([]); released(0);
      }
    });
  });

  it("rejects a graph save whose written row is absent", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteGraphRepository(db);
      db.exec(`CREATE TRIGGER remove_graph AFTER INSERT ON graph_edges
        BEGIN DELETE FROM graph_edges WHERE id = NEW.id; END;`);
      await expect(repo.save(edge())).rejects.toThrow("Graph edge was not present after save"); released(2);
      expect(await repo.findByEdgeId("one")).toBeNull(); released(1);
    });
  });

  it("rejects a persona save whose written row is absent", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqlitePersonaRepository(db);
      db.exec(`CREATE TRIGGER remove_persona AFTER INSERT ON persona_entries
        BEGIN DELETE FROM persona_entries WHERE id = NEW.id; END;`);
      await expect(repo.save(persona())).rejects.toThrow("Persona entry was not present after save"); released(2);
      expect(await repo.findByEntryId("one")).toBeNull(); released(1);
    });
  });

  it("preserves graph duplicate-ID results and rolls back a batch with a missing result", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteGraphRepository(db);
      expect((await repo.saveMany([edge("one", "First"), edge("one", "Last")])).map(row => row.why)).toEqual(["Last", "Last"]); released(4);
      db.exec(`CREATE TRIGGER remove_graph AFTER INSERT ON graph_edges WHEN NEW.edge_id = 'missing'
        BEGIN DELETE FROM graph_edges WHERE id = NEW.id; END;`);
      await expect(repo.saveMany([edge("one", "Must roll back"), edge("missing")])).rejects.toThrow("Graph edge was not present after batch save"); released(4);
      expect((await repo.findByEdgeId("one"))?.why).toBe("Last"); released(1);
      expect(await repo.findByEdgeId("missing")).toBeNull(); released(1);
      db.exec("DROP TRIGGER remove_graph");
      expect(await repo.saveMany([edge("one", "Retry"), edge("missing")])).toHaveLength(2); released(4);
    });
  });

  it("preserves persona duplicate-ID results and rolls back a batch with a missing result", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqlitePersonaRepository(db);
      expect((await repo.saveMany([persona("one", "First"), persona("one", "Last")])).map(row => row.content)).toEqual(["Last", "Last"]); released(4);
      db.exec(`CREATE TRIGGER remove_persona AFTER INSERT ON persona_entries WHEN NEW.entry_id = 'missing'
        BEGIN DELETE FROM persona_entries WHERE id = NEW.id; END;`);
      await expect(repo.saveMany([persona("one", "Must roll back"), persona("missing")])).rejects.toThrow("Persona entry was not present after batch save"); released(4);
      expect((await repo.findByEntryId("one"))?.content).toBe("Last"); released(1);
      expect(await repo.findByEntryId("missing")).toBeNull(); released(1);
      db.exec("DROP TRIGGER remove_persona");
      expect(await repo.saveMany([persona("one", "Retry"), persona("missing")])).toHaveLength(2); released(4);
    });
  });

  it("rolls back rejected or unreadable graph batches and releases failing reads/deletes", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteGraphRepository(db);
      await repo.save(edge("one", "Original")); released(2);
      db.exec(`CREATE TRIGGER reject_graph BEFORE INSERT ON graph_edges WHEN NEW.edge_id = 'bad'
        BEGIN SELECT RAISE(ABORT, 'synthetic rejection'); END;`);
      await expect(repo.save(edge("bad"))).rejects.toThrow("synthetic rejection"); released(1);
      await expect(repo.saveMany([edge("one", "Changed"), edge("bad")])).rejects.toThrow("synthetic rejection"); released(2);
      expect((await repo.findByEdgeId("one"))?.why).toBe("Original"); released(1);
      db.exec(`DROP TRIGGER reject_graph;
        CREATE TRIGGER corrupt_graph AFTER INSERT ON graph_edges WHEN NEW.edge_id = 'bad'
        BEGIN UPDATE graph_edges SET source_event_ids = 'invalid json' WHERE id = NEW.id; END;`);
      await expect(repo.saveMany([edge("one", "Changed"), edge("bad")])).rejects.toThrow(); released(4);
      expect((await repo.findByEdgeId("one"))?.why).toBe("Original"); released(1);
      expect(await repo.findByEdgeId("bad")).toBeNull(); released(1);
      db.exec("DROP TRIGGER corrupt_graph");
      expect(await repo.saveMany([edge("one", "Retry"), edge("bad")])).toHaveLength(2); released(4);
      db.exec("UPDATE graph_edges SET source_event_ids = 'invalid json' WHERE edge_id = 'bad'");
      await expect(repo.findByEdgeId("bad")).rejects.toThrow(); released(1);
      await expect(repo.findCurrent({ project: "synthetic", includeGlobal: false })).rejects.toThrow(); released(1);
      db.exec(`UPDATE graph_edges SET source_event_ids = '["event"]', valid_from = '2024-01-01T00:00:00.000Z', valid_to = '2025-01-01T00:00:00.000Z';
        CREATE TRIGGER reject_delete_graph BEFORE DELETE ON graph_edges
        BEGIN SELECT RAISE(ABORT, 'synthetic delete rejection'); END;`);
      await expect(repo.pruneStale(timestamp)).rejects.toThrow("synthetic delete rejection"); released(1);
      await expect(repo.deleteByProject("synthetic")).rejects.toThrow("synthetic delete rejection"); released(1);
      await expect(repo.clearAll()).rejects.toThrow("synthetic delete rejection"); released(1);
      expect((await repo.findByEdgeId("one"))?.why).toBe("Retry"); released(1);
      expect(await repo.findByEdgeId("bad")).not.toBeNull(); released(1);
      db.exec("DROP TRIGGER reject_delete_graph");
      expect(await repo.pruneStale(timestamp)).toBe(2); released(1);
      expect(await repo.findByEdgeId("one")).toBeNull(); released(1);
    });
  });

  it("rolls back rejected or unreadable persona batches and releases failing reads/deletes", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqlitePersonaRepository(db);
      await repo.save(persona("one", "Original")); released(2);
      db.exec(`CREATE TRIGGER reject_persona BEFORE INSERT ON persona_entries WHEN NEW.entry_id = 'bad'
        BEGIN SELECT RAISE(ABORT, 'synthetic rejection'); END;`);
      await expect(repo.save(persona("bad"))).rejects.toThrow("synthetic rejection"); released(1);
      await expect(repo.saveMany([persona("one", "Changed"), persona("bad")])).rejects.toThrow("synthetic rejection"); released(2);
      expect((await repo.findByEntryId("one"))?.content).toBe("Original"); released(1);
      db.exec(`DROP TRIGGER reject_persona;
        CREATE TRIGGER corrupt_persona AFTER INSERT ON persona_entries WHEN NEW.entry_id = 'bad'
        BEGIN UPDATE persona_entries SET source_event_ids = 'invalid json' WHERE id = NEW.id; END;`);
      await expect(repo.saveMany([persona("one", "Changed"), persona("bad")])).rejects.toThrow(); released(4);
      expect((await repo.findByEntryId("one"))?.content).toBe("Original"); released(1);
      expect(await repo.findByEntryId("bad")).toBeNull(); released(1);
      db.exec("DROP TRIGGER corrupt_persona");
      expect(await repo.saveMany([persona("one", "Retry"), persona("bad")])).toHaveLength(2); released(4);
      db.exec("UPDATE persona_entries SET source_event_ids = 'invalid json' WHERE entry_id = 'bad'");
      await expect(repo.findByEntryId("bad")).rejects.toThrow(); released(1);
      await expect(repo.findAll()).rejects.toThrow(); released(1);
      await expect(repo.findForContext("synthetic")).rejects.toThrow(); released(1);
      db.exec(`UPDATE persona_entries SET source_event_ids = '["event"]';
        CREATE TRIGGER reject_delete_persona BEFORE DELETE ON persona_entries
        BEGIN SELECT RAISE(ABORT, 'synthetic delete rejection'); END;`);
      await expect(repo.deleteByProject("synthetic")).rejects.toThrow("synthetic delete rejection"); released(1);
      await expect(repo.clearAll()).rejects.toThrow("synthetic delete rejection"); released(1);
      expect((await repo.findByEntryId("one"))?.content).toBe("Retry"); released(1);
      expect(await repo.findByEntryId("bad")).not.toBeNull(); released(1);
      db.exec("DROP TRIGGER reject_delete_persona");
      await repo.deleteByProject("synthetic"); released(1);
      expect(await repo.findByEntryId("one")).toBeNull(); released(1);
    });
  });
});
