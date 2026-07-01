import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { DreamEntry } from "../../../domain/entities/dream-entry.js";
import { MemoryEventEnvelope } from "../../../domain/entities/memory-event.js";
import { createSchema } from "../schema.js";
import { SqliteDreamRepository } from "./dream-repository.js";

describe("SqliteDreamRepository", () => {
  let db: Database;
  let repo: SqliteDreamRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    repo = new SqliteDreamRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  test("schema creates dream_entries with durable indexes", () => {
    const columns = db.prepare("PRAGMA table_info(dream_entries)").all() as Array<{ name: string }>;
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='dream_entries'").all() as Array<{ name: string }>;

    expect(columns.map((column) => column.name)).toContain("dream_id");
    expect(columns.map((column) => column.name)).toContain("schema_version");
    expect(columns.map((column) => column.name)).toContain("audit");
    expect(indexes.map((index) => index.name)).toContain("idx_dream_entries_project");
    expect(indexes.map((index) => index.name)).toContain("idx_dream_entries_status");
  });

  test("saves, updates, and lists dream entries by project and status", async () => {
    const pending = await repo.save(makeDreamEntry({ dreamId: "dream-pending" }));
    const approved = await repo.save(makeDreamEntry({ dreamId: "dream-approved" }).approve("user", new Date("2026-06-07T09:00:00Z")));

    const found = await repo.findByDreamId("dream-pending");
    const listed = await repo.findAll({ project: "memory-nexus", status: "approved" });

    expect(pending.id).toBeNumber();
    expect(approved.status).toBe("approved");
    expect(found?.dreamId).toBe("dream-pending");
    expect(listed.map((entry) => entry.dreamId)).toEqual(["dream-approved"]);
  });

  test("applies canonical dream events into the projection and ignores non-dream events", async () => {
    const entry = makeDreamEntry({ dreamId: "dream-from-event" });
    const event = dreamEvent(entry, "propose");
    const ignored = MemoryEventEnvelope.create({
      machineId: "machine",
      sequence: 2,
      kind: "governance",
      operation: "add",
      occurredAt: new Date("2026-06-07T08:01:00Z"),
      observedAt: new Date("2026-06-07T08:01:00Z"),
      scope: { project: "memory-nexus", visibility: "project" },
      provenance: { source: "test", actor: "memory", method: "test", sourceIds: ["source"] },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
      payload: { governance: { control: "register" } },
    });

    expect(await repo.applyMemoryEvent(ignored)).toBeNull();
    const saved = await repo.applyMemoryEvent(event);
    const found = await repo.findByDreamId("dream-from-event");

    expect(saved?.dreamId).toBe("dream-from-event");
    expect(found?.sourceEventIds).toEqual(["evt-provider-old", "evt-provider-new"]);
  });

  test("clears project and full projection state without touching other projects", async () => {
    await repo.save(makeDreamEntry({ dreamId: "dream-a", project: "memory-nexus" }));
    await repo.save(makeDreamEntry({
      dreamId: "dream-b",
      project: "other",
      proposedFact: {
        uuid: "fact-other-new",
        type: "decision",
        project: "other",
        content: "Other project proposal.",
      },
    }));

    await repo.deleteByProject("memory-nexus");
    expect((await repo.findAll()).map((entry) => entry.dreamId)).toEqual(["dream-b"]);

    await repo.clearAll();
    expect(await repo.findAll()).toEqual([]);
  });

  test("lists by kind with a stable limit and default ordering", async () => {
    await repo.save(makeDreamEntry({
      dreamId: "dream-old",
      updatedAt: new Date("2026-06-07T08:00:00Z"),
    }));
    await repo.save(makeDreamEntry({
      dreamId: "dream-new",
      updatedAt: new Date("2026-06-07T09:00:00Z"),
    }));

    const limited = await repo.findAll({ kind: "supersedence_proposal", limit: 1 });
    const unfiltered = await repo.findAll();

    expect(limited.map((entry) => entry.dreamId)).toEqual(["dream-new"]);
    expect(unfiltered.map((entry) => entry.dreamId)).toEqual(["dream-new", "dream-old"]);
  });

  test("normalizes snake-case audit rows when reading durable state", async () => {
    const entry = makeDreamEntry({ dreamId: "dream-snake-audit" });
    db.prepare(`
      INSERT INTO dream_entries (
        dream_id, schema_version, kind, status, project, visibility,
        source_event_ids, target_fact_uuid, proposed_fact, reason, confidence,
        audit, auto_promoted, rollback_event_kind, applied_event_ids,
        rollback_event_ids, created_at, updated_at, reviewed_at, applied_at,
        rolled_back_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.dreamId,
      entry.schemaVersion,
      entry.kind,
      entry.status,
      entry.project,
      entry.visibility,
      JSON.stringify(entry.sourceEventIds),
      entry.targetFactUuid,
      JSON.stringify(entry.proposedFact),
      entry.reason,
      entry.confidence,
      JSON.stringify({
        redaction_state: "redacted",
        reviewer: "reviewer",
        redacted_fields: ["proposedFact.content"],
        finding_hashes: ["hash-1"],
      }),
      0,
      entry.rollbackEventKind,
      JSON.stringify(entry.appliedEventIds),
      JSON.stringify(entry.rollbackEventIds),
      entry.createdAt.toISOString(),
      entry.updatedAt.toISOString(),
      null,
      null,
      null,
    );

    const found = await repo.findByDreamId("dream-snake-audit");

    expect(found?.audit).toEqual({
      redactionState: "redacted",
      reviewer: "reviewer",
      redactedFields: ["proposedFact.content"],
      findingHashes: ["hash-1"],
    });
  });

  test("rejects malformed dream replay events instead of projecting partial state", async () => {
    const valid = makeDreamEntry({ dreamId: "dream-valid" }).toJSON();
    const invalidEntries = [
      { ...valid, schema_version: 2 },
      { ...valid, dream_id: 42 },
      { ...valid, kind: 42 },
      { ...valid, status: 42 },
      { ...valid, visibility: 42 },
      { ...valid, source_event_ids: "evt" },
      { ...valid, proposed_fact: "fact" },
      { ...valid, audit: "audit" },
      { ...valid, auto_promoted: "false" },
      { ...valid, rollback_event_kind: 42 },
      { ...valid, applied_event_ids: "evt" },
      { ...valid, rollback_event_ids: "evt" },
      { ...valid, created_at: 42 },
      { ...valid, updated_at: 42 },
      { ...valid, audit: { ...valid.audit, redaction_state: 1 } },
      { ...valid, audit: { ...valid.audit, reviewer: 1 } },
      { ...valid, audit: { ...valid.audit, redacted_fields: "field" } },
      { ...valid, audit: { ...valid.audit, finding_hashes: "hash" } },
    ];

    await expect(repo.applyMemoryEvent(dreamEventPayload("bad-payload" as never))).rejects.toThrow("dream payload");
    await expect(repo.applyMemoryEvent(dreamEventPayload({ action: "propose" }))).rejects.toThrow("dream entry");

    for (const entry of invalidEntries) {
      await expect(repo.applyMemoryEvent(dreamEventPayload({ action: "propose", entry }))).rejects.toThrow("dream entry");
    }
    expect(await repo.findAll()).toEqual([]);
  });
});

function makeDreamEntry(overrides: Partial<Parameters<typeof DreamEntry.create>[0]> = {}): DreamEntry {
  const project = overrides.project ?? "memory-nexus";
  return DreamEntry.create({
    dreamId: "dream-provider-registry",
    kind: "supersedence_proposal",
    project,
    visibility: "project",
    sourceEventIds: ["evt-provider-old", "evt-provider-new"],
    targetFactUuid: "fact-provider-old",
    proposedFact: {
      uuid: "fact-provider-new",
      type: "decision",
      project,
      content: "Provider registry is capability-driven.",
    },
    reason: "Newer provider registry decision supersedes the old provider switch note.",
    confidence: 0.91,
    audit: {
      redactionState: "none",
      reviewer: "user",
      redactedFields: [],
      findingHashes: [],
    },
    createdAt: new Date("2026-06-07T08:00:00Z"),
    updatedAt: new Date("2026-06-07T08:00:00Z"),
    ...overrides,
  });
}

function dreamEvent(entry: DreamEntry, action: string): MemoryEventEnvelope {
  return dreamEventPayload({
    action,
    entry: entry.toJSON(),
  });
}

function dreamEventPayload(payload: Record<string, unknown>): MemoryEventEnvelope {
  return MemoryEventEnvelope.create({
    machineId: "machine",
    sequence: 1,
    kind: "dream",
    operation: "add",
    occurredAt: new Date("2026-06-07T08:00:00Z"),
    observedAt: new Date("2026-06-07T08:00:00Z"),
    scope: { project: "memory-nexus", visibility: "project" },
    provenance: {
      source: "memory-dream",
      actor: "memory",
      method: "dream.test",
      sourceIds: ["evt-provider-old"],
    },
    privacy: {
      redactionState: "none",
      containsSensitiveContent: false,
      redactedFields: [],
    },
    consent: { status: "not_required", scopes: [] },
    causality: {
      parentEventIds: ["evt-provider-old"],
      supersedesEventIds: ["fact-provider-old"],
      relatedEventIds: ["fact-provider-new"],
    },
    payload: {
      dream: payload,
    },
  });
}
