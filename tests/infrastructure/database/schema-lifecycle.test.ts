import { describe, expect, it } from "bun:test";
import type { Statement } from "bun:sqlite";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";

const legacyTriggers = `
  DROP TRIGGER IF EXISTS sessions_fts_insert;
  DROP TRIGGER IF EXISTS sessions_fts_update;
  CREATE TRIGGER sessions_fts_update AFTER UPDATE OF summary ON sessions
  WHEN new.summary IS NOT NULL AND new.summary != '' BEGIN
    DELETE FROM sessions_fts WHERE session_id = old.id;
    INSERT INTO sessions_fts(session_id, summary) VALUES (new.id, new.summary);
  END;`;

async function withDatabase(run: (db: OwnedDatabase, released: () => void) => void): Promise<void> {
  const db = new OwnedDatabase(":memory:");
  try {
    db.transaction(() => {})();
    const statements: Statement[] = [], prepare = db.prepare.bind(db);
    db.prepare = ((...args: Parameters<typeof db.prepare>) => {
      const statement = Reflect.apply(prepare, db, args) as Statement;
      statements.push(statement); return statement;
    }) as typeof db.prepare;
    run(db, () => {
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
      statements.length = 0;
    });
  } finally { db.close(); }
}

function insert(db: OwnedDatabase, id: string, summary: string | null): void {
  db.run("INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time, summary) VALUES (?, 'synthetic', '/synthetic', 'Synthetic', '2026-01-01T00:00:00Z', ?)", [id, summary]);
}
function matches(db: OwnedDatabase, query: string): string[] {
  using statement = db.prepare<{ session_id: string }, [string]>("SELECT session_id FROM sessions_fts WHERE sessions_fts MATCH ? ORDER BY session_id");
  return statement.all(query).map(row => row.session_id);
}
function rows(db: OwnedDatabase, sql: string): unknown[] {
  using statement = db.prepare(sql);
  return statement.all();
}
function row(db: OwnedDatabase, sql: string): unknown {
  using statement = db.prepare(sql);
  return statement.get();
}

