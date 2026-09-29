/**
 * SqliteExtractionLogRepository Tests
 *
 * Integration tests against in-memory SQLite database.
 * Tests CRUD operations and log clearance for fact extractions.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import { createSchema } from "../schema.js";
import { SqliteExtractionLogRepository } from "./extraction-log-repository.js";
import type { ExtractionLogEntry } from "../../../domain/ports/repositories.js";

describe("SqliteExtractionLogRepository", () => {
  let db: Database;
  let repo: SqliteExtractionLogRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    repo = new SqliteExtractionLogRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function createTestEntry(overrides?: Partial<ExtractionLogEntry>): ExtractionLogEntry {
    return {
      sessionId: "session-12345",
      mode: "sync",
      factsAdded: 5,
      factsUpdated: 2,
      factsSuperseded: 1,
      factsSkipped: 10,
      provider: "claude-cli",
      model: "claude-3-5-sonnet",
      tokensConsumed: 1250,
      extractedAt: new Date("2026-05-23T08:00:00Z"),
      ...overrides
    };
  }

  describe("save & findById", () => {
    it("inserts a new extraction log entry and retrieves it", async () => {
      const entry = createTestEntry();
      await repo.save(entry);

      const found = await repo.findById("session-12345");
      expect(found).not.toBeNull();
      expect(found!.sessionId).toBe("session-12345");
      expect(found!.mode).toBe("sync");
      expect(found!.factsAdded).toBe(5);
      expect(found!.factsUpdated).toBe(2);
      expect(found!.factsSuperseded).toBe(1);
      expect(found!.factsSkipped).toBe(10);
      expect(found!.provider).toBe("claude-cli");
      expect(found!.model).toBe("claude-3-5-sonnet");
      expect(found!.tokensConsumed).toBe(1250);
      expect(found!.extractedAt.toISOString()).toBe(entry.extractedAt.toISOString());
    });

    it("upserts / overwrites an entry on duplicate sessionId", async () => {
      const entry1 = createTestEntry({ factsAdded: 3 });
      await repo.save(entry1);

      const entry2 = createTestEntry({ factsAdded: 10 });
      await repo.save(entry2);

      const found = await repo.findById("session-12345");
      expect(found!.factsAdded).toBe(10);

      const all = await repo.findAll();
      expect(all.length).toBe(1);
    });

    it("returns null if entry is not found", async () => {
      expect(await repo.findById("nonexistent")).toBeNull();
    });
  });

  describe("findAll & clearAll", () => {
    it("returns list of entries and clears them all", async () => {
      await repo.save(createTestEntry({ sessionId: "s1" }));
      await repo.save(createTestEntry({ sessionId: "s2" }));

      const all = await repo.findAll();
      expect(all.length).toBe(2);

      await repo.clearAll();
      const cleared = await repo.findAll();
      expect(cleared.length).toBe(0);
    });
  });

  it("migrates legacy audits without inventing input identity and preserves bound round trips", async () => {
    db.exec("DROP TABLE extraction_log");
    db.exec(`CREATE TABLE extraction_log (
      session_id TEXT PRIMARY KEY, mode TEXT NOT NULL, facts_added INTEGER,
      facts_updated INTEGER, facts_superseded INTEGER, facts_skipped INTEGER,
      provider TEXT NOT NULL, model TEXT NOT NULL, tokens_consumed INTEGER,
      extracted_at TEXT NOT NULL)`);
    using insert=db.prepare("INSERT INTO extraction_log VALUES (?,?,?,?,?,?,?,?,?,?)");
    insert.run("legacy","manual",2,0,0,0,"synthetic","synthetic",0,"2026-01-01T00:00:00.000Z");
    const rows=()=>{using statement=db.prepare("SELECT * FROM extraction_log");return statement.get() as Record<string,unknown>;};
    const before=rows();
    const exec=db.exec.bind(db);
    const fault=spyOn(db,"exec").mockImplementation(sql=>{
      if(sql.startsWith("ALTER TABLE extraction_log")) throw new Error("synthetic migration failure");
      return exec(sql);
    });
    try{expect(()=>createSchema(db)).toThrow("synthetic migration failure");}
    finally{fault.mockRestore();}
    expect(rows()).toEqual(before);
    createSchema(db);createSchema(db);
    expect(rows()).toEqual({...before,input_identity:null});
    expect((await repo.findById("legacy"))?.inputIdentity).toBeUndefined();
    const entry=createTestEntry({inputIdentity:"v1:"+"a".repeat(64)});
    await repo.save(entry);
    expect(await repo.findById(entry.sessionId)).toEqual(entry);
    expect((await repo.findAll()).find(row=>row.sessionId===entry.sessionId)).toEqual(entry);
  });

  it("rejects invalid identity on writes and corrupted identity on reads", async () => {
    await repo.save(createTestEntry());
    const before=db.serialize();
    for(const invalid of ["", "v2:"+"a".repeat(64), "v1:"+"A".repeat(64), "v1:"+"a".repeat(63), "v1:"+"g".repeat(64), 12, null]) {
      await expect(repo.save(createTestEntry({inputIdentity:invalid as unknown as string}))).rejects.toThrow("Invalid or unsupported extraction input identity");
      expect(db.serialize()).toEqual(before);
    }
    using update=db.prepare("UPDATE extraction_log SET input_identity=?");
    expect(()=>update.run("v2:"+"a".repeat(64))).toThrow("CHECK constraint failed");
    db.exec("PRAGMA ignore_check_constraints=ON");update.run("synthetic corrupt identity");
    await expect(repo.findById("session-12345")).rejects.toThrow("Invalid or unsupported extraction input identity");
    await expect(repo.findAll()).rejects.toThrow("Invalid or unsupported extraction input identity");
  });
});
