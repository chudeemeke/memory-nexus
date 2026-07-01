/**
 * Event-Log SSOT Integration Tests
 *
 * [TDD-RED]
 * Verifies append-only logging, file-writing robustness, database projection replay,
 * and complete database reconstruction from plain-text events.jsonl.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Fact } from "../../../../src/domain/entities/fact.js";
import { MemoryEventEnvelope } from "../../../../src/domain/entities/memory-event.js";
import { createSchema } from "../../../../src/infrastructure/database/schema.js";
import {
  appendEvent,
  appendMemoryEvent,
  readMemoryEvents,
  readMemoryEventsWithReport,
  readEvents,
  rebuildProjections,
  rebuildProjectionsWithReport
} from "../../../../src/infrastructure/database/event-log.js";

describe("Event-Log SSOT Manager", () => {
  let db: Database;
  let testLogDir: string;
  let testLogPath: string;

  beforeEach(() => {
    // Setup in-memory SQLite database
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);

    // Setup temporary event log directory and file
    testLogDir = join(tmpdir(), `memory-nexus-test-events-${Math.random().toString(36).slice(2)}`);
    if (!existsSync(testLogDir)) {
      mkdirSync(testLogDir, { recursive: true });
    }
    testLogPath = join(testLogDir, "events.jsonl");
  });

  afterEach(() => {
    db.close();
    rmSync(testLogDir, { recursive: true, force: true });
  });

  test("appends serialized Fact to event log", async () => {
    const fact = Fact.create({
      type: "decision",
      project: "memory-nexus",
      content: "Initial decision",
      observedAt: new Date("2026-05-23T08:00:00Z")
    });

    await appendEvent(fact, testLogPath);

    expect(existsSync(testLogPath)).toBe(true);

    const events = [];
    for await (const ev of readEvents(testLogPath)) {
      events.push(ev);
    }

    expect(events.length).toBe(1);
    expect(events[0].uuid).toBe(fact.uuid);
    expect(events[0].type).toBe("decision");
    expect(events[0].project).toBe("memory-nexus");
    expect(events[0].content).toBe("Initial decision");
  });

  test("appendEvent writes v2 envelopes while readEvents preserves Fact compatibility", async () => {
    const fact = Fact.create({
      uuid: "fact-envelope-compat",
      type: "decision",
      project: "memory-nexus",
      content: "Persist v2 envelope",
      metadata: {
        redactionState: "redacted",
        redactedFields: ["content"],
      },
      observedAt: new Date("2026-06-05T08:00:00Z")
    });

    await appendEvent(fact, testLogPath);

    const raw = JSON.parse(readFileSync(testLogPath, "utf-8").trim());
    expect(raw.schemaVersion).toBe(2);
    expect(raw.kind).toBe("decision");
    expect(raw.operation).toBe("add");
    expect(raw.payload.fact.uuid).toBe(fact.uuid);
    expect(raw.privacy.redactionState).toBe("redacted");

    const envelopes = [];
    for await (const memoryEvent of readMemoryEvents(testLogPath)) {
      envelopes.push(memoryEvent);
    }
    expect(envelopes.length).toBe(1);
    expect(envelopes[0].eventId).toBe(fact.uuid);
    expect(envelopes[0].integrity.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    const facts = [];
    for await (const ev of readEvents(testLogPath)) {
      facts.push(ev);
    }
    expect(facts.length).toBe(1);
    expect(facts[0].uuid).toBe(fact.uuid);
    expect(facts[0].content).toBe("Persist v2 envelope");
  });

  test("appendEvent uses explicit machine log identity and fact id sequence without config lookup", async () => {
    const fact = Fact.create({
      uuid: "fact-with-db-id",
      type: "observation",
      project: "memory-nexus",
      content: "Fact with id-backed sequence",
      observedAt: new Date("2026-06-05T08:20:00Z")
    }).withId(123);
    const machineLogPath = join(testLogDir, "events-machine-explicit.jsonl");

    await appendEvent(fact, machineLogPath);

    const raw = JSON.parse(readFileSync(machineLogPath, "utf-8").trim());
    expect(raw.machineId).toBe("machine-explicit");
    expect(raw.sequence).toBe(123);
    expect(raw.payload.fact.id).toBe(123);

    const facts = [];
    for await (const ev of readEvents(machineLogPath)) {
      facts.push(ev);
    }
    expect(facts[0].id).toBe(123);
  });

  test("appendEvent maps privacy metadata into envelope privacy controls", async () => {
    const fact = Fact.create({
      uuid: "fact-with-privacy-metadata",
      type: "learning",
      project: "memory-nexus",
      content: "Privacy metadata is promoted",
      metadata: {
        privacy: {
          redactionState: "quarantined",
          containsSensitiveContent: true,
          redactedFields: ["content"],
        },
      },
      observedAt: new Date("2026-06-05T08:25:00Z")
    });

    await appendEvent(fact, testLogPath);

    const raw = JSON.parse(readFileSync(testLogPath, "utf-8").trim());
    expect(raw.privacy.redactionState).toBe("quarantined");
    expect(raw.privacy.containsSensitiveContent).toBe(true);
    expect(raw.privacy.redactedFields).toEqual(["content"]);
  });

  test("readMemoryEvents adapts legacy v1 fact-shaped records without data loss", async () => {
    writeFileSync(
      testLogPath,
      JSON.stringify({
        uuid: "legacy-redacted-fact",
        type: "learning",
        project: "memory-nexus",
        content: "Legacy fact content",
        metadata: {
          confidence: 0.87,
          redaction: {
            state: "redacted",
            fields: ["content"],
          },
        },
        observedAt: "2026-05-23T08:00:00.000Z",
        supersededAt: null,
        supersededBy: null,
        version: 1,
      }) + "\n"
    );

    const events = [];
    for await (const memoryEvent of readMemoryEvents(testLogPath)) {
      events.push(memoryEvent);
    }

    expect(events.length).toBe(1);
    expect(events[0].schemaVersion).toBe(2);
    expect(events[0].eventId).toBe("legacy-redacted-fact");
    expect(events[0].machineId).toBe("legacy");
    expect(events[0].kind).toBe("learning");
    expect(events[0].operation).toBe("add");
    expect(events[0].privacy.redactionState).toBe("redacted");
    expect(events[0].privacy.redactedFields).toEqual(["content"]);
    expect(events[0].provenance.method).toBe("v1-jsonl-adapter");

    const report = await rebuildProjectionsWithReport(db, testLogPath);
    expect(report.invalidEvents).toBe(0);
    expect(report.replay.processedEvents).toBe(1);

    const row = db.prepare("SELECT * FROM facts WHERE uuid = ?").get("legacy-redacted-fact") as any;
    expect(row.type).toBe("learning");
    expect(row.project).toBe("memory-nexus");
    expect(row.content).toBe("Legacy fact content");
    expect(JSON.parse(row.metadata)).toEqual({
      confidence: 0.87,
      redaction: {
        state: "redacted",
        fields: ["content"],
      },
    });
  });

  test("readMemoryEvents reports invalid legacy records without mutating projections", async () => {
    writeFileSync(
      testLogPath,
      JSON.stringify([]) + "\n" +
        JSON.stringify({
          uuid: "",
          type: "decision",
          project: "memory-nexus",
          content: "Missing uuid",
          observedAt: "2026-05-23T08:00:00.000Z",
          version: 1,
        }) + "\n" +
        JSON.stringify({
          uuid: "invalid-date-fact",
          type: "decision",
          project: "memory-nexus",
          content: "Invalid date",
          observedAt: "not-a-date",
          version: 1,
        }) + "\n" +
        JSON.stringify({
          uuid: "invalid-superseded-at-type",
          type: "decision",
          project: "memory-nexus",
          content: "Invalid supersededAt type",
          observedAt: "2026-05-23T08:00:00.000Z",
          supersededAt: 123,
          version: 1,
        }) + "\n" +
        JSON.stringify({
          uuid: "invalid-superseded-at-date",
          type: "decision",
          project: "memory-nexus",
          content: "Invalid supersededAt date",
          observedAt: "2026-05-23T08:00:00.000Z",
          supersededAt: "not-a-date",
          version: 1,
        }) + "\n"
    );

    const report = await readMemoryEventsWithReport(testLogPath);

    expect(report.events).toEqual([]);
    expect(report.invalidEvents.length).toBe(5);
    expect(report.invalidEvents.map((event) => event.reason)).toEqual([
      "Legacy event record must be an object",
      "Legacy event uuid is required",
      "observedAt must be a valid date",
      "supersededAt must be a string or null",
      "supersededAt must be a valid date",
    ]);
  });

  test("legacy v1 migration preserves explicit sequence and supersedence fields", async () => {
    writeFileSync(
      testLogPath,
      JSON.stringify({
        uuid: "legacy-original",
        type: "learning",
        project: "memory-nexus",
        content: "Legacy original",
        observedAt: "2026-05-23T08:00:00.000Z",
        version: 1,
      }) + "\n" +
        JSON.stringify({
          uuid: "legacy-replacement",
          type: "learning",
          project: "memory-nexus",
          content: "Legacy replacement",
          observedAt: "2026-05-23T09:00:00.000Z",
          supersededAt: "2026-05-23T10:00:00.000Z",
          supersededBy: "future-fact",
          version: 1,
        }) + "\n" +
        JSON.stringify({
          uuid: "legacy-supersedence",
          type: "supersedence",
          project: "memory-nexus",
          content: "Legacy supersedence",
          metadata: {
            superseded_uuid: "legacy-original",
            superseded_by_uuid: "legacy-replacement",
            redaction: {
              state: "redacted",
              fields: ["content"],
              policy: "legacy-policy",
            },
          },
          observedAt: "2026-05-23T10:00:00.000Z",
          sequence: 77,
          version: 1,
        }) + "\n"
    );

    const events = [];
    for await (const memoryEvent of readMemoryEvents(testLogPath)) {
      events.push(memoryEvent);
    }

    expect(events[2].sequence).toBe(77);
    expect(events[2].operation).toBe("supersede");
    expect(events[2].privacy.policy).toBe("legacy-policy");
    expect(events[2].causality.supersedesEventIds).toEqual(["legacy-original"]);
    expect(events[2].causality.relatedEventIds).toEqual(["legacy-replacement"]);

    await rebuildProjections(db, testLogPath);
    const original = db.prepare("SELECT * FROM facts WHERE uuid = ?").get("legacy-original") as any;
    const replacement = db.prepare("SELECT * FROM facts WHERE uuid = ?").get("legacy-replacement") as any;
    expect(original.superseded_by).toBe("legacy-replacement");
    expect(replacement.superseded_at).toBe("2026-05-23T10:00:00.000Z");
    expect(replacement.superseded_by).toBe("future-fact");
  });

  test("appendMemoryEvent persists explicit v2 events that project to facts", async () => {
    const memoryEvent = MemoryEventEnvelope.create({
      eventId: "33333333-3333-4333-8333-333333333333",
      machineId: "machine-explicit",
      sequence: 1,
      kind: "observation",
      operation: "add",
      occurredAt: new Date("2026-06-05T08:15:00Z"),
      observedAt: new Date("2026-06-05T08:15:00Z"),
      scope: { project: "memory-nexus", visibility: "project" },
      provenance: { source: "test", actor: "test", method: "fixture" },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
      payload: {
        fact: {
          uuid: "explicit-v2-fact",
          type: "observation",
          project: "memory-nexus",
          content: "Explicit v2 fact payload",
          observedAt: "2026-06-05T08:15:00.000Z",
        },
      },
    });

    await appendMemoryEvent(memoryEvent, testLogPath);

    const facts = [];
    for await (const ev of readEvents(testLogPath)) {
      facts.push(ev);
    }

    expect(facts.length).toBe(1);
    expect(facts[0].uuid).toBe("explicit-v2-fact");
    expect(facts[0].content).toBe("Explicit v2 fact payload");
  });

  test("v2 fact projection falls back to event metadata when payload omits optional fact fields", async () => {
    const memoryEvent = MemoryEventEnvelope.create({
      eventId: "44444444-4444-4444-8444-444444444444",
      machineId: "machine-fallback",
      sequence: 1,
      kind: "decision",
      operation: "add",
      occurredAt: new Date("2026-06-05T08:30:00Z"),
      observedAt: new Date("2026-06-05T08:30:00Z"),
      scope: { project: "fallback-project", visibility: "project" },
      provenance: { source: "test", actor: "test", method: "fixture" },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
      payload: {
        fact: {
          uuid: "fallback-fact",
          content: "Fallback fact payload",
        },
      },
    });

    await appendMemoryEvent(memoryEvent, testLogPath);

    const facts = [];
    for await (const ev of readEvents(testLogPath)) {
      facts.push(ev);
    }

    expect(facts[0].type).toBe("decision");
    expect(facts[0].project).toBe("fallback-project");
    expect(facts[0].observedAt.toISOString()).toBe("2026-06-05T08:30:00.000Z");
    expect(facts[0].supersededAt).toBeNull();
    expect(facts[0].supersededBy).toBeNull();
  });

  test("readEvents skips valid non-fact v2 records without treating them as malformed", async () => {
    const memoryEvent = MemoryEventEnvelope.create({
      eventId: "55555555-5555-4555-8555-555555555555",
      machineId: "machine-no-fact",
      sequence: 1,
      kind: "governance",
      operation: "add",
      occurredAt: new Date("2026-06-05T08:35:00Z"),
      observedAt: new Date("2026-06-05T08:35:00Z"),
      scope: { visibility: "global" },
      provenance: { source: "test", actor: "test", method: "fixture" },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
      payload: {
        governance: {
          action: "noop",
        },
      },
    });
    const originalConsoleError = console.error;
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    try {
      await appendMemoryEvent(memoryEvent, testLogPath);
      const facts = [];
      for await (const ev of readEvents(testLogPath)) {
        facts.push(ev);
      }

      expect(facts).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("readEvents reports invalid v2 fact payload field types", async () => {
    const memoryEvent = MemoryEventEnvelope.create({
      eventId: "66666666-6666-4666-8666-666666666666",
      machineId: "machine-invalid-payload",
      sequence: 1,
      kind: "decision",
      operation: "add",
      occurredAt: new Date("2026-06-05T08:40:00Z"),
      observedAt: new Date("2026-06-05T08:40:00Z"),
      scope: { project: "memory-nexus", visibility: "project" },
      provenance: { source: "test", actor: "test", method: "fixture" },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
      payload: {
        fact: {
          uuid: 123,
          content: "Invalid uuid type",
        },
      },
    });
    const originalConsoleError = console.error;
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    try {
      await appendMemoryEvent(memoryEvent, testLogPath);
      const facts = [];
      for await (const ev of readEvents(testLogPath)) {
        facts.push(ev);
      }

      expect(facts).toEqual([]);
      expect(String(errors[0]?.[1])).toContain("uuid must be a string");
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("rebuildProjectionsWithReport reports invalid lines, sorts replay, and skips duplicate event ids", async () => {
    const late = MemoryEventEnvelope.create({
      eventId: "22222222-2222-4222-8222-222222222222",
      machineId: "machine-b",
      sequence: 2,
      kind: "decision",
      operation: "add",
      occurredAt: new Date("2026-06-05T09:00:00Z"),
      observedAt: new Date("2026-06-05T09:00:00Z"),
      scope: { project: "memory-nexus", visibility: "project" },
      provenance: { source: "test", actor: "test", method: "fixture" },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
      payload: {
        fact: {
          uuid: "late-fact",
          type: "decision",
          project: "memory-nexus",
          content: "Late fact",
          observedAt: "2026-06-05T09:00:00.000Z",
        },
      },
    });
    const early = MemoryEventEnvelope.create({
      eventId: "11111111-1111-4111-8111-111111111111",
      machineId: "machine-a",
      sequence: 1,
      kind: "decision",
      operation: "add",
      occurredAt: new Date("2026-06-05T08:00:00Z"),
      observedAt: new Date("2026-06-05T08:00:00Z"),
      scope: { project: "memory-nexus", visibility: "project" },
      provenance: { source: "test", actor: "test", method: "fixture" },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
      payload: {
        fact: {
          uuid: "early-fact",
          type: "decision",
          project: "memory-nexus",
          content: "Early fact",
          observedAt: "2026-06-05T08:00:00.000Z",
        },
      },
    });

    writeFileSync(
      testLogPath,
      JSON.stringify(late.toJSON()) + "\n" +
        "not-json\n" +
        JSON.stringify(early.toJSON()) + "\n" +
        JSON.stringify(early.toJSON()) + "\n"
    );

    const report = await rebuildProjectionsWithReport(db, testLogPath);

    expect(report.invalidEvents).toBe(1);
    expect(report.replay.processedEvents).toBe(2);
    expect(report.replay.skippedDuplicateEvents).toBe(1);
    expect(report.replay.appliedProjections).toEqual(["facts"]);

    const rows = db.prepare("SELECT * FROM facts ORDER BY observed_at ASC").all() as any[];
    expect(rows.map((row) => row.content)).toEqual(["Early fact", "Late fact"]);
  });

  test("rebuildProjections creates governance provenance entries for fact events", async () => {
    const fact = Fact.create({
      uuid: "governed-fact",
      type: "learning",
      project: "memory-nexus",
      content: "Governed fact",
      metadata: { confidence: 0.82 },
      observedAt: new Date("2026-06-06T08:00:00Z"),
    });

    await appendEvent(fact, testLogPath);
    await rebuildProjections(db, testLogPath);

    const row = db.prepare("SELECT * FROM memory_governance WHERE surface = ? AND target_id = ?")
      .get("fact", "governed-fact") as any;

    expect(row.project).toBe("memory-nexus");
    expect(row.transformation_method).toBe("appendEvent");
    expect(row.confidence).toBe(0.82);
    expect(row.status).toBe("active");
    expect(JSON.parse(row.source_event_ids)).toEqual(["governed-fact"]);
  });

  test("rebuildProjections creates persona projection entries for persona-worthy fact events", async () => {
    const fact = Fact.create({
      uuid: "persona-fact",
      type: "preference",
      project: "memory-nexus",
      content: "Prefer durable disk artifacts for continuity work.",
      metadata: { confidence: 0.91, source_kind: "preference" },
      observedAt: new Date("2026-06-06T08:00:00Z"),
    });

    await appendEvent(fact, testLogPath);
    const report = await rebuildProjectionsWithReport(db, testLogPath);

    const persona = db.prepare("SELECT * FROM persona_entries WHERE entry_id LIKE ?")
      .get("persona-preference-%") as any;
    const governance = db.prepare("SELECT * FROM memory_governance WHERE surface = ? AND target_id = ?")
      .get("persona", persona.entry_id) as any;

    expect(report.replay.appliedProjections).toContain("persona");
    expect(persona.content).toBe("Prefer durable disk artifacts for continuity work.");
    expect(persona.project).toBe("memory-nexus");
    expect(JSON.parse(persona.source_event_ids)).toEqual(["persona-fact"]);
    expect(governance.transformation_method).toBe("persona-event-projection");
    expect(governance.confidence).toBe(0.91);
  });

  test("rebuildProjections creates graph edges and governance from fact graph metadata", async () => {
    const fact = Fact.create({
      uuid: "graph-fact",
      type: "decision",
      project: "memory-nexus",
      content: "authkey remains optional capability injection for memory.",
      metadata: {
        confidence: 0.92,
        graph_edges: [
          {
            id: "memory-authkey-graph",
            source: { type: "tool", id: "memory", label: "memory" },
            target: { type: "capability", id: "authkey", label: "authkey" },
            relationship: "optional-capability-provider",
            confidence: 0.92,
            validFrom: "2026-05-27T00:00:00.000Z",
            why: "Derived from the optional capability interop decision.",
          },
        ],
      },
      observedAt: new Date("2026-06-06T08:00:00Z"),
    });

    await appendEvent(fact, testLogPath);
    const report = await rebuildProjectionsWithReport(db, testLogPath);

    const edge = db.prepare("SELECT * FROM graph_edges WHERE edge_id = ?")
      .get("memory-authkey-graph") as any;
    const governance = db.prepare("SELECT * FROM memory_governance WHERE surface = ? AND target_id = ?")
      .get("graph", "memory-authkey-graph") as any;

    expect(report.replay.appliedProjections).toContain("graph");
    expect(edge.project).toBe("memory-nexus");
    expect(edge.relationship).toBe("optional-capability-provider");
    expect(edge.confidence).toBe(0.92);
    expect(JSON.parse(edge.source_event_ids)).toEqual(["graph-fact"]);
    expect(governance.transformation_method).toBe("graph-event-projection");
    expect(governance.confidence).toBe(0.92);
  });

  test("rebuildProjections applies governance controls after fact registration", async () => {
    const fact = Fact.create({
      uuid: "suppressed-governed-fact",
      type: "decision",
      project: "memory-nexus",
      content: "Suppressed fact",
      observedAt: new Date("2026-06-06T08:00:00Z"),
    });
    const control = MemoryEventEnvelope.create({
      eventId: "governance-suppress-event",
      machineId: "machine-governance",
      sequence: 2,
      kind: "governance",
      operation: "update",
      occurredAt: new Date("2026-06-06T09:00:00Z"),
      observedAt: new Date("2026-06-06T09:00:00Z"),
      scope: { project: "memory-nexus", visibility: "project" },
      provenance: { source: "cli", actor: "user", method: "governance.suppress" },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: [fact.uuid], supersedesEventIds: [], relatedEventIds: [fact.uuid] },
      payload: {
        governance: {
          control: "suppress",
          surface: "fact",
          targetId: fact.uuid,
          reason: "user suppressed",
        },
      },
    });

    await appendEvent(fact, testLogPath);
    await appendMemoryEvent(control, testLogPath);
    const report = await rebuildProjectionsWithReport(db, testLogPath);

    const row = db.prepare("SELECT * FROM memory_governance WHERE surface = ? AND target_id = ?")
      .get("fact", fact.uuid) as any;
    const audit = db.prepare("SELECT * FROM memory_governance_events WHERE event_id = ?")
      .get("governance-suppress-event") as any;

    expect(report.replay.appliedProjections).toEqual(["facts", "memory_governance"]);
    expect(row.status).toBe("suppressed");
    expect(row.status_reason).toBe("user suppressed");
    expect(audit.control).toBe("suppress");
  });

  test("rebuildProjectionsWithReport sorts same-time events by sequence before event id", async () => {
    const first = MemoryEventEnvelope.create({
      eventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      machineId: "machine-sort",
      sequence: 1,
      kind: "decision",
      operation: "add",
      occurredAt: new Date("2026-06-05T09:30:00Z"),
      observedAt: new Date("2026-06-05T09:30:00Z"),
      scope: { project: "memory-nexus", visibility: "project" },
      provenance: { source: "test", actor: "test", method: "fixture" },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
      payload: {
        fact: {
          uuid: "sequence-first",
          type: "decision",
          project: "memory-nexus",
          content: "Sequence first",
          observedAt: "2026-06-05T09:30:00.000Z",
        },
      },
    });
    const second = MemoryEventEnvelope.create({
      eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      machineId: "machine-sort",
      sequence: 2,
      kind: "decision",
      operation: "add",
      occurredAt: new Date("2026-06-05T09:30:00Z"),
      observedAt: new Date("2026-06-05T09:30:00Z"),
      scope: { project: "memory-nexus", visibility: "project" },
      provenance: { source: "test", actor: "test", method: "fixture" },
      privacy: { redactionState: "none", containsSensitiveContent: false },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
      payload: {
        fact: {
          uuid: "sequence-second",
          type: "decision",
          project: "memory-nexus",
          content: "Sequence second",
          observedAt: "2026-06-05T09:30:00.000Z",
        },
      },
    });

    writeFileSync(testLogPath, JSON.stringify(second.toJSON()) + "\n" + JSON.stringify(first.toJSON()) + "\n");

    await rebuildProjectionsWithReport(db, testLogPath);

    const rows = db.prepare("SELECT * FROM facts ORDER BY id ASC").all() as any[];
    expect(rows.map((row) => row.content)).toEqual(["Sequence first", "Sequence second"]);
  });

  test("rebuilds database facts projection perfectly from event log", async () => {
    // 1. Create 5 sample facts
    const facts = Array.from({ length: 5 }).map((_, i) =>
      Fact.create({
        type: i % 2 === 0 ? "learning" : "preference",
        project: `project-${i}`,
        content: `Fact content ${i}`,
        metadata: { index: i },
        observedAt: new Date(`2026-05-23T08:0${i}:00Z`)
      })
    );

    // Append all to event log
    for (const f of facts) {
      await appendEvent(f, testLogPath);
    }

    // 2. Playback/rebuild projections into SQLite
    await rebuildProjections(db, testLogPath);

    // 3. Verify in-memory facts table
    const dbFacts = db.prepare("SELECT * FROM facts ORDER BY id ASC").all() as any[];
    expect(dbFacts.length).toBe(5);

    for (let i = 0; i < 5; i++) {
      expect(dbFacts[i].uuid).toBe(facts[i]!.uuid);
      expect(dbFacts[i].type).toBe(facts[i]!.type);
      expect(dbFacts[i].project).toBe(facts[i]!.project);
      expect(dbFacts[i].content).toBe(facts[i]!.content);
      expect(JSON.parse(dbFacts[i].metadata)).toEqual({ index: i });
      expect(dbFacts[i].observed_at).toBe(facts[i]!.observedAt.toISOString());
    }

    // Wipe/simulate data corruption
    db.run("DELETE FROM facts;");
    const wipedCount = db.prepare("SELECT COUNT(*) as count FROM facts").get() as { count: number };
    expect(wipedCount.count).toBe(0);

    // 4. Replay from the events.jsonl file
    await rebuildProjections(db, testLogPath);

    // 5. Assert database and FTS are reconstructed perfectly
    const postRebuildCount = db.prepare("SELECT COUNT(*) as count FROM facts").get() as { count: number };
    expect(postRebuildCount.count).toBe(5);

    const postRebuildFts = db.prepare("SELECT * FROM facts_fts WHERE facts_fts MATCH ?").all("content") as any[];
    expect(postRebuildFts.length).toBe(5);
  });

  test("skips malformed json lines on readEvents gracefully", async () => {
    const fact1 = Fact.create({
      type: "decision",
      project: "memory-nexus",
      content: "Valid 1",
      observedAt: new Date()
    });
    const fact2 = Fact.create({
      type: "decision",
      project: "memory-nexus",
      content: "Valid 2",
      observedAt: new Date()
    });

    await appendEvent(fact1, testLogPath);
    appendFileSync(testLogPath, "this is not json at all!!!\n");
    await appendEvent(fact2, testLogPath);

    const events = [];
    for await (const ev of readEvents(testLogPath)) {
      events.push(ev);
    }

    expect(events.length).toBe(2);
    expect(events[0].content).toBe("Valid 1");
    expect(events[1].content).toBe("Valid 2");
  });

  test("readEvents returns no events for a missing explicit log file", async () => {
    const events: Fact[] = [];
    for await (const ev of readEvents(join(testLogDir, "missing-events.jsonl"))) {
      events.push(ev);
    }

    expect(events).toEqual([]);
  });

  test("readEvents skips blank lines and reports malformed lines without aborting", async () => {
    const validFact = Fact.create({
      type: "learning",
      project: "memory-nexus",
      content: "Valid event after malformed line",
      observedAt: new Date("2026-05-23T10:00:00Z")
    });
    const originalConsoleError = console.error;
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    try {
      writeFileSync(
        testLogPath,
        "\n   \n" +
          "not-json\n" +
          JSON.stringify({
            uuid: validFact.uuid,
            type: validFact.type,
            project: validFact.project,
            content: validFact.content,
            observedAt: validFact.observedAt.toISOString(),
            version: 1
          }) +
          "\n"
      );

      const events: Fact[] = [];
      for await (const ev of readEvents(testLogPath)) {
        events.push(ev);
      }

      expect(events.map((event) => event.content)).toEqual(["Valid event after malformed line"]);
      expect(errors.length).toBe(1);
      expect(errors[0]![0]).toBe("Skipping malformed event log line:");
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("rebuildProjections processes supersedence events correctly", async () => {
    // 1. Create a fact event
    const originalFact = Fact.create({
      uuid: "original-fact-uuid-123",
      type: "learning",
      project: "memory-nexus",
      content: "Original fact content",
      observedAt: new Date("2026-05-23T08:00:00Z")
    });

    // 2. Create the replacement fact event
    const replacementFact = Fact.create({
      uuid: "replacement-fact-uuid-456",
      type: "learning",
      project: "memory-nexus",
      content: "Updated/superseding fact content",
      observedAt: new Date("2026-05-23T09:00:00Z")
    });

    // 3. Create the supersedence event
    const supersedenceFact = Fact.create({
      uuid: "supersedence-event-uuid-789",
      type: "supersedence",
      project: "memory-nexus",
      content: "Superseded original-fact-uuid-123 by replacement-fact-uuid-456",
      metadata: {
        superseded_uuid: "original-fact-uuid-123",
        superseded_by_uuid: "replacement-fact-uuid-456"
      },
      observedAt: new Date("2026-05-23T09:00:00Z")
    });

    // Append all events to event log
    await appendEvent(originalFact, testLogPath);
    await appendEvent(replacementFact, testLogPath);
    await appendEvent(supersedenceFact, testLogPath);

    // Rebuild projections
    await rebuildProjections(db, testLogPath);

    // Assert original fact has superseded_at and superseded_by fields correctly set!
    const originalDb = db.prepare("SELECT * FROM facts WHERE uuid = ?").get(originalFact.uuid) as any;
    expect(originalDb).toBeDefined();
    expect(originalDb.superseded_at).toBe(supersedenceFact.observedAt.toISOString());
    expect(originalDb.superseded_by).toBe(replacementFact.uuid);

    // Assert replacement fact is active
    const replacementDb = db.prepare("SELECT * FROM facts WHERE uuid = ?").get(replacementFact.uuid) as any;
    expect(replacementDb).toBeDefined();
    expect(replacementDb.superseded_at).toBeNull();
    expect(replacementDb.superseded_by).toBeNull();
  });

  test("rebuildProjections preserves incomplete supersedence events without mutating active facts", async () => {
    const originalFact = Fact.create({
      uuid: "active-fact-without-complete-supersedence",
      type: "learning",
      project: "memory-nexus",
      content: "Still active because supersedence metadata is incomplete",
      observedAt: new Date("2026-05-23T08:00:00Z")
    });
    const incompleteSupersedence = Fact.create({
      uuid: "incomplete-supersedence-event",
      type: "supersedence",
      project: "memory-nexus",
      content: "Incomplete supersedence must remain auditable but not mutate projection",
      metadata: {
        superseded_uuid: originalFact.uuid
      },
      observedAt: new Date("2026-05-23T09:00:00Z")
    });

    await appendEvent(originalFact, testLogPath);
    await appendEvent(incompleteSupersedence, testLogPath);

    await rebuildProjections(db, testLogPath);

    const originalDb = db.prepare("SELECT * FROM facts WHERE uuid = ?").get(originalFact.uuid) as any;
    const supersedenceDb = db.prepare("SELECT * FROM facts WHERE uuid = ?").get(incompleteSupersedence.uuid) as any;
    expect(originalDb.superseded_at).toBeNull();
    expect(originalDb.superseded_by).toBeNull();
    expect(supersedenceDb).toBeDefined();
  });

  test("readEvents streams and chronologically sorts records across multiple different simulated machine logs", async () => {
    const paths = require("../../../../src/infrastructure/paths.js");
    
    const originalXdg = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = testLogDir;

    try {
      const eventsDir = paths.getEventsDir();
      if (!existsSync(eventsDir)) {
        mkdirSync(eventsDir, { recursive: true });
      }

      // Write two machine logs and a legacy log with events that are not in chronological order
      const factEarly = Fact.create({
        type: "decision",
        project: "memory-nexus",
        content: "Early event",
        observedAt: new Date("2026-05-23T07:00:00Z")
      });

      const factMid = Fact.create({
        type: "learning",
        project: "memory-nexus",
        content: "Mid event",
        observedAt: new Date("2026-05-23T08:00:00Z")
      });

      const factLate = Fact.create({
        type: "preference",
        project: "memory-nexus",
        content: "Late event",
        observedAt: new Date("2026-05-23T09:00:00Z")
      });

      // Write factMid to events-machine1.jsonl
      writeFileSync(
        join(eventsDir, "events-machine1.jsonl"),
        JSON.stringify({
          uuid: factMid.uuid,
          type: factMid.type,
          project: factMid.project,
          content: factMid.content,
          observedAt: factMid.observedAt.toISOString(),
          version: 1
        }) + "\n"
      );

      // Write factEarly to events-machine2.jsonl
      writeFileSync(
        join(eventsDir, "events-machine2.jsonl"),
        JSON.stringify({
          uuid: factEarly.uuid,
          type: factEarly.type,
          project: factEarly.project,
          content: factEarly.content,
          observedAt: factEarly.observedAt.toISOString(),
          version: 1
        }) + "\n"
      );

      // Write factLate to events.jsonl (legacy)
      writeFileSync(
        join(eventsDir, "events.jsonl"),
        JSON.stringify({
          uuid: factLate.uuid,
          type: factLate.type,
          project: factLate.project,
          content: factLate.content,
          observedAt: factLate.observedAt.toISOString(),
          version: 1
        }) + "\n"
      );

      // Call readEvents with no logPath parameter, but pass eventsDir override to isolate it!
      const events: Fact[] = [];
      for await (const fact of readEvents(undefined, eventsDir)) {
        events.push(fact);
      }


      // Assert they are sorted: Early, Mid, Late
      expect(events.length).toBe(3);
      expect(events[0].content).toBe("Early event");
      expect(events[1].content).toBe("Mid event");
      expect(events[2].content).toBe("Late event");

    } finally {
      if (originalXdg) {
        process.env.XDG_DATA_HOME = originalXdg;
      } else {
        delete process.env.XDG_DATA_HOME;
      }
    }
  });

  test("readEvents breaks same-timestamp ties by uuid for deterministic cross-machine replay", async () => {
    const eventsDir = join(testLogDir, "events");
    mkdirSync(eventsDir, { recursive: true });
    const observedAt = "2026-05-23T08:00:00.000Z";

    writeFileSync(
      join(eventsDir, "events-machine-b.jsonl"),
      JSON.stringify({
        uuid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        type: "decision",
        project: "memory-nexus",
        content: "Second by uuid",
        observedAt,
        version: 1
      }) + "\n"
    );
    writeFileSync(
      join(eventsDir, "events-machine-a.jsonl"),
      JSON.stringify({
        uuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        type: "decision",
        project: "memory-nexus",
        content: "First by uuid",
        observedAt,
        version: 1
      }) + "\n"
    );

    const events: Fact[] = [];
    for await (const fact of readEvents(undefined, eventsDir)) {
      events.push(fact);
    }

    expect(events.map((event) => event.content)).toEqual(["First by uuid", "Second by uuid"]);
  });
});
