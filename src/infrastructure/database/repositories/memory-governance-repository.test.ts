import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createSchema } from "../schema.js";
import { MemoryEventEnvelope } from "../../../domain/entities/memory-event.js";
import { MemoryGovernanceEntry } from "../../../domain/entities/memory-governance.js";
import { SqliteMemoryGovernanceRepository } from "./memory-governance-repository.js";

describe("SqliteMemoryGovernanceRepository", () => {
  let db: Database;
  let repo: SqliteMemoryGovernanceRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    repo = new SqliteMemoryGovernanceRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function entry(overrides: Partial<Parameters<typeof MemoryGovernanceEntry.create>[0]> = {}) {
    return MemoryGovernanceEntry.create({
      surface: "fact",
      targetId: "fact-1",
      project: "memory-nexus",
      visibility: "project",
      sourceEventIds: ["event-1"],
      transformationMethod: "test",
      actor: "memory",
      confidence: 0.8,
      redactionState: "none",
      consentStatus: "granted",
      consentScopes: ["local-memory"],
      scope: { project: "memory-nexus", visibility: "project" },
      createdAt: new Date("2026-06-06T08:00:00Z"),
      updatedAt: new Date("2026-06-06T08:00:00Z"),
      ...overrides,
    });
  }

  test("saves and reads current governance projection", async () => {
    const saved = await repo.save(entry());
    const found = await repo.findByTarget("fact", "fact-1");

    expect(saved.id).toBeDefined();
    expect(found?.toJSON()).toMatchObject({
      surface: "fact",
      target_id: "fact-1",
      source_event_ids: ["event-1"],
      consent_status: "granted",
      status: "active",
    });
  });

  test("filters by surface, project, status, and target ids", async () => {
    await repo.save(entry({ targetId: "fact-1", project: "a" }));
    await repo.save(entry({ targetId: "fact-2", project: "a", status: "suppressed" }));
    await repo.save(entry({ targetId: "dream-1", surface: "dream", project: "b" }));

    expect((await repo.findAll({ surface: "fact", project: "a" })).map((e) => e.targetId).sort())
      .toEqual(["fact-1", "fact-2"]);
    expect((await repo.findAll({ status: "suppressed" })).map((e) => e.targetId))
      .toEqual(["fact-2"]);
    expect((await repo.findByTargetIds("fact", ["fact-1", "missing"])).map((e) => e.targetId))
      .toEqual(["fact-1"]);
  });

  test("applies governance control events and records audit rows", async () => {
    await repo.save(entry({ targetId: "fact-2" }));
    const event = MemoryEventEnvelope.create({
      eventId: "governance-event-1",
      machineId: "local",
      sequence: 1,
      kind: "governance",
      operation: "update",
      occurredAt: new Date("2026-06-06T09:00:00Z"),
      observedAt: new Date("2026-06-06T09:00:00Z"),
      scope: { project: "memory-nexus", visibility: "project" },
      provenance: { source: "cli", actor: "user", method: "governance suppress" },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: ["fact-2"], supersedesEventIds: [], relatedEventIds: [] },
      payload: {
        governance: {
          control: "suppress",
          surface: "fact",
          targetId: "fact-2",
          actor: "user",
          reason: "not useful",
        },
      },
    });

    const updated = await repo.applyMemoryEvent(event);
    const audit = db.prepare("SELECT * FROM memory_governance_events WHERE event_id = ?")
      .get("governance-event-1") as any;

    expect(updated?.status).toBe("suppressed");
    expect(updated?.statusReason).toBe("not useful");
    expect(updated?.isBlocked()).toBe(true);
    expect(audit.control).toBe("suppress");
  });

  test("creates a control-only entry when older facts were never registered", async () => {
    const event = MemoryEventEnvelope.create({
      eventId: "governance-event-2",
      machineId: "local",
      sequence: 2,
      kind: "governance",
      operation: "update",
      occurredAt: new Date("2026-06-06T10:00:00Z"),
      observedAt: new Date("2026-06-06T10:00:00Z"),
      scope: { project: "legacy", visibility: "project" },
      provenance: { source: "cli", actor: "user", method: "governance suppress" },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: ["legacy-fact"], supersedesEventIds: [], relatedEventIds: [] },
      payload: {
        governance: {
          control: "suppress",
          surface: "fact",
          targetId: "legacy-fact",
          reason: "legacy stale memory",
        },
      },
    });

    const updated = await repo.applyMemoryEvent(event);

    expect(updated?.targetId).toBe("legacy-fact");
    expect(updated?.project).toBe("legacy");
    expect(updated?.status).toBe("suppressed");
  });
});
