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

  async function captureConsole(fn: () => Promise<unknown>) {
    const logs: string[] = [];
    const errors: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => { logs.push(args.map(String).join(" ")); };
    console.error = (...args) => { errors.push(args.map(String).join(" ")); };
    try {
      const result = await fn();
      return { result, logs, errors };
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
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

  test("list emits useful text for empty and populated result sets", async () => {
    const empty = await captureConsole(() => executeGovernanceCommand({
      action: "list",
      surface: "fact",
    }, { dbPath, writeEvents: false }));

    expect((empty.result as any).exitCode).toBe(0);
    expect(empty.logs.join("\n")).toContain("No governed memory entries found.");

    await seed("fact-a");
    await repo.save(MemoryGovernanceEntry.create({
      surface: "fact",
      targetId: "fact-b",
      project: "other",
      visibility: "project",
      sourceEventIds: ["source"],
      transformationMethod: "test",
      actor: "memory",
      confidence: 1,
      redactionState: "none",
      consentStatus: "not_required",
      consentScopes: [],
      scope: { project: "other", visibility: "project" },
      status: "suppressed",
      createdAt: new Date("2026-06-06T08:00:00Z"),
      updatedAt: new Date("2026-06-06T08:01:00Z"),
    }));

    const populated = await captureConsole(() => executeGovernanceCommand({
      action: "list",
      project: "other",
      status: "suppressed",
      limit: 1,
    }, { dbPath, writeEvents: false }));

    expect((populated.result as any).exitCode).toBe(0);
    expect(populated.logs.join("\n")).toContain("fact:fact-b [suppressed/blocked] other via test");
    expect(populated.logs.join("\n")).not.toContain("fact-a");
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

  test("show emits detailed text for active and blocked targets", async () => {
    await seed("fact-detail");
    await captureConsole(() => executeGovernanceCommand({
      action: "suppress",
      targetId: "fact-detail",
      surface: "fact",
      reason: "stale",
      json: true,
    }, { dbPath, writeEvents: false }));

    const output = await captureConsole(() => executeGovernanceCommand({
      action: "show",
      targetId: "fact-detail",
      surface: "fact",
    }, { dbPath, writeEvents: false }));

    expect((output.result as any).exitCode).toBe(0);
    expect(output.logs.join("\n")).toContain("fact:fact-detail");
    expect(output.logs.join("\n")).toContain("Status: suppressed (blocked)");
    expect(output.logs.join("\n")).toContain("Project: memory-nexus");
    expect(output.logs.join("\n")).toContain("Source events: source");
    expect(output.logs.join("\n")).toContain("Reason: stale");
  });

  test("text formatting handles active global entries and default fact surface", async () => {
    await repo.save(MemoryGovernanceEntry.create({
      surface: "fact",
      targetId: "global-active",
      visibility: "global",
      sourceEventIds: ["source-global"],
      transformationMethod: "manual",
      actor: "memory",
      confidence: 1,
      redactionState: "none",
      consentStatus: "not_required",
      consentScopes: [],
      scope: { visibility: "global" },
      createdAt: new Date("2026-06-06T08:00:00Z"),
      updatedAt: new Date("2026-06-06T08:00:00Z"),
    }));

    const listOutput = await captureConsole(() => executeGovernanceCommand({
      action: "list",
      targetId: "global-active",
    }, { dbPath, writeEvents: false }));
    const showOutput = await captureConsole(() => executeGovernanceCommand({
      action: "show",
      targetId: "global-active",
    }, { dbPath, writeEvents: false }));

    expect((listOutput.result as any).exitCode).toBe(0);
    expect(listOutput.logs.join("\n")).toContain("fact:global-active [active/active] global via manual");
    expect((showOutput.result as any).exitCode).toBe(0);
    expect(showOutput.logs.join("\n")).toContain("Status: active");
    expect(showOutput.logs.join("\n")).toContain("Project: global");
    expect(showOutput.logs.join("\n")).not.toContain("Reason:");
  });

  test("commander rejects non-positive governance list limits before executing actions", async () => {
    for (const value of ["0", "-1", "abc"]) {
      const cmd = createGovernanceCommand();
      cmd.exitOverride();
      cmd.configureOutput({ writeErr: () => undefined, writeOut: () => undefined });

      await expect(cmd.parseAsync(["node", "memory governance", "list", "--limit", value]))
        .rejects.toThrow("Value must be a positive integer");
    }
  });

  test("all control actions update the target through the CLI executor", async () => {
    await seed("fact-controls");
    const actions = [
      { action: "suppress", expectedStatus: "suppressed" },
      { action: "unsuppress", expectedStatus: "active" },
      { action: "invalidate", expectedStatus: "invalidated" },
      { action: "review", expectedStatus: "active" },
      { action: "expire", expectedStatus: "expired", at: "2026-06-07T08:00:00Z" },
      { action: "consent-grant", expectedStatus: "active", scope: ["remote-sync"] },
      { action: "consent-revoke", expectedStatus: "suppressed", scope: ["remote-sync"] },
    ] as const;

    for (const item of actions) {
      const output = await captureConsole(() => executeGovernanceCommand({
        action: item.action,
        targetId: "fact-controls",
        surface: "fact",
        reason: `${item.action} reason`,
        at: "at" in item ? item.at : undefined,
        scope: "scope" in item ? item.scope : undefined,
        json: true,
      }, { dbPath, writeEvents: false }));
      const parsed = JSON.parse(output.logs[0]);

      expect((output.result as any).exitCode).toBe(0);
      expect(parsed.data.status).toBe(item.expectedStatus);
    }

    const final = await repo.findByTarget("fact", "fact-controls");
    expect(final?.consentStatus).toBe("revoked");
    expect(final?.consentScopes).toEqual(["remote-sync"]);
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

  test("text errors are human-readable for missing entries", async () => {
    const output = await captureConsole(() => executeGovernanceCommand({
      action: "show",
      targetId: "missing",
      surface: "fact",
    }, { dbPath, writeEvents: false }));

    expect((output.result as any).exitCode).toBe(1);
    expect(output.errors.join("\n")).toContain("Error: No governance entry found for fact:missing");
  });

  test("reports validation failures for missing targets, invalid surfaces, invalid dates, and unknown actions", async () => {
    const missingTarget = await captureConsole(() => executeGovernanceCommand({
      action: "show",
      surface: "fact",
      json: true,
    }, { dbPath, writeEvents: false }));
    const invalidSurface = await captureConsole(() => executeGovernanceCommand({
      action: "show",
      targetId: "fact-cli",
      surface: "unknown" as any,
      json: true,
    }, { dbPath, writeEvents: false }));
    const invalidDate = await captureConsole(() => executeGovernanceCommand({
      action: "expire",
      targetId: "fact-cli",
      surface: "fact",
      at: "not-a-date",
      json: true,
    }, { dbPath, writeEvents: false }));
    const invalidAction = await captureConsole(() => executeGovernanceCommand({
      action: "unknown" as any,
      targetId: "fact-cli",
      surface: "fact",
      json: true,
    }, { dbPath, writeEvents: false }));

    expect((missingTarget.result as any).exitCode).toBe(2);
    expect(JSON.parse(missingTarget.logs[0]).error.message).toBe("targetId is required");
    expect((invalidSurface.result as any).exitCode).toBe(2);
    expect(JSON.parse(invalidSurface.logs[0]).error.message).toContain("Invalid memory governance surface");
    expect((invalidDate.result as any).exitCode).toBe(2);
    expect(JSON.parse(invalidDate.logs[0]).error.message).toContain("Invalid ISO date");
    expect((invalidAction.result as any).exitCode).toBe(2);
    expect(JSON.parse(invalidAction.logs[0]).error.code).toBe("INVALID_ACTION");
  });

  test("reports database initialization failures without leaking stack traces", async () => {
    const output = await captureConsole(() => executeGovernanceCommand({
      action: "list",
      json: true,
    }, {
      dbPath: tmpdir(),
      writeEvents: false,
    }));
    const parsed = JSON.parse(output.logs[0]);

    expect((output.result as any).exitCode).toBe(1);
    expect(parsed.error.code).toBe("DB_CONNECTION_FAILED");
    expect(parsed.error.message).not.toContain("\n    at ");
  });
});
