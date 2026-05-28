/**
 * Event-Log SSOT Integration Tests
 *
 * [TDD-RED]
 * Verifies append-only logging, file-writing robustness, database projection replay,
 * and complete database reconstruction from plain-text events.jsonl.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Fact } from "../../../../src/domain/entities/fact.js";
import { createSchema } from "../../../../src/infrastructure/database/schema.js";
import {
  appendEvent,
  readEvents,
  rebuildProjections
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
