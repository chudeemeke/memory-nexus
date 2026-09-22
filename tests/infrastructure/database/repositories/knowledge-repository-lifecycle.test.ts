import { describe, expect, it } from "bun:test";
import type { Statement } from "bun:sqlite";
import { OwnedDatabase } from "../../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../../src/infrastructure/database/schema.js";
import { SqliteDreamRepository } from "../../../../src/infrastructure/database/repositories/dream-repository.js";
import { SqliteFactRepository } from "../../../../src/infrastructure/database/repositories/fact-repository.js";
import { DreamEntry } from "../../../../src/domain/entities/dream-entry.js";
import { Fact } from "../../../../src/domain/entities/fact.js";

async function withFixture(run: (db: OwnedDatabase, released: (count: number) => void) => Promise<void>): Promise<void> {
  const db = new OwnedDatabase(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    createSchema(db);
    // Initialize connection-owned transaction controls before capturing queries.
    db.transaction(() => {})();
    const statements: Statement[] = [], prepare = db.prepare.bind(db);
    db.prepare = ((...args: Parameters<typeof db.prepare>) => {
      const statement = Reflect.apply(prepare, db, args) as Statement;
      statements.push(statement);
      return statement;
    }) as typeof db.prepare;
    await run(db, count => {
      expect(statements).toHaveLength(count);
      for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
      statements.length = 0;
    });
  } finally { db.close(); }
}

const observedAt = new Date("2026-01-01T00:00:00Z");
function dream(): DreamEntry {
  return DreamEntry.create({ dreamId: "synthetic-dream", kind: "supersedence_proposal", project: "synthetic",
    visibility: "project", sourceEventIds: ["source"], targetFactUuid: "old",
    proposedFact: { uuid: "replacement", type: "decision", project: "synthetic", content: "Synthetic proposal" },
    reason: "Synthetic newer decision", confidence: 0.9,
    audit: { redactionState: "none", reviewer: "test", redactedFields: [], findingHashes: [] },
    createdAt: observedAt, updatedAt: observedAt });
}
function fact(uuid: string, content: string): Fact {
  return Fact.create({ uuid, type: "decision", project: "synthetic", content, observedAt });
}

