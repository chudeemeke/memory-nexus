import { describe, expect, it } from "bun:test";
import type { Statement } from "bun:sqlite";
import { OwnedDatabase } from "../../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../../src/infrastructure/database/schema.js";
import { SqliteMemoryFileRepository } from "../../../../src/infrastructure/database/repositories/memory-file-repository.js";
import { SqliteMemoryGovernanceRepository } from "../../../../src/infrastructure/database/repositories/memory-governance-repository.js";
import { MemoryFile } from "../../../../src/domain/entities/memory-file.js";
import { MemoryGovernanceEntry } from "../../../../src/domain/entities/memory-governance.js";
import { MemoryEventEnvelope } from "../../../../src/domain/entities/memory-event.js";

async function withFixture(run: (db: OwnedDatabase, released: (count: number) => void) => Promise<void>): Promise<void> {
  const db = new OwnedDatabase(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    createSchema(db);
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

const timestamp = new Date("2026-01-01T00:00:00Z");
function file(filePath: string, content = "Synthetic searchable learning. Applies to: cross-project"): MemoryFile {
  return MemoryFile.create({ filePath, fileType: "learnings", projectEncoded: "synthetic", content, contentHash: "a".repeat(64), lastIndexedAt: timestamp });
}
function governance(): MemoryGovernanceEntry {
  return MemoryGovernanceEntry.create({ surface: "fact", targetId: "synthetic-fact", project: "synthetic", visibility: "project",
    sourceEventIds: ["source"], transformationMethod: "synthetic", actor: "test", confidence: 1,
    redactionState: "none", consentStatus: "granted", consentScopes: ["local-memory"],
    scope: { project: "synthetic", visibility: "project" }, createdAt: timestamp, updatedAt: timestamp });
}
function event(control: string, values: Record<string, unknown> = {}): MemoryEventEnvelope {
  return MemoryEventEnvelope.create({ eventId: `event-${control}`, machineId: "synthetic", sequence: 1, kind: "governance", operation: "update",
    occurredAt: timestamp, observedAt: timestamp, scope: { project: "synthetic", visibility: "project" },
    provenance: { source: "test", actor: "test", method: "synthetic", sourceIds: ["source"] },
    privacy: { redactionState: "none", containsSensitiveContent: false }, consent: { status: "not_required", scopes: [] },
    causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
    payload: { governance: { control, surface: "fact", targetId: "synthetic-fact", ...values } } });
}

describe("memory file and governance statement lifetime", () => {
  it("releases file upserts and every lookup across repeated repository owners", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const repo = new SqliteMemoryFileRepository(db);
        await repo.save(file("synthetic.md")); released(1);
        expect((await repo.findByPath("synthetic.md"))?.content).toContain("searchable"); released(1);
        expect(await repo.findByPath("missing.md")).toBeNull(); released(1);
        expect(await repo.findByType("learnings")).toHaveLength(1); released(1);
        expect(await repo.findByProject("synthetic")).toHaveLength(1); released(1);
        expect(await repo.searchContent("searchable")).toHaveLength(1); released(1);
        expect(await repo.searchContent("")).toEqual([]); released(0);
        expect(await repo.findCrossProjectLearnings()).toHaveLength(1); released(1);
        expect(await repo.findCrossProjectLearnings("other")).toHaveLength(1); released(1);
        expect(await repo.findCrossProjectLearnings("synthetic")).toEqual([]); released(1);
      }
    });
  });

  it("releases the reused batch statement and preserves earlier content on a later failure", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteMemoryFileRepository(db);
      await repo.saveMany([file("one.md", "Original content"), file("two.md")]); released(1);
      db.exec(`CREATE TRIGGER reject_file BEFORE INSERT ON memory_files WHEN NEW.file_path = 'reject.md'
        BEGIN SELECT RAISE(ABORT, 'synthetic file rejection'); END;`);
      await expect(repo.saveMany([file("one.md", "Must roll back"), file("reject.md")])).rejects.toThrow("synthetic file rejection"); released(1);
      expect((await repo.findByPath("one.md"))?.content).toBe("Original content"); released(1);
      expect(await repo.findByPath("reject.md")).toBeNull(); released(1);
      await expect(repo.save(file("reject.md"))).rejects.toThrow("synthetic file rejection"); released(1);
      db.exec("DROP TRIGGER reject_file");
      await repo.saveMany([file("one.md", "Retry content"), file("reject.md")]); released(1);
      expect((await repo.findByPath("one.md"))?.content).toBe("Retry content"); released(1);
      await repo.saveMany([]); released(1);
    });
  });

  it("releases file reads when stored rows fail domain validation", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteMemoryFileRepository(db);
      await repo.save(file("one.md")); released(1);
      db.exec("UPDATE memory_files SET content_hash = 'invalid'");
      await expect(repo.findByPath("one.md")).rejects.toThrow("Content hash"); released(1);
      await expect(repo.findByType("learnings")).rejects.toThrow("Content hash"); released(1);
      await expect(repo.findByProject("synthetic")).rejects.toThrow("Content hash"); released(1);
      await expect(repo.searchContent("searchable")).rejects.toThrow("Content hash"); released(1);
      await expect(repo.findCrossProjectLearnings()).rejects.toThrow("Content hash"); released(1);
      await expect(repo.findCrossProjectLearnings("other")).rejects.toThrow("Content hash"); released(1);
    });
  });

  it("releases governance upserts, lookups and audit writes across repeated calls", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const repo = new SqliteMemoryGovernanceRepository(db);
        expect((await repo.save(governance())).targetId).toBe("synthetic-fact"); released(2);
        expect((await repo.findByTarget("fact", "synthetic-fact"))?.consentStatus).toBe("granted"); released(1);
        expect(await repo.findByTarget("fact", "missing")).toBeNull(); released(1);
        expect(await repo.findByTargetIds("fact", [])).toEqual([]); released(0);
        expect(await repo.findByTargetIds("fact", ["synthetic-fact", "missing"])).toHaveLength(1); released(1);
        expect(await repo.findAll({ surface: "fact", targetId: "synthetic-fact", project: "synthetic", status: "active", limit: 1 })).toHaveLength(1); released(1);
        expect((await repo.applyMemoryEvent(event("suppress")))?.status).toBe("suppressed"); released(4);
      }
      const repo = new SqliteMemoryGovernanceRepository(db);
      using audit = db.prepare("SELECT COUNT(*) AS count FROM memory_governance_events");
      expect(audit.get()).toEqual({ count: 1 });
      expect(await repo.findAll()).toHaveLength(1);
    });
  });

  it("releases governance queries after write, audit and stored-data failures", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteMemoryGovernanceRepository(db);
      db.exec(`CREATE TRIGGER reject_governance BEFORE INSERT ON memory_governance
        BEGIN SELECT RAISE(ABORT, 'synthetic governance rejection'); END;`);
      await expect(repo.save(governance())).rejects.toThrow("synthetic governance rejection"); released(1);
      db.exec("DROP TRIGGER reject_governance");
      await repo.save(governance()); released(2);
      db.exec(`CREATE TRIGGER reject_audit BEFORE INSERT ON memory_governance_events
        BEGIN SELECT RAISE(ABORT, 'synthetic audit rejection'); END;`);
      await expect(repo.applyMemoryEvent(event("suppress"))).rejects.toThrow("synthetic audit rejection"); released(1);
      expect((await repo.findByTarget("fact", "synthetic-fact"))?.status).toBe("active"); released(1);
      db.exec("DROP TRIGGER reject_audit; UPDATE memory_governance SET source_event_ids = '{broken';");
      await expect(repo.findByTarget("fact", "synthetic-fact")).rejects.toThrow(); released(1);
      await expect(repo.findByTargetIds("fact", ["synthetic-fact"])).rejects.toThrow(); released(1);
      await expect(repo.findAll()).rejects.toThrow(); released(1);
      db.exec(`CREATE TRIGGER corrupt_governance AFTER UPDATE ON memory_governance
        BEGIN UPDATE memory_governance SET source_event_ids = '{broken' WHERE id = NEW.id; END;`);
      await expect(repo.save(governance())).rejects.toThrow(); released(2);
    });
  });

  it("rejects governance save when the written row is absent", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteMemoryGovernanceRepository(db);
      db.exec(`CREATE TRIGGER remove_governance AFTER INSERT ON memory_governance
        BEGIN DELETE FROM memory_governance WHERE id = NEW.id; END;`);
      await expect(repo.save(governance())).rejects.toThrow("Governance entry was not present after save"); released(2);
      expect(await repo.findByTarget("fact", "synthetic-fact")).toBeNull(); released(1);
    });
  });

  it("rolls back the audit when projection persistence fails and retries cleanly", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteMemoryGovernanceRepository(db);
      await repo.save(governance()); released(2);
      db.exec(`CREATE TRIGGER reject_projection BEFORE INSERT ON memory_governance
        BEGIN SELECT RAISE(ABORT, 'synthetic projection rejection'); END;`);
      await expect(repo.applyMemoryEvent(event("suppress"))).rejects.toThrow("synthetic projection rejection"); released(3);
      {
        using audit = db.prepare("SELECT COUNT(*) AS count FROM memory_governance_events");
        expect(audit.get()).toEqual({ count: 0 });
      }
      released(1);
      expect((await repo.findByTarget("fact", "synthetic-fact"))?.status).toBe("active"); released(1);
      db.exec("DROP TRIGGER reject_projection");
      expect((await repo.applyMemoryEvent(event("suppress")))?.status).toBe("suppressed"); released(4);
      using audit = db.prepare("SELECT COUNT(*) AS count FROM memory_governance_events");
      expect(audit.get()).toEqual({ count: 1 });
    });
  });

  it("rolls back audit insertion when register payload validation fails", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteMemoryGovernanceRepository(db);
      await expect(repo.applyMemoryEvent(event("register", { confidence: -1 }))).rejects.toThrow("confidence"); released(1);
      {
        using audit = db.prepare("SELECT COUNT(*) AS count FROM memory_governance_events");
        expect(audit.get()).toEqual({ count: 0 });
      }
      released(1);
      expect(await repo.findByTarget("fact", "synthetic-fact")).toBeNull(); released(1);
      expect((await repo.applyMemoryEvent(event("register")))?.status).toBe("active"); released(3);
    });
  });

  it("preserves audit and projection when clear fails on its second delete", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteMemoryGovernanceRepository(db);
      await repo.applyMemoryEvent(event("register")); released(3);
      db.exec(`CREATE TRIGGER reject_clear BEFORE DELETE ON memory_governance
        BEGIN SELECT RAISE(ABORT, 'synthetic clear rejection'); END;`);
      await expect(repo.clearAll()).rejects.toThrow("synthetic clear rejection"); released(0);
      {
        using audit = db.prepare("SELECT COUNT(*) AS count FROM memory_governance_events");
        expect(audit.get()).toEqual({ count: 1 });
      }
      released(1);
      expect(await repo.findAll()).toHaveLength(1); released(1);
      db.exec("DROP TRIGGER reject_clear");
      await repo.clearAll(); released(0);
      expect(await repo.findAll()).toEqual([]); released(1);
      using audit = db.prepare("SELECT COUNT(*) AS count FROM memory_governance_events");
      expect(audit.get()).toEqual({ count: 0 });
    });
  });
});