describe("schema statement lifetime and summary index migration", () => {
  it("reports a failed native FTS support probe and permits recovery", async () => {
    await withDatabase((db, released) => {
      // A real SQLite name collision makes the probe fail. Its existing public
      // error conflates probe failure with missing support; Q019 retains review.
      db.exec("CREATE TABLE _fts5_check (test TEXT)");
      expect(() => createSchema(db)).toThrow("FTS5 extension is not available");
      db.exec("DROP TABLE _fts5_check");
      createSchema(db); released();
    });
  });

  it("releases schema statements across fresh and repeated initialization", async () => {
    await withDatabase((db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) { createSchema(db); released(); }
    });
  });

  it("indexes inserts and replacements, removes cleared or deleted summary text", async () => {
    await withDatabase((db, released) => {
      createSchema(db);
      insert(db, "inserted", "initialneedle");
      expect(matches(db, "initialneedle")).toEqual(["inserted"]);
      db.run("UPDATE sessions SET summary = 'replacementneedle' WHERE id = 'inserted'");
      expect(matches(db, "initialneedle")).toEqual([]);
      expect(matches(db, "replacementneedle")).toEqual(["inserted"]);
      for (const summary of [null, ""]) {
        db.run("UPDATE sessions SET summary = 'clearneedle' WHERE id = 'inserted'");
        db.run("UPDATE sessions SET summary = ? WHERE id = 'inserted'", [summary]);
        expect(matches(db, "clearneedle")).toEqual([]);
      }
      insert(db, "null", null); insert(db, "empty", "");
      expect(rows(db, "SELECT * FROM sessions_fts")).toEqual([]);
      db.run("UPDATE sessions SET summary = 'deleteneedle' WHERE id = 'inserted'");
      db.run("DELETE FROM sessions WHERE id = 'inserted'");
      expect(matches(db, "deleteneedle")).toEqual([]); released();
    });
  });

  it("upgrades legacy triggers and reconciles stale, missing and duplicate index rows once", async () => {
    await withDatabase((db, released) => {
      createSchema(db); db.exec(legacyTriggers);
      insert(db, "missing", "missingneedle"); insert(db, "cleared", null);
      db.run("UPDATE sessions SET summary = 'staleneedle' WHERE id = 'cleared'");
      db.run("UPDATE sessions SET summary = NULL WHERE id = 'cleared'");
      db.run("INSERT INTO sessions_fts (session_id, summary) VALUES ('orphan', 'orphanneedle'), ('missing', 'wrongneedle'), ('missing', 'wrongneedle')");
      createSchema(db);
      expect(matches(db, "missingneedle")).toEqual(["missing"]);
      for (const query of ["staleneedle", "orphanneedle", "wrongneedle"]) expect(matches(db, query)).toEqual([]);
      const before = rows(db, "SELECT rowid, * FROM sessions_fts");
      createSchema(db); expect(rows(db, "SELECT rowid, * FROM sessions_fts")).toEqual(before);
      // Prove the subsequent call does not attempt a full rebuild.
      const exec = db.exec.bind(db);
      let rebuilds = 0;
      db.exec = ((sql: string) => { rebuilds += Number(sql.includes("DELETE FROM sessions_fts;")); return exec(sql); }) as typeof db.exec;
      try { createSchema(db); expect(rebuilds).toBe(0); } finally { db.exec = exec; }
      released();
    });
  });

  it("rolls back a failed legacy upgrade and supports retry", async () => {
    await withDatabase((db, released) => {
      createSchema(db); db.exec(legacyTriggers); insert(db, "old", "oldneedle");
      db.run("UPDATE sessions SET summary = 'legacyneedle' WHERE id = 'old'");
      const before = rows(db, "SELECT rowid, * FROM sessions_fts");
      const trigger = row(db, "SELECT sql FROM sqlite_master WHERE name = 'sessions_fts_update'");
      const exec = db.exec.bind(db);
      db.exec = ((sql: string) => {
        if (sql.trimStart().startsWith("INSERT INTO sessions_fts(session_id, summary)")) return exec("INSERT INTO nonexistent_synthetic_table VALUES (1)");
        return exec(sql);
      }) as typeof db.exec;
      try { expect(() => createSchema(db)).toThrow("nonexistent_synthetic_table"); } finally { db.exec = exec; }
      expect(db.inTransaction).toBe(false);
      expect(rows(db, "SELECT rowid, * FROM sessions_fts")).toEqual(before);
      expect(row(db, "SELECT sql FROM sqlite_master WHERE name = 'sessions_fts_update'")).toEqual(trigger);
      expect(row(db, "SELECT name FROM sqlite_master WHERE name = 'sessions_fts_insert'")).toBeNull();
      createSchema(db); expect(matches(db, "legacyneedle")).toEqual(["old"]); released();
    });
  });

  it("keeps schema upgrade inside an existing caller transaction", async () => {
    await withDatabase((db, released) => {
      createSchema(db); db.exec(legacyTriggers); insert(db, "source", "sourceneedle");
      db.exec("BEGIN");
      createSchema(db); expect(db.inTransaction).toBe(true);
      expect(matches(db, "sourceneedle")).toEqual(["source"]);
      db.exec("ROLLBACK");
      expect(matches(db, "sourceneedle")).toEqual([]);
      expect(row(db, "SELECT name FROM sqlite_master WHERE name = 'sessions_fts_insert'")).toBeNull();
      createSchema(db); expect(matches(db, "sourceneedle")).toEqual(["source"]); released();
    });
  });

  it("releases statements when schema reads fail and permits recovery", async () => {
    await withDatabase((db, released) => {
      createSchema(db); released();
      const prepare = db.prepare.bind(db);
      let target = "PRAGMA table_info(embedding_state)";
      db.prepare = ((...args: Parameters<typeof db.prepare>) => {
        if (args[0] === target) return prepare("SELECT abs(-9223372036854775808)");
        return Reflect.apply(prepare, db, args);
      }) as typeof db.prepare;
      try {
        expect(() => createSchema(db)).toThrow("integer overflow"); released();
        // The existing friction migration catch tolerates read errors. Lifetime
        // proof does not approve that migration failure policy (Q019).
        target = "PRAGMA table_info(friction_log)";
        createSchema(db); released();
      } finally { db.prepare = prepare; }
      createSchema(db); released();
    });
  });
});
