import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSchema } from "../../../infrastructure/database/schema.js";
import { SqliteMemoryGovernanceRepository } from "../../../infrastructure/database/repositories/memory-governance-repository.js";
import { MemoryGovernanceEntry } from "../../../domain/entities/memory-governance.js";
import { createGovernanceCommand, executeGovernanceCommand } from "./governance.js";

describe("Governance CLI Command", () => {
  let db: Database;
  let dbPath: string;
  let repo: SqliteMemoryGovernanceRepository;

  beforeEach(() => {
    dbPath = join(tmpdir(), `memory-governance-cli-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    repo = new SqliteMemoryGovernanceRepository(db);
  });

  afterEach(() => {
    db.close();
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    } catch {
      // Windows can keep SQLite handles briefly after close; temp files are unique.
    }
  });

  async function seed(targetId = "fact-cli") {
    await repo.save(MemoryGovernanceEntry.create({
      surface: "fact",
      targetId,
      project: "memory-nexus",
      visibility: "project",
      sourceEventIds: ["source"],
      transformationMethod: "test",
      actor: "memory",
      confidence: 1,
      redactionState: "none",
      consentStatus: "not_required",
      consentScopes: [],
      scope: { project: "memory-nexus", visibility: "project" },
      createdAt: new Date("2026-06-06T08:00:00Z"),
      updatedAt: new Date("2026-06-06T08:00:00Z"),
    }));
  }

  test("createGovernanceCommand registers expected subcommands", () => {
    const cmd = createGovernanceCommand();
    expect(cmd.name()).toBe("governance");
    expect(cmd.commands.map((sub) => sub.name())).toContain("suppress");
    expect(cmd.commands.map((sub) => sub.name())).toContain("consent-revoke");
  });

  test("list emits JSON governed memory entries", async () => {
    await seed();
    const logs: string[] = [];
    const original = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      const result = await executeGovernanceCommand({
        action: "list",
        json: true,
      }, { dbPath, writeEvents: false });
      const parsed = JSON.parse(logs[0]);

      expect(result.exitCode).toBe(0);
      expect(parsed.status).toBe("success");
      expect(parsed.data[0].target_id).toBe("fact-cli");
    } finally {
      console.log = original;
    }
  });

  test("suppress updates governance state without requiring event-log writes in tests", async () => {
    await seed("fact-drop");
    const logs: string[] = [];
    const original = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      const result = await executeGovernanceCommand({
        action: "suppress",
        targetId: "fact-drop",
        surface: "fact",
        reason: "stale",
        json: true,
      }, { dbPath, writeEvents: false });
      const parsed = JSON.parse(logs[0]);
      const found = await repo.findByTarget("fact", "fact-drop");

      expect(result.exitCode).toBe(0);
      expect(parsed.data.status).toBe("suppressed");
      expect(parsed.data.blocked).toBe(true);
      expect(found?.status).toBe("suppressed");
    } finally {
      console.log = original;
    }
  });

  test("show returns not found for unknown governed target", async () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      const result = await executeGovernanceCommand({
        action: "show",
        targetId: "missing",
        surface: "fact",
        json: true,
      }, { dbPath, writeEvents: false });
      const parsed = JSON.parse(logs[0]);

      expect(result.exitCode).toBe(1);
      expect(parsed.error.code).toBe("NOT_FOUND");
    } finally {
      console.log = original;
    }
  });
});
