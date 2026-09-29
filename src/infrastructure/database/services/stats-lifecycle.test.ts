import { describe, expect, it } from "bun:test";
import { Database, type Statement } from "bun:sqlite";
import { SqliteStatsService } from "./stats-service.js";

function fixture(tables: "complete" | "missing-projects" | "missing-tools") {
  const db = new Database(":memory:");
  if (tables !== "missing-projects") {
    db.exec("CREATE TABLE sessions(id TEXT, project_name TEXT); CREATE TABLE messages_meta(id TEXT, session_id TEXT);");
    db.exec("INSERT INTO sessions VALUES ('session', 'project'); INSERT INTO messages_meta VALUES ('message', 'session');");
  }
  if (tables === "complete") db.exec("CREATE TABLE tool_uses(id TEXT); INSERT INTO tool_uses VALUES ('tool');");
  const statements: Statement[] = [], prepare = db.prepare.bind(db);
  db.prepare = ((...args: Parameters<typeof db.prepare>) => {
    const statement = Reflect.apply(prepare, db, args) as Statement;
    statements.push(statement);
    return statement;
  }) as typeof db.prepare;
  return { db, statements, cleanup() {
    for (const statement of statements) statement.finalize();
    db.close(true);
  } };
}

describe("stats statement lifetime", () => {
  it("releases every statement after each successful call without closing the connection", async () => {
    const owned = fixture("complete"), service = new SqliteStatsService(owned.db);
    try {
      for (let call = 0; call < 25; call++) {
        const stats = await service.getStats();
        expect(stats.totalSessions).toBe(1);
        expect(stats.totalMessages).toBe(1);
        expect(stats.totalToolUses).toBe(1);
        expect(stats.projectBreakdown).toEqual([{ projectName: "project", sessionCount: 1, messageCount: 1 }]);
        expect(owned.statements.length).toBe((call + 1) * 3);
        for (const statement of owned.statements.slice(-3)) expect(() => statement.get()).toThrow("finalized");
      }
    } finally { owned.cleanup(); }
  });

  for (const tables of ["missing-projects", "missing-tools"] as const) {
    it(`releases earlier statements when preparation fails: ${tables}`, async () => {
      const owned = fixture(tables), service = new SqliteStatsService(owned.db);
      try {
        await expect(service.getStats()).rejects.toThrow("no such table");
        expect(owned.statements.length).toBe(tables === "missing-projects" ? 1 : 2);
        for (const statement of owned.statements) expect(() => statement.get()).toThrow("finalized");
      } finally { owned.cleanup(); }
    });
  }

  it("finalizes the failed statement and earlier work when query execution throws", async () => {
    const owned = fixture("complete"), service = new SqliteStatsService(owned.db);
    try {
      owned.db.exec("DROP TABLE sessions; CREATE VIEW sessions AS SELECT 'id' AS id, json_extract('broken', '$') AS project_name");
      await expect(service.getStats()).rejects.toThrow("malformed JSON");
      expect(owned.statements.length).toBe(2);
      for (const statement of owned.statements) expect(() => statement.get()).toThrow("finalized");
    } finally { owned.cleanup(); }
  });
});
