import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Fact } from "../../domain/entities/fact.js";
import { DreamEntry } from "../../domain/entities/dream-entry.js";
import { MemoryEventEnvelope } from "../../domain/entities/memory-event.js";
import { createSchema } from "./schema.js";
import { SqliteDreamRepository } from "./repositories/dream-repository.js";
import { SqliteFactRepository } from "./repositories/fact-repository.js";
import {
  appendEvent,
  appendMemoryEvent,
  readEvents,
  rebuildProjectionsWithReport,
} from "./event-log.js";

describe("event-log dream projection", () => {
  let db: Database;
  let logPath: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    logPath = join(tmpdir(), `memory-dream-events-${Math.random().toString(36).slice(2)}.jsonl`);
  });

  afterEach(() => {
    db.close();
    if (existsSync(logPath)) {
      unlinkSync(logPath);
    }
  });

  test("replays dream entries without hidden fact mutation", async () => {
    const original = Fact.create({
      uuid: "fact-provider-old",
      type: "decision",
      project: "memory-nexus",
      content: "Provider health checks enumerate three providers directly.",
      observedAt: new Date("2026-06-07T07:00:00Z"),
    });
    const dream = makeDreamEntry();

    await appendEvent(original, logPath);
    await appendMemoryEvent(dreamEvent(dream), logPath);

    const report = await rebuildProjectionsWithReport(db, logPath);
    const dreamRepo = new SqliteDreamRepository(db);
    const factRepo = new SqliteFactRepository(db);
    const storedDream = await dreamRepo.findByDreamId("dream-provider-registry");
    const storedFact = await factRepo.findByUuid("fact-provider-old");

    expect(report.replay.appliedProjections).toContain("dreams");
    expect(storedDream?.status).toBe("pending_review");
    expect(storedDream?.autoPromoted).toBe(false);
    expect(storedFact?.supersededAt).toBeNull();
    expect(storedFact?.supersededBy).toBeNull();
  });

  test("readEvents compatibility API skips dream and governance events without error noise", async () => {
    await appendMemoryEvent(dreamEvent(makeDreamEntry()), logPath);
    await appendMemoryEvent(governanceEvent(), logPath);
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(" ")); };

    try {
      const facts: Fact[] = [];
      for await (const fact of readEvents(logPath)) {
        facts.push(fact);
      }

      expect(facts).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      console.error = originalError;
    }
  });
});

function makeDreamEntry(): DreamEntry {
  return DreamEntry.create({
    dreamId: "dream-provider-registry",
    kind: "supersedence_proposal",
    project: "memory-nexus",
    visibility: "project",
    sourceEventIds: ["evt-provider-old", "evt-provider-new"],
    targetFactUuid: "fact-provider-old",
    proposedFact: {
      uuid: "fact-provider-new",
      type: "decision",
      project: "memory-nexus",
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
  });
}

function dreamEvent(entry: DreamEntry): MemoryEventEnvelope {
  return MemoryEventEnvelope.create({
    machineId: "machine",
    sequence: 2,
    kind: "dream",
    operation: "add",
    occurredAt: entry.createdAt,
    observedAt: entry.createdAt,
    scope: entry.scope,
    provenance: { source: "memory-dream", actor: "memory", method: "dream.propose", sourceIds: entry.sourceEventIds },
    privacy: { redactionState: entry.audit.redactionState, containsSensitiveContent: false },
    consent: { status: "not_required", scopes: [] },
    causality: {
      parentEventIds: entry.sourceEventIds,
      supersedesEventIds: [entry.targetFactUuid],
      relatedEventIds: [entry.proposedFact.uuid],
    },
    payload: { dream: { action: "propose", entry: entry.toJSON() } },
  });
}

function governanceEvent(): MemoryEventEnvelope {
  return MemoryEventEnvelope.create({
    machineId: "machine",
    sequence: 3,
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
}