describe("knowledge repository statement lifetime", () => {
  it("releases dream writes, nested reads, filtered queries and deletion across repeated owners", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const repo = new SqliteDreamRepository(db);
        const saved = await repo.save(dream()); released(2);
        expect(saved.dreamId).toBe("synthetic-dream");
        expect((await repo.findByDreamId("synthetic-dream"))?.id).toBe(saved.id); released(1);
        expect(await repo.findByDreamId("missing")).toBeNull(); released(1);
        expect(await repo.findAll({ project: "synthetic", kind: "supersedence_proposal", status: saved.status, limit: 1 })).toHaveLength(1); released(1);
      }
      const repo = new SqliteDreamRepository(db);
      await repo.deleteByProject("unrelated"); released(1);
      expect(await repo.findAll()).toHaveLength(1); released(1);
      await repo.deleteByProject("synthetic"); released(1);
      expect(await repo.findAll()).toEqual([]); released(1);
      await repo.save(dream()); released(2);
      await repo.clearAll(); released(1);
      expect(await repo.findAll()).toEqual([]); released(1);
    });
  });

  it("releases dream statements on rejected writes/deletes and invalid stored data", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteDreamRepository(db);
      db.exec(`CREATE TRIGGER reject_dream BEFORE INSERT ON dream_entries
        BEGIN SELECT RAISE(ABORT, 'synthetic write rejection'); END;`);
      await expect(repo.save(dream())).rejects.toThrow("synthetic write rejection"); released(1);
      db.exec("DROP TRIGGER reject_dream");
      await repo.save(dream()); released(2);
      db.exec(`CREATE TRIGGER reject_delete BEFORE DELETE ON dream_entries
        BEGIN SELECT RAISE(ABORT, 'synthetic delete rejection'); END;`);
      await expect(repo.deleteByProject("synthetic")).rejects.toThrow("synthetic delete rejection"); released(1);
      await expect(repo.clearAll()).rejects.toThrow("synthetic delete rejection"); released(1);
      expect(await repo.findAll()).toHaveLength(1); released(1);
      db.exec(`UPDATE dream_entries SET source_event_ids = '{broken';`);
      await expect(repo.findByDreamId("synthetic-dream")).rejects.toThrow(); released(1);
      await expect(repo.findAll()).rejects.toThrow(); released(1);
      db.exec(`CREATE TRIGGER corrupt_dream AFTER UPDATE ON dream_entries
        BEGIN UPDATE dream_entries SET source_event_ids = '{broken' WHERE id = NEW.id; END;`);
      await expect(repo.save(dream())).rejects.toThrow(); released(2);
    });
  });

  it("rejects dream save when the written row is absent", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteDreamRepository(db);
      db.exec(`CREATE TRIGGER remove_dream AFTER INSERT ON dream_entries
        BEGIN DELETE FROM dream_entries WHERE id = NEW.id; END;`);
      await expect(repo.save(dream())).rejects.toThrow("Dream entry was not present after save"); released(2);
      expect(await repo.findByDreamId("synthetic-dream")).toBeNull(); released(1);
    });
  });

  it("round-trips global dream review, application and rollback state", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteDreamRepository(db);
      const global = DreamEntry.create({ ...dream().toParams(), project: undefined, visibility: "global" });
      const reviewedAt = new Date("2026-01-02T00:00:00Z"), appliedAt = new Date("2026-01-03T00:00:00Z"), rolledBackAt = new Date("2026-01-04T00:00:00Z");
      const rolledBack = global.approve("reviewer", reviewedAt).markApplied(["applied"], appliedAt).markRolledBack(["rollback"], rolledBackAt);
      const saved = await repo.save(rolledBack); released(2);
      expect(saved.project).toBeUndefined();
      expect(saved.status).toBe("rolled_back");
      expect(saved.reviewedAt).toEqual(reviewedAt);
      expect(saved.appliedAt).toEqual(appliedAt);
      expect(saved.rolledBackAt).toEqual(rolledBackAt);
      expect(saved.appliedEventIds).toEqual(["applied"]);
      expect(saved.rollbackEventIds).toEqual(["rollback"]);
      expect(saved.autoPromoted).toBe(false);
    });
  });

  it("rejects malformed stored audits and normalizes legacy omitted audit arrays", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteDreamRepository(db);
      await repo.save(dream()); released(2);
      db.exec(`UPDATE dream_entries SET audit = '[]';`);
      await expect(repo.findByDreamId("synthetic-dream")).rejects.toThrow("Dream audit must be an object"); released(1);
      db.exec(`UPDATE dream_entries SET audit = '{"redactionState":"none"}';`);
      await expect(repo.findByDreamId("synthetic-dream")).rejects.toThrow("reviewer"); released(1);
      db.exec(`UPDATE dream_entries SET audit = '{"redactionState":"none","reviewer":"legacy"}';`);
      expect((await repo.findByDreamId("synthetic-dream"))?.audit).toEqual({ redactionState: "none", reviewer: "legacy", redactedFields: [], findingHashes: [] }); released(1);
    });
  });

  it("releases fact insert/update, lookup, search and supersedence statements", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const repo = new SqliteFactRepository(db);
        const saved = await repo.save(fact("one", "Synthetic searchable decision")); released(2);
        expect((await repo.findById(saved.id!))?.uuid).toBe("one"); released(1);
        expect((await repo.findByUuid("one"))?.content).toBe("Synthetic searchable decision"); released(1);
        expect(await repo.findById(-1)).toBeNull(); released(1);
        expect(await repo.findByUuid("absent")).toBeNull(); released(1);
        expect(await repo.findByProject("synthetic")).toHaveLength(1); released(1);
        expect(await repo.findRecent(1)).toHaveLength(1); released(1);
        expect(await repo.search("searchable")).toHaveLength(1); released(1);
        await repo.supersede("one", observedAt, "replacement"); released(1);
        const superseded = (await repo.findAll())[0]!; released(1);
        expect(superseded.supersededBy).toBe("replacement");
        const savedSuperseded = await repo.save(superseded); released(2);
        expect(savedSuperseded.supersededAt).toEqual(observedAt);
      }
    });
  });

  it("releases fact batch statements and rolls back an earlier update when a later insert fails", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteFactRepository(db);
      await repo.saveMany([fact("one", "Original decision"), fact("two", "Second decision")]); released(4);
      await repo.saveMany([fact("one", "Updated decision"), fact("three", "Third decision")]); released(4);
      expect((await repo.findByUuid("one"))?.content).toBe("Updated decision"); released(1);
      db.exec(`CREATE TRIGGER reject_fact BEFORE INSERT ON facts WHEN NEW.uuid = 'reject'
        BEGIN SELECT RAISE(ABORT, 'synthetic fact rejection'); END;`);
      await expect(repo.saveMany([fact("one", "Must roll back"), fact("reject", "Rejected decision")])).rejects.toThrow("synthetic fact rejection"); released(4);
      expect((await repo.findByUuid("one"))?.content).toBe("Updated decision"); released(1);
      expect(await repo.findByUuid("reject")).toBeNull(); released(1);
      db.exec("DROP TRIGGER reject_fact");
      await repo.saveMany([fact("one", "Retry decision"), fact("reject", "Retry insert")]); released(4);
      expect((await repo.findByUuid("one"))?.content).toBe("Retry decision"); released(1);
      expect(await repo.findAll()).toHaveLength(4); released(1);
      expect(await repo.saveMany([])).toEqual([]); released(0);
    });
  });

  it("releases fact statements on native write/search and stored-data decoding failures", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteFactRepository(db);
      db.exec(`CREATE TRIGGER reject_insert BEFORE INSERT ON facts
        BEGIN SELECT RAISE(ABORT, 'synthetic insert rejection'); END;`);
      await expect(repo.save(fact("one", "Rejected"))).rejects.toThrow("synthetic insert rejection"); released(2);
      db.exec("DROP TRIGGER reject_insert");
      const saved = await repo.save(fact("one", "Synthetic searchable decision")); released(2);
      db.exec(`CREATE TRIGGER reject_update BEFORE UPDATE ON facts
        BEGIN SELECT RAISE(ABORT, 'synthetic update rejection'); END;`);
      await expect(repo.save(fact("one", "Rejected update"))).rejects.toThrow("synthetic update rejection"); released(2);
      await expect(repo.superseded("one", observedAt, "replacement")).rejects.toThrow("synthetic update rejection"); released(1);
      await expect(repo.saveMany([fact("one", "Rejected batch update")])).rejects.toThrow("synthetic update rejection"); released(2);
      await expect(repo.search('"')).rejects.toThrow(); released(1);
      db.exec("DROP TRIGGER reject_update; UPDATE facts SET metadata = '{broken';");
      await expect(repo.findById(saved.id!)).rejects.toThrow(); released(1);
      await expect(repo.findByUuid("one")).rejects.toThrow(); released(1);
      await expect(repo.findByProject("synthetic")).rejects.toThrow(); released(1);
      await expect(repo.findRecent(1)).rejects.toThrow(); released(1);
      await expect(repo.findAll()).rejects.toThrow(); released(1);
      await expect(repo.search("searchable")).rejects.toThrow(); released(1);
    });
  });
});
