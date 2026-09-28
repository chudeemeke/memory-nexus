import type { Database, SQLQueryBindings } from "bun:sqlite";
import { OwnedDatabase } from "./owned-database.js";
import { FACTS_TABLE, PERSONA_ENTRIES_TABLE, GRAPH_EDGES_TABLE, DREAM_ENTRIES_TABLE,
  MEMORY_GOVERNANCE_TABLE, MEMORY_GOVERNANCE_EVENTS_TABLE } from "./schema.js";
import { assertProjectionSource, type ProjectionSourceSnapshot } from "./projection-source.js";

const projections = [
  { table: "facts", keys: ["uuid"] },
  { table: "persona_entries", keys: ["entry_id"] },
  { table: "graph_edges", keys: ["edge_id"] },
  { table: "dream_entries", keys: ["dream_id"] },
  { table: "memory_governance", keys: ["surface", "target_id"] },
  { table: "memory_governance_events", keys: ["event_id"] },
] as const;
type Row = Record<string, SQLQueryBindings>;
type Fence = readonly number[];
const quote = (identifier: string) => '"' + identifier.replaceAll('"', '""') + '"';

/** Connection-local signals; compare only on the same live connection. */
export function captureProjectionFence(db: Database): Fence {
  if (db.inTransaction) throw new Error("Projection rebuild cannot use a caller transaction");
  return readFence(db);
}

function readFence(db: Database): Fence {
  return ["SELECT total_changes() AS value", "PRAGMA main.data_version", "PRAGMA main.schema_version",
    "PRAGMA temp.schema_version", "PRAGMA foreign_keys", "PRAGMA recursive_triggers",
    "PRAGMA ignore_check_constraints"].map(sql => {
    using statement = db.prepare<Record<string, number>, []>(sql);
    const row = statement.get();
    const value = row && Object.values(row)[0];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new Error("Projection rebuild conflict fence unavailable");
    }
    return value;
  });
}

/** Only derived projection schemas; no unrelated corpus or extensions are copied. */
export function createProjectionStage(): OwnedDatabase {
  const db = new OwnedDatabase(":memory:");
  try {
    db.exec(FACTS_TABLE + PERSONA_ENTRIES_TABLE + GRAPH_EDGES_TABLE + DREAM_ENTRIES_TABLE +
      MEMORY_GOVERNANCE_TABLE + MEMORY_GOVERNANCE_EVENTS_TABLE);
    return db;
  } catch (error) {
    try { db.close(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Projection stage initialization and cleanup failed"); }
    throw error;
  }
}

function columns(db: Database, table: string): string[] {
  using statement = db.prepare<{ name: string }, []>(`PRAGMA main.table_info(${quote(table)})`);
  return statement.all().map(row => row.name);
}
function count(db: Database, table: string): number {
  using statement = db.prepare<{ count: number }, []>(`SELECT COUNT(*) AS count FROM main.${quote(table)}`);
  return statement.get()!.count;
}
function directChanges(db: Database): number {
  // Bun's run().changes includes trigger writes. SQLite changes() counts only
  // the direct statement, which is needed to detect ignored projection rows.
  using statement = db.prepare<{ count: number }, []>("SELECT changes() AS count");
  return statement.get()!.count;
}

/** No await is permitted between the conflict check, replacement and commit. */
export function promoteProjections(db: Database, stage: Database, fence: Fence, source: ProjectionSourceSnapshot): void {
  if (db.inTransaction) throw new Error("Projection rebuild cannot use a caller transaction");
  db.transaction(() => {
    const current = readFence(db);
    if (current.length !== fence.length || current.some((value, index) => value !== fence[index])) {
      throw new Error("Database changed during projection rebuild; retry with current state");
    }
    assertProjectionSource(source);
    const identities = new Map<string, Map<string, string>>();
    for (const { table, keys } of projections) {
      const names = columns(stage, table);
      if (JSON.stringify(names) !== JSON.stringify(columns(db, table))) {
        throw new Error(`Projection schema mismatch: ${table}`);
      }
      const hasId = names.includes("id");
      const previousIds = new Map<string, SQLQueryBindings>();
      if (hasId) {
        // Preserve 64-bit IDs without rounding through JavaScript numbers.
        using previous = db.prepare<Row, []>(`SELECT CAST(id AS TEXT) AS id,${keys.map(quote).join(",")} FROM main.${quote(table)}`);
        for (const row of previous.iterate()) previousIds.set(JSON.stringify(keys.map(key => row[key])), row.id!);
      }
      const expectedDeletes = count(db, table);
      db.run(`DELETE FROM main.${quote(table)}`);
      if (directChanges(db) !== expectedDeletes) {
        throw new Error(`Projection deletion incomplete: ${table}`);
      }
      using input = stage.prepare<Row, []>(`SELECT * FROM main.${quote(table)} ORDER BY rowid`);
      using insert = db.prepare(`INSERT INTO main.${quote(table)} (${names.map(quote).join(",")}) VALUES (${names.map(() => "?").join(",")})`);
      using lastId = db.prepare<{ id: string }, []>("SELECT CAST(last_insert_rowid() AS TEXT) AS id");
      const insertedIds = new Map<string, string>(); identities.set(table, insertedIds);
      for (const row of input.iterate()) {
        const values = names.map(name => name === "id" ? previousIds.get(JSON.stringify(keys.map(key => row[key]))) ?? null : row[name]!);
        insert.run(...values);
        if (directChanges(db) !== 1) throw new Error(`Projection insertion incomplete: ${table}`);
        if (hasId) insertedIds.set(JSON.stringify(keys.map(key => row[key])), lastId.get()!.id);
      }
    }
    // Detect ignored or trigger-altered writes before committing, including a later
    // projection trigger that modified an earlier table. Do not trust counts alone.
    for (const { table, keys } of projections) {
      if (count(db, table) !== count(stage, table)) throw new Error(`Projection row count mismatch: ${table}`);
      const names = columns(stage, table).filter(name => name !== "id");
      using input = stage.prepare<Row, []>(`SELECT * FROM main.${quote(table)}`);
      const identityColumn = identities.get(table)!.size > 0 ? ",CAST(id AS TEXT) AS _identity" : "";
      using actual = db.prepare<Row, SQLQueryBindings[]>(`SELECT *${identityColumn} FROM main.${quote(table)} WHERE ${keys.map(key => `${quote(key)}=?`).join(" AND ")}`);
      for (const row of input.iterate()) {
        const stored = actual.get(...keys.map(key => row[key]!));
        const expectedId = identities.get(table)!.get(JSON.stringify(keys.map(key => row[key])));
        if (!stored || (expectedId !== undefined && stored._identity !== expectedId) || names.some(name => stored[name] !== row[name])) {
          throw new Error(`Projection content mismatch: ${table}`);
        }
      }
    }
    // External-content FTS integrity check includes comparison with facts content.
    db.run("INSERT INTO main.facts_fts(facts_fts,rank) VALUES ('integrity-check',1)");
    const manifest = JSON.stringify(source.manifest);
    using receipt = db.prepare("INSERT INTO main.projection_replay_state(id,manifest) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET manifest=excluded.manifest");
    receipt.run(manifest);
    if (directChanges(db) !== 1) throw new Error("Projection source receipt was not committed");
    using verify = db.prepare<{ manifest: string }, []>("SELECT manifest FROM main.projection_replay_state WHERE id=1");
    if (verify.get()?.manifest !== manifest) throw new Error("Projection source receipt mismatch");
  }).immediate();
}
