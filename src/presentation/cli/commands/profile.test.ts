import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonaEntry } from "../../../domain/entities/persona-entry.js";
import { Fact } from "../../../domain/entities/fact.js";
import { MemoryGovernanceEntry } from "../../../domain/entities/memory-governance.js";
import { createSchema } from "../../../infrastructure/database/schema.js";
import { SqliteFactRepository } from "../../../infrastructure/database/repositories/fact-repository.js";
import { SqliteMemoryGovernanceRepository } from "../../../infrastructure/database/repositories/memory-governance-repository.js";
import { SqlitePersonaRepository } from "../../../infrastructure/database/repositories/persona-repository.js";
import { createProfileCommand, executeProfileCommand } from "./profile.js";

describe("Profile CLI Command", () => {
  let db: Database;
  let dbPath: string;
  let factRepo: SqliteFactRepository;
  let personaRepo: SqlitePersonaRepository;
  let governanceRepo: SqliteMemoryGovernanceRepository;

  beforeEach(() => {
    dbPath = join(tmpdir(), `memory-profile-cli-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    factRepo = new SqliteFactRepository(db);
    personaRepo = new SqlitePersonaRepository(db);
    governanceRepo = new SqliteMemoryGovernanceRepository(db);
  });

  afterEach(() => {
    db.close();
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    } catch {
      // Windows can briefly retain sqlite handles; temp names are unique.
    }
  });

  test("createProfileCommand registers expected subcommands and options", () => {
    const command = createProfileCommand();

    expect(command.name()).toBe("profile");
    expect(command.commands.map((sub) => sub.name())).toEqual(["show", "export", "rebuild"]);
    expect(command.commands.find((sub) => sub.name() === "show")?.options.some((opt) => opt.long === "--kind")).toBe(true);
    expect(command.commands.find((sub) => sub.name() === "rebuild")?.options.some((opt) => opt.long === "--all")).toBe(true);
  });

  test("rebuild compiles active persona facts and registers governed entries", async () => {
    await factRepo.save(Fact.create({
      uuid: "fact-prefer-durable",
      type: "preference",
      project: "memory-nexus",
      content: "Prefer durable disk artifacts over chat-only memory.",
      metadata: {
        visibility: "global",
        confidence: 0.91,
      },
      observedAt: new Date("2026-06-07T08:00:00Z"),
    }));
    await factRepo.save(Fact.create({
      uuid: "fact-old",
      type: "preference",
      project: "memory-nexus",
      content: "Superseded preference",
      supersededAt: new Date("2026-06-07T09:00:00Z"),
      supersededBy: "fact-new",
      observedAt: new Date("2026-06-07T07:00:00Z"),
    }));

    const output = await captureConsole(() => executeProfileCommand({
      action: "rebuild",
      project: "memory-nexus",
      json: true,
    }, { dbPath, now: () => new Date("2026-06-07T10:00:00Z") }));
    const parsed = JSON.parse(output.logs[0]);
    const entries = await personaRepo.findAll();

    expect(output.result.exitCode).toBe(0);
    expect(parsed.status).toBe("success");
    expect(parsed.data.project).toBe("memory-nexus");
    expect(parsed.data.entry_count).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toContain("durable disk artifacts");
    expect(entries[0].reviewAfter.toISOString()).toBe("2026-07-07T10:00:00.000Z");
    expect(await governanceRepo.findByTarget("persona", entries[0].entryId)).not.toBeNull();
  });

  test("show includes project and global entries but filters suppressed persona governance", async () => {
    const allowed = await personaRepo.save(makePersonaEntry({
      entryId: "persona-allowed",
      content: "Always verify repo state before claiming implementation status.",
      project: "memory-nexus",
      visibility: "project",
      scope: { project: "memory-nexus", visibility: "project" },
    }));
    const global = await personaRepo.save(makePersonaEntry({
      entryId: "persona-global",
      content: "Persist recovery nuance before context reset.",
      project: undefined,
      visibility: "global",
      scope: { visibility: "global" },
    }));
    const suppressed = await personaRepo.save(makePersonaEntry({
      entryId: "persona-suppressed",
      content: "This suppressed entry must not be shown.",
      project: "memory-nexus",
      visibility: "project",
      scope: { project: "memory-nexus", visibility: "project" },
    }));
    await governanceRepo.save(governanceFor(allowed));
    await governanceRepo.save(governanceFor(global));
    await governanceRepo.save(governanceFor(suppressed, "suppressed"));

    const output = await captureConsole(() => executeProfileCommand({
      action: "show",
      project: "memory-nexus",
    }, { dbPath }));
    const text = output.logs.join("\n");

    expect(output.result.exitCode).toBe(0);
    expect(text).toContain("Persona Profile for Project: memory-nexus");
    expect(text).toContain("Always verify repo state");
    expect(text).toContain("Persist recovery nuance");
    expect(text).toContain("why: Test persona provenance.");
    expect(text).not.toContain("suppressed entry");
  });

  test("export emits governed persona entries as stable JSON", async () => {
    const entry = await personaRepo.save(makePersonaEntry({
      entryId: "persona-export",
      content: "Prefer explicit source provenance.",
      project: "memory-nexus",
      visibility: "project",
      scope: { project: "memory-nexus", visibility: "project" },
    }));
    await governanceRepo.save(governanceFor(entry));

    const output = await captureConsole(() => executeProfileCommand({
      action: "export",
      project: "memory-nexus",
      json: true,
    }, { dbPath }));
    const parsed = JSON.parse(output.logs[0]);

    expect(output.result.exitCode).toBe(0);
    expect(parsed.status).toBe("success");
    expect(parsed.data.schema_version).toBe(1);
    expect(parsed.data.project).toBe("memory-nexus");
    expect(parsed.data.entries).toHaveLength(1);
    expect(parsed.data.entries[0].entry_id).toBe("persona-export");
    expect(parsed.data.entries[0].controls).toContain("suppress");
  });

  test("rebuild requires a project or all-project scope and reports text errors", async () => {
    const output = await captureConsole(() => executeProfileCommand({
      action: "rebuild",
    }, { dbPath }));

    expect(output.result.exitCode).toBe(1);
    expect(output.errors.join("\n")).toContain("Provide a project or --all");
  });

  test("rebuild --all reports a text summary for all projects", async () => {
    const output = await captureConsole(() => executeProfileCommand({
      action: "rebuild",
      all: true,
    }, { dbPath, now: () => new Date("2026-06-07T10:00:00Z") }));
    const text = output.logs.join("\n");

    expect(output.result.exitCode).toBe(0);
    expect(text).toContain("Profile rebuilt for all projects.");
    expect(text).toContain("Entries: 0 | Facts scanned: 0 | Friction patterns scanned: 0");
  });

  test("show handles all-project empty text output and global-only profile output", async () => {
    const empty = await captureConsole(() => executeProfileCommand({
      action: "show",
      all: true,
    }, { dbPath }));

    const global = await personaRepo.save(makePersonaEntry({
      entryId: "persona-global-only",
      content: "Keep first-party memory changes visible.",
      project: undefined,
      visibility: "global",
      scope: { visibility: "global" },
    }));
    await governanceRepo.save(governanceFor(global));

    const globalOutput = await captureConsole(() => executeProfileCommand({
      action: "show",
      limit: 1,
    }, { dbPath }));

    expect(empty.result.exitCode).toBe(0);
    expect(empty.logs.join("\n")).toContain("Persona Profile for All Projects");
    expect(empty.logs.join("\n")).toContain("No governed persona entries found.");
    expect(globalOutput.result.exitCode).toBe(0);
    expect(globalOutput.logs.join("\n")).toContain("Global Persona Profile");
    expect(globalOutput.logs.join("\n")).toContain("scope: global");
  });

  test("export works without explicit json flag and supports all-project filtering", async () => {
    const entry = await personaRepo.save(makePersonaEntry({
      entryId: "persona-export-all",
      kind: "procedure",
      content: "Run quality gates before commit.",
      project: "memory-nexus",
      visibility: "project",
      scope: { project: "memory-nexus", visibility: "project" },
    }));
    await governanceRepo.save(governanceFor(entry));

    const output = await captureConsole(() => executeProfileCommand({
      action: "export",
      all: true,
      kind: "procedure",
      limit: 5,
    }, { dbPath, now: () => new Date("2026-06-07T11:00:00Z") }));
    const parsed = JSON.parse(output.logs[0]);

    expect(output.result.exitCode).toBe(0);
    expect(parsed.data.generated_at).toBe("2026-06-07T11:00:00.000Z");
    expect(parsed.data.all).toBe(true);
    expect(parsed.data.entries.map((item: { entry_id: string }) => item.entry_id)).toEqual(["persona-export-all"]);
  });

  test("reports database connection failures as JSON without leaking internals", async () => {
    const output = await captureConsole(() => executeProfileCommand({
      action: "show",
      json: true,
    }, { dbPath: tmpdir() }));
    const parsed = JSON.parse(output.logs[0]);

    expect(output.result.exitCode).toBe(1);
    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("DB_CONNECTION_FAILED");
  });

  test("reports unexpected stored-row errors through the command contract", async () => {
    db.prepare(`
      INSERT INTO persona_entries (
        entry_id, kind, content, project, visibility, source_event_ids,
        source_kinds, confidence, scope, review_status, review_after,
        expires_at, why, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "persona-corrupt",
      "preference",
      "Corrupt serialized source ids.",
      null,
      "global",
      "not-json",
      JSON.stringify(["preference"]),
      0.9,
      JSON.stringify({ visibility: "global" }),
      "pending_review",
      "2026-07-07T00:00:00.000Z",
      null,
      "Corruption test.",
      "2026-06-07T00:00:00.000Z",
      "2026-06-07T00:00:00.000Z",
    );

    const output = await captureConsole(() => executeProfileCommand({
      action: "show",
      json: true,
    }, { dbPath }));
    const parsed = JSON.parse(output.logs[0]);

    expect(output.result.exitCode).toBe(2);
    expect(parsed.error.code).toBe("UNEXPECTED_ERROR");
  });

  test("commander rejects non-positive profile limits before execution", async () => {
    const command = createProfileCommand();
    command.exitOverride();
    command.configureOutput({ writeErr: () => {}, writeOut: () => {} });

    await expect(command.parseAsync(["node", "memory profile", "show", "--limit", "0"]))
      .rejects.toThrow();
  });
});

async function captureConsole(fn: () => Promise<{ exitCode: number }>) {
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

function makePersonaEntry(overrides: Partial<Parameters<typeof PersonaEntry.create>[0]> = {}): PersonaEntry {
  return PersonaEntry.create({
    entryId: "persona-test",
    kind: "preference",
    content: "Test persona content.",
    project: "memory-nexus",
    visibility: "project",
    sourceEventIds: ["source-event"],
    sourceKinds: ["preference"],
    confidence: 0.9,
    scope: { project: "memory-nexus", visibility: "project" },
    reviewStatus: "pending_review",
    reviewAfter: new Date("2026-07-07T00:00:00Z"),
    why: "Test persona provenance.",
    createdAt: new Date("2026-06-07T00:00:00Z"),
    updatedAt: new Date("2026-06-07T00:00:00Z"),
    ...overrides,
  });
}

function governanceFor(entry: PersonaEntry, status: "active" | "suppressed" = "active"): MemoryGovernanceEntry {
  return MemoryGovernanceEntry.create({
    surface: "persona",
    targetId: entry.entryId,
    project: entry.project,
    visibility: entry.visibility,
    sourceEventIds: entry.sourceEventIds,
    transformationMethod: "test",
    actor: "memory",
    confidence: entry.confidence,
    redactionState: "redacted",
    consentStatus: "not_required",
    consentScopes: [],
    scope: entry.scope,
    status,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
}
