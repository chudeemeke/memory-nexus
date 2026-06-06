import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createSchema } from "../schema.js";
import { MemoryEventEnvelope } from "../../../domain/entities/memory-event.js";
import { MemoryGovernanceEntry } from "../../../domain/entities/memory-governance.js";
import {
  SqliteMemoryGovernanceRepository,
  governanceEntryFromFactEvent,
} from "./memory-governance-repository.js";

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

  function eventWithGovernance(
    governance: Record<string, unknown> | undefined,
    overrides: Partial<Parameters<typeof MemoryEventEnvelope.create>[0]> = {},
  ): MemoryEventEnvelope {
    return MemoryEventEnvelope.create({
      eventId: "governance-event",
      machineId: "local",
      sequence: 1,
      kind: "governance",
      operation: "update",
      occurredAt: new Date("2026-06-06T09:00:00Z"),
      observedAt: new Date("2026-06-06T09:00:00Z"),
      scope: { project: "memory-nexus", visibility: "project" },
      provenance: { source: "cli", actor: "user", method: "governance" },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: ["fact-1"], supersedesEventIds: [], relatedEventIds: [] },
      payload: governance ? { governance } : {},
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
    await expect(repo.findByTargetIds("fact", [])).resolves.toEqual([]);
  });

  test("lists all entries with ordering and limit when no filters are supplied", async () => {
    await repo.save(entry({
      targetId: "older",
      updatedAt: new Date("2026-06-06T08:00:00Z"),
    }));
    await repo.save(entry({
      targetId: "newer",
      updatedAt: new Date("2026-06-06T09:00:00Z"),
    }));

    expect((await repo.findAll({ limit: 1 })).map((e) => e.targetId)).toEqual(["newer"]);
    expect((await repo.findAll()).map((e) => e.targetId)).toEqual(["newer", "older"]);
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

  test("ignores events without governance payload and rejects malformed governance events", async () => {
    await expect(repo.applyMemoryEvent(eventWithGovernance(undefined))).resolves.toBeNull();

    await expect(repo.applyMemoryEvent(eventWithGovernance({
      control: "suppress",
      surface: "fact",
      targetId: "",
    }))).rejects.toThrow("Governance event targetId is required");

    await expect(repo.applyMemoryEvent(eventWithGovernance({
      control: "unknown",
      surface: "fact",
      targetId: "fact-1",
    }))).rejects.toThrow("Invalid memory governance control");

    await expect(repo.applyMemoryEvent(eventWithGovernance({
      control: "suppress",
      surface: "unknown",
      targetId: "fact-1",
    }))).rejects.toThrow("Invalid memory governance surface");
  });

  test("applies register events with fallback values and stores audit rows idempotently", async () => {
    const event = eventWithGovernance({
      control: "register",
      surface: "fact",
      target_id: "fact-from-event",
      source_event_ids: ["source-from-event"],
      transformation_method: "governance.register",
      consent_status: "granted",
      consent_scopes: ["local-memory"],
      redaction_state: "redacted",
      confidence: 0.7,
      status: "pending_review",
      status_reason: "needs review",
      reviewed_at: "2026-06-06T08:30:00Z",
      expires_at: "bad date",
    }, {
      eventId: "register-event",
      privacy: { redactionState: "quarantined", containsSensitiveContent: true },
      consent: { status: "denied", scopes: ["fallback"] },
    });

    const created = await repo.applyMemoryEvent(event);
    const duplicate = await repo.applyMemoryEvent(event);
    const auditRows = db.prepare("SELECT COUNT(*) AS count FROM memory_governance_events WHERE event_id = ?")
      .get("register-event") as { count: number };

    expect(created?.toJSON()).toMatchObject({
      target_id: "fact-from-event",
      source_event_ids: ["source-from-event"],
      transformation_method: "governance.register",
      consent_status: "granted",
      consent_scopes: ["local-memory"],
      redaction_state: "redacted",
      status: "pending_review",
      status_reason: "needs review",
      reviewed_at: "2026-06-06T08:30:00.000Z",
      expires_at: null,
    });
    expect(duplicate?.targetId).toBe("fact-from-event");
    expect(auditRows.count).toBe(1);
  });

  test("applies control events with snake-case aliases and explicit consent expiry", async () => {
    await repo.save(entry({ targetId: "fact-3" }));
    const event = eventWithGovernance({
      control: "consent_revoke",
      surface: "fact",
      target_id: "fact-3",
      actor: "",
      reason: "user withdrew consent",
      expires_at: "2026-06-07T08:00:00Z",
      consent_status: "revoked",
      consent_scopes: ["remote-sync"],
    }, {
      eventId: "revoke-event",
      provenance: { source: "cli", actor: "fallback-user", method: "governance revoke" },
      occurredAt: new Date("2026-06-06T11:00:00Z"),
      observedAt: new Date("2026-06-06T11:00:00Z"),
    });

    const updated = await repo.applyMemoryEvent(event);

    expect(updated?.actor).toBe("fallback-user");
    expect(updated?.status).toBe("suppressed");
    expect(updated?.statusReason).toBe("user withdrew consent");
    expect(updated?.consentStatus).toBe("revoked");
    expect(updated?.consentScopes).toEqual(["remote-sync"]);
    expect(updated?.expiresAt?.toISOString()).toBe("2026-06-07T08:00:00.000Z");
    expect(updated?.lastEventId).toBe("revoke-event");
  });

  test("derives fact governance entries from canonical fact events with confidence and fallback source ids", () => {
    const factEventParams: Parameters<typeof MemoryEventEnvelope.create>[0] = {
      eventId: "fact-event-1",
      machineId: "local",
      sequence: 3,
      kind: "fact",
      operation: "add",
      occurredAt: new Date("2026-06-06T12:00:00Z"),
      observedAt: new Date("2026-06-06T12:01:00Z"),
      scope: { project: "memory-nexus", visibility: "project" },
      provenance: { source: "extract", actor: "memory", method: "llm.extract", sourceIds: [] },
      privacy: { redactionState: "redacted", containsSensitiveContent: true },
      consent: {
        status: "granted",
        scopes: ["local-memory"],
        expiresAt: new Date("2026-06-07T12:00:00Z"),
      },
      causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
      payload: {
        fact: {
          content: "test fact",
          metadata: { confidence: 0.42 },
        },
      },
    };
    const factEvent = MemoryEventEnvelope.create(factEventParams);
    const fallbackConfidenceEvent = MemoryEventEnvelope.create({
      ...factEventParams,
      eventId: "fact-event-2",
      sequence: 4,
      payload: { fact: { content: "without metadata" } },
      provenance: { source: "extract", actor: "memory", method: "llm.extract", sourceIds: ["source-explicit"] },
    });

    const fromFallbackSource = governanceEntryFromFactEvent(factEvent, "fact-uuid-1", "memory-nexus");
    const fromExplicitSource = governanceEntryFromFactEvent(fallbackConfidenceEvent, "fact-uuid-2", "memory-nexus");

    expect(fromFallbackSource.toJSON()).toMatchObject({
      target_id: "fact-uuid-1",
      source_event_ids: ["fact-event-1"],
      confidence: 0.42,
      redaction_state: "redacted",
      consent_status: "granted",
      expires_at: "2026-06-07T12:00:00.000Z",
    });
    expect(fromExplicitSource.sourceEventIds).toEqual(["source-explicit"]);
    expect(fromExplicitSource.confidence).toBe(1);
  });
});
