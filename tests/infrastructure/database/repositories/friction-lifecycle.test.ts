import { describe, expect, it, setSystemTime } from "bun:test";
import type { Statement } from "bun:sqlite";
import { OwnedDatabase } from "../../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../../src/infrastructure/database/schema.js";
import { SqliteFrictionRepository } from "../../../../src/infrastructure/database/repositories/friction-repository.js";
import { FrictionEntry } from "../../../../src/domain/entities/friction-entry.js";

async function withFixture(run: (db: OwnedDatabase, repo: SqliteFrictionRepository, released: (count: number) => void) => Promise<void>): Promise<void> {
  const db = new OwnedDatabase(":memory:");
  try {
    createSchema(db);
    const statements = new Set<Statement>(), prepare = db.prepare.bind(db), query = db.query.bind(db);
    db.prepare = ((...args: Parameters<typeof db.prepare>) => {
      const statement = Reflect.apply(prepare, db, args) as Statement;
      statements.add(statement); return statement;
    }) as typeof db.prepare;
    db.query = ((...args: Parameters<typeof db.query>) => {
      const statement = Reflect.apply(query, db, args) as Statement;
      statements.add(statement); return statement;
    }) as typeof db.query;
    await run(db, new SqliteFrictionRepository(db), count => {
      expect(statements.size).toBe(count);
      for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
      statements.clear();
    });
  } finally { db.close(); }
}

function entry(description = "Synthetic friction", loggedAt = new Date(), tags?: string[]): FrictionEntry {
  return FrictionEntry.create({ description, severity: "high", category: "cli", tool: "synthetic", status: "open", sourceProject: "synthetic", loggedAt, tags });
}

