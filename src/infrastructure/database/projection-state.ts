import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";

export const PROJECTION_TABLES = [
  { table: "facts", keys: ["uuid"] },
  { table: "persona_entries", keys: ["entry_id"] },
  { table: "graph_edges", keys: ["edge_id"] },
  { table: "dream_entries", keys: ["dream_id"] },
  { table: "memory_governance", keys: ["surface", "target_id"] },
  { table: "memory_governance_events", keys: ["event_id"] },
] as const;
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';

/** Stable content identity, not a claim of FTS/vector health or source authority. */
export function projectionContentIdentity(db: Database): { hash: string; empty: boolean } {
  return db.transaction(() => {
    const hash = createHash("sha256"); let empty = true;
    for (const { table } of PROJECTION_TABLES) {
      using schema = db.prepare<{ name: string }, []>(`PRAGMA main.table_info(${quote(table)})`);
      const columns = schema.all();
      if (columns.length === 0) throw new Error("Projection content identity requires complete schema");
      hash.update(JSON.stringify([table, columns]));
      // SQLite encodes values before crossing the JS boundary: no rounded int64
      // IDs, NUL-truncated text, blob/text collisions or shortened real values.
      const values = columns.map(({ name }) => {
        const field = quote(name);
        return `typeof(${field}) || ':' || CASE typeof(${field}) WHEN 'null' THEN '' WHEN 'integer' THEN CAST(${field} AS TEXT) WHEN 'real' THEN printf('%!.26g',${field}) ELSE hex(CAST(${field} AS BLOB)) END AS ${field}`;
      });
      using rows = db.prepare<Record<string, string>, []>(`SELECT ${values.join(",")} FROM main.${quote(table)} ORDER BY rowid`);
      for (const row of rows.iterate()) { empty = false; hash.update(JSON.stringify(row)); }
    }
    return { hash: "v1:" + hash.digest("hex"), empty };
  })();
}

/** Never infer permission to overwrite direct/imported/deleted state from source freshness. */
export function assertAutomaticProjectionReplay(db: Database): void {
  using statement = db.prepare<{ manifest: string }, []>("SELECT manifest FROM main.projection_replay_state WHERE id=1");
  const receipt = statement.get(), content = projectionContentIdentity(db);
  if (!receipt && content.empty) return;
  let expected: unknown;
  try { expected = JSON.parse(receipt?.manifest ?? "null")?.projectionState; } catch { /* Invalid receipts require explicit reconciliation. */ }
  if (typeof expected !== "string" || !/^v1:[a-f0-9]{64}$/.test(expected) || expected !== content.hash) {
    throw new Error("Automatic projection replay requires explicit reconciliation: content differs or no trustworthy projection receipt exists");
  }
}
