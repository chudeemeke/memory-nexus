import { describe, expect, it } from "bun:test";
import type { Statement } from "bun:sqlite";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { SecretAuditService } from "../../../src/infrastructure/security/secret-audit-service.js";
import { PatternRedactor } from "../../../src/infrastructure/security/pattern-redactor.js";

const syntheticToken = ["sk", "auditfixtureabcdefghijklmnopqrstuvwxyz"].join("-");

async function withFixture(run: (db: OwnedDatabase, released: () => void) => Promise<void>): Promise<void> {
  const db = new OwnedDatabase(":memory:");
  try {
    createSchema(db); db.transaction(() => {})();
    using insert = db.prepare("INSERT INTO sessions (id,project_path_encoded,project_path_decoded,project_name,start_time,summary) VALUES (?, 'synthetic', '/synthetic', 'synthetic', '2026-01-01T00:00:00Z', ?)");
    insert.run("first", "firstneedle " + syntheticToken);
    insert.run("second", "secondneedle " + syntheticToken);
    const statements: Statement[] = [], prepare = db.prepare.bind(db);
    db.prepare = ((...args: Parameters<typeof db.prepare>) => {
      const statement = Reflect.apply(prepare, db, args) as Statement;
      statements.push(statement); return statement;
    }) as typeof db.prepare;
    await run(db, () => {
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
      statements.length = 0;
    });
  } finally { db.close(); }
}

function summaries(db: OwnedDatabase): unknown[] {
  using statement = db.prepare("SELECT id,summary FROM sessions ORDER BY id"); return statement.all();
}
function indexed(db: OwnedDatabase): unknown[] {
  using statement = db.prepare("SELECT session_id,summary FROM sessions_fts ORDER BY session_id"); return statement.all();
}

describe("secret-audit database lifetime and rollback", () => {
  it("releases scan statements repeatedly without changing read-only data, then redacts and retries", async () => {
    await withFixture(async (db, released) => {
      const service = new SecretAuditService(new PatternRedactor());
      const before = summaries(db); released();
      for (let iteration = 0; iteration < 3; iteration++) {
        const report = await service.audit({ db });
        expect(report.summary.databaseFindings).toBe(2);
        expect(JSON.stringify(report)).not.toContain(syntheticToken);
        expect(report.remediation.database.updatedFields).toBe(0);
        expect(summaries(db)).toEqual(before); released();
      }
      const report = await service.audit({ db, redactDatabase: true });
      expect(report.remediation.database.updatedFields).toBe(2);
      expect(report.remediation.database.rebuiltFtsIndexes).toContain("sessions_fts");
      expect(JSON.stringify(summaries(db))).not.toContain(syntheticToken);
      expect(JSON.stringify(indexed(db))).not.toContain(syntheticToken); released();
      expect((await service.audit({ db, redactDatabase: true })).summary.totalFindings).toBe(0); released();
    });
  });

  it("rolls back earlier fields and indexes on a late native update error and permits retry", async () => {
    await withFixture(async (db, released) => {
      const before = summaries(db), index = indexed(db); released();
      db.exec("CREATE TRIGGER reject_audit BEFORE UPDATE OF summary ON sessions WHEN OLD.id='second' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
      const service = new SecretAuditService(new PatternRedactor());
      await expect(service.audit({ db, redactDatabase: true })).rejects.toThrow("synthetic audit failure");
      expect(summaries(db)).toEqual(before); expect(indexed(db)).toEqual(index);
      expect(db.inTransaction).toBe(false); released();
      db.exec("DROP TRIGGER reject_audit");
      expect((await service.audit({ db, redactDatabase: true })).remediation.database.updatedFields).toBe(2); released();
    });
  });

  it("rejects ignored writes and preserves prior data instead of reporting successful redaction", async () => {
    await withFixture(async (db, released) => {
      const before = summaries(db); released();
      db.exec("CREATE TRIGGER ignore_audit BEFORE UPDATE OF summary ON sessions WHEN OLD.id='second' BEGIN SELECT RAISE(IGNORE); END");
      await expect(new SecretAuditService(new PatternRedactor()).audit({ db, redactDatabase: true })).rejects.toThrow("Secret audit could not update selected field");
      expect(summaries(db)).toEqual(before); released();
    });
  });

  it("preserves database changes within an enclosing caller transaction", async () => {
    await withFixture(async (db, released) => {
      const before = summaries(db), index = indexed(db); released();
      db.exec("BEGIN");
      await new SecretAuditService(new PatternRedactor()).audit({ db, redactDatabase: true });
      expect(db.inTransaction).toBe(true);
      expect(JSON.stringify(summaries(db))).not.toContain(syntheticToken); released();
      db.exec("ROLLBACK");
      expect(summaries(db)).toEqual(before); expect(indexed(db)).toEqual(index); released();
    });
  });

  it("restores redacted fields when a native index rebuild fails", async () => {
    await withFixture(async (db, released) => {
      const before = summaries(db), index = indexed(db); released();
      db.exec("DROP TRIGGER messages_fts_insert; DROP TRIGGER messages_fts_delete; DROP TRIGGER messages_fts_update; DROP TABLE messages_fts; CREATE TABLE messages_fts (messages_fts TEXT CHECK(messages_fts != 'rebuild'))");
      await expect(new SecretAuditService(new PatternRedactor()).audit({ db, redactDatabase: true })).rejects.toThrow("CHECK constraint failed");
      expect(summaries(db)).toEqual(before); expect(indexed(db)).toEqual(index);
      expect(db.inTransaction).toBe(false); released();
    });
  });

  it("rolls back earlier redactions when the redactor fails without disturbing caller work", async () => {
    await withFixture(async (db, released) => {
      const before = summaries(db), index = indexed(db); released();
      const redactor = new PatternRedactor(), redactText = redactor.redactText.bind(redactor);
      redactor.redactText = (input) => {
        if (input.startsWith("secondneedle")) throw new Error("synthetic redactor failure");
        return redactText(input);
      };
      db.exec("BEGIN; UPDATE sessions SET project_name='caller work' WHERE id='first'");
      await expect(new SecretAuditService(redactor).audit({ db, redactDatabase: true })).rejects.toThrow("synthetic redactor failure");
      expect(db.inTransaction).toBe(true);
      expect(summaries(db)).toEqual(before); expect(indexed(db)).toEqual(index);
      {
        using statement = db.prepare("SELECT project_name FROM sessions WHERE id='first'");
        expect(statement.get()).toEqual({ project_name: "caller work" });
      }
      released();
      db.exec("ROLLBACK");
    });
  });
});