describe("friction repository statement lifetime", () => {
  it("releases CRUD and filtered query statements across repeated calls", async () => {
    await withFixture(async (_db, repo, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const saved = await repo.save(entry("Synthetic friction", new Date(), ["synthetic"])); released(1);
        const stored = await repo.findById(saved.id!); released(1);
        expect(stored?.description).toBe("Synthetic friction");
        expect(stored?.tags).toEqual(["synthetic"]);
        expect(await repo.findById(-1)).toBeNull(); released(1);
        expect(await repo.findOpen()).toHaveLength(1); released(1);
        expect(await repo.findAll({ status: "open", category: "cli", tool: "synthetic", sourceProject: "synthetic", limit: 1 })).toHaveLength(1); released(1);
        const found = await repo.query({ status: "open", descriptionContains: "Synthetic", limit: 1 }); released(2);
        expect(found.totalCount).toBe(1); expect(found.entries).toHaveLength(1);
        await repo.updateStatus(saved.id!, "wont-fix"); released(1);
        await repo.resolve(saved.id!, "Synthetic resolution"); released(1);
        expect((await repo.findById(saved.id!))?.resolution).toBe("Synthetic resolution"); released(1);
      }
      await expect(repo.resolve(-1, "missing")).rejects.toThrow("not found"); released(1);
      await expect(repo.updateStatus(-1, "open")).rejects.toThrow("not found"); released(1);
    });
  });

  it("releases stats, trends, pattern lookups and review writes", async () => {
    await withFixture(async (_db, repo, released) => {
      expect((await repo.getStats()).total).toBe(0); released(5);
      await repo.save(entry("Synthetic first")); released(1);
      await repo.save(entry("Synthetic second")); released(1);
      expect(await repo.getStats()).toMatchObject({ total: 2, open: 2, byTool: { synthetic: 2 }, bySeverity: { high: 2 } }); released(5);
      expect(await repo.getWeeklyTrends(2)).toHaveLength(2); released(2);
      const patterns = await repo.findPatterns(2); released(2);
      expect(patterns).toHaveLength(1); expect(patterns[0]?.entries).toHaveLength(2);
      expect(await repo.findPatterns(3)).toEqual([]); released(1);
      const reviewedAt = new Date("2026-01-01T00:00:00Z");
      await repo.markReviewed("synthetic", reviewedAt); released(1);
      expect((await repo.findOpen()).every(row => row.lastReviewedAt?.getTime() === reviewedAt.getTime())).toBe(true); released(1);
    });
  });

  it("returns the exact deletion count and releases resources without a follow-up query", async () => {
    await withFixture(async (db, repo, released) => {
      await repo.save(entry("remove first")); released(1);
      await repo.save(entry("remove second")); released(1);
      await repo.save(entry("retain third")); released(1);
      expect(await repo.deleteByPattern("remove%")).toBe(2); released(1);
      expect(await repo.deleteByPattern("remove%")).toBe(0); released(1);
      expect((await repo.findAll()).map(row => row.description)).toEqual(["retain third"]); released(1);
      db.exec(`CREATE TRIGGER reject_delete BEFORE DELETE ON friction_log
        BEGIN SELECT RAISE(ABORT, 'synthetic delete rejection'); END;`);
      await expect(repo.deleteByPattern("%")).rejects.toThrow("synthetic delete rejection"); released(1);
      expect(await repo.findAll()).toHaveLength(1); released(1);
    });
  });

  it("releases statements after native write failures and corrupt stored rows", async () => {
    await withFixture(async (db, repo, released) => {
      db.exec(`CREATE TRIGGER reject_insert BEFORE INSERT ON friction_log
        BEGIN SELECT RAISE(ABORT, 'synthetic insert rejection'); END;`);
      await expect(repo.save(entry())).rejects.toThrow("synthetic insert rejection"); released(1);
      db.exec("DROP TRIGGER reject_insert");
      const saved = await repo.save(entry()); released(1);
      db.exec(`CREATE TRIGGER reject_update BEFORE UPDATE ON friction_log
        BEGIN SELECT RAISE(ABORT, 'synthetic update rejection'); END;`);
      await expect(repo.resolve(saved.id!, "rejected")).rejects.toThrow("synthetic update rejection"); released(1);
      await expect(repo.updateStatus(saved.id!, "wont-fix")).rejects.toThrow("synthetic update rejection"); released(1);
      await expect(repo.markReviewed("synthetic", new Date())).rejects.toThrow("synthetic update rejection"); released(1);
      expect((await repo.findById(saved.id!))?.status).toBe("open"); released(1);
      db.exec("DROP TRIGGER reject_update; UPDATE friction_log SET tags = '{broken';");
      await expect(repo.findById(saved.id!)).rejects.toThrow(); released(1);
      await expect(repo.findOpen()).rejects.toThrow(); released(1);
      await expect(repo.findAll()).rejects.toThrow(); released(1);
      await expect(repo.query()).rejects.toThrow(); released(2);
      await expect(repo.findPatterns(1)).rejects.toThrow(); released(2);
    });
  });

  it("releases earlier statistics queries when later native preparation fails", async () => {
    await withFixture(async (db, repo, released) => {
      db.exec("ALTER TABLE friction_log RENAME COLUMN severity TO invalid_severity");
      await expect(repo.getStats()).rejects.toThrow("severity"); released(1);
    });
  });

  it("places current entries in the SQLite UTC week across year and Monday boundaries", async () => {
    try {
      for (const instant of ["2026-09-21T12:00:00Z", "2026-01-01T00:30:00Z", "2026-01-05T12:00:00Z", "2025-12-31T23:30:00Z", "2026-09-20T23:30:00Z", "2024-01-01T12:00:00Z", "2023-01-01T12:00:00Z"]) {
        const now = new Date(instant);
        setSystemTime(now);
        await withFixture(async (db, repo, released) => {
          const previous = new Date(now.getTime() - 7 * 86400000);
          await repo.save(entry("Previous week", previous)); released(1);
          const saved = await repo.save(entry()); released(1);
          await repo.resolve(saved.id!, "Synthetic resolution"); released(1);
          const trends = await repo.getWeeklyTrends(2); released(2);
          using expected = db.query("SELECT strftime('%Y-W%W', ?) AS week");
          const previousRow = expected.get(previous.toISOString()) as { week: string };
          const row = expected.get(now.toISOString()) as { week: string };
          expect(trends).toEqual([{ week: previousRow.week, newCount: 1, resolvedCount: 0 }, { week: row.week, newCount: 1, resolvedCount: 1 }]);
        });
      }
    } finally { setSystemTime(); }
  });
});
