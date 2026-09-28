import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Fact } from "../../../src/domain/entities/fact.js";
import { appendEvent, appendMemoryEvent, readMemoryEventsWithReport, rebuildProjections, rebuildProjectionsWithReport } from "../../../src/infrastructure/database/event-log.js";
import type { OperationLease } from "../../../src/domain/ports/operation-admission.js";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { recoverPendingProjections, createProjectedEventWriter } from "../../../src/infrastructure/database/projection-recovery.js";
import { createSourceOperationAdmission } from "../../../src/infrastructure/database/source-operation-admission.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

const fact = (uuid: string) => Fact.create({ uuid, type: "learning", project: "synthetic", content: uuid, observedAt: new Date("2026-01-01T00:00:00Z") });

it("raw append requires admission and accepts only an explicit current source lease", async () => {
  const storage = createOwnedTestDirectory("memory-admitted-writer-");
  try {
    const log = join(storage.dir, "events-a.jsonl");
    await appendEvent(fact("baseline"), log);
    const admission = createSourceOperationAdmission(log), before = readFileSync(log, "utf8");
    await admission.run(async lease => {
      await expect(appendEvent(fact("denied"), log)).rejects.toThrow("busy");
      expect(readFileSync(log, "utf8")).toBe(before);
      await appendEvent(fact("nested"), log, lease);
      expect(readFileSync(log, "utf8").trim().split("\n").length).toBe(2);
    });
    await appendEvent(fact("fresh"), log);
    expect(readFileSync(log, "utf8").trim().split("\n").length).toBe(3);
  } finally { storage.cleanup(); }
});

it("all adopted entrypoints reject wrong-source and expired leases without source or projection mutation", async () => {
  const storage = createOwnedTestDirectory("memory-writer-wrong-authority-");
  const db = new OwnedDatabase(join(storage.dir, "synthetic.db"));
  try {
    createSchema(db);
    const log = join(storage.dir, "events", "events-a.jsonl");
    await appendEvent(fact("baseline"), log); await rebuildProjections(db, log);
    const event = (await readMemoryEventsWithReport(log)).events[0]!;
    const calls = [
      (lease: OperationLease) => appendEvent(fact("denied"), log, lease),
      (lease: OperationLease) => appendMemoryEvent(event, log, lease),
      (lease: OperationLease) => rebuildProjections(db, log, undefined, "explicit", lease),
      (lease: OperationLease) => rebuildProjectionsWithReport(db, log, undefined, "explicit", lease),
      (lease: OperationLease) => recoverPendingProjections(db, log, undefined, lease),
      (lease: OperationLease) => createProjectedEventWriter(db, log, lease)(event),
    ];
    const beforeSource = readFileSync(log, "utf8"), beforeDb = db.serialize();
    await createSourceOperationAdmission(join(storage.dir, "other", "events-b.jsonl")).run(async lease => {
      for (const call of calls) await expect(call(lease)).rejects.toThrow("source authority");
    });
    let stale!: OperationLease;
    await createSourceOperationAdmission(log).run(async lease => { stale = lease; });
    for (const call of calls) await expect(call(stale)).rejects.toThrow("expired");
    expect(readFileSync(log, "utf8")).toBe(beforeSource);
    expect(db.serialize()).toEqual(beforeDb);
  } finally { db.close(); storage.cleanup(); }
});

it("projected writes retain one admission across recovery append and replay", async () => {
  const storage = createOwnedTestDirectory("memory-admitted-projected-");
  const db = new OwnedDatabase(join(storage.dir, "synthetic.db"));
  try {
    createSchema(db);
    const log = join(storage.dir, "events-a.jsonl");
    await appendEvent(fact("baseline"), log); await rebuildProjections(db, log);
    const event = (await readMemoryEventsWithReport(log)).events[0]!;
    let retained: ReturnType<typeof createProjectedEventWriter> | undefined;
    await createSourceOperationAdmission(log).run(async lease => {
      const before = readFileSync(log, "utf8");
      await expect(createProjectedEventWriter(db, log)(event)).rejects.toThrow("busy");
      expect(readFileSync(log, "utf8")).toBe(before);
      retained = createProjectedEventWriter(db, log, lease);
      expect(await retained(event)).toEqual({ projectionCommitted: true });
      expect(await recoverPendingProjections(db, log, undefined, lease)).toEqual({ rebuilt: false, pending: false });
    });
    const before = readFileSync(log, "utf8");
    await expect(retained!(event)).rejects.toThrow("expired");
    expect(readFileSync(log, "utf8")).toBe(before);
    expect(await createProjectedEventWriter(db, log)(event)).toEqual({ projectionCommitted: true });
  } finally { db.close(); storage.cleanup(); }
});

it("replay and recovery share directory admission and delegate nested work", async () => {
  const storage = createOwnedTestDirectory("memory-admitted-replay-");
  const db = new OwnedDatabase(join(storage.dir, "synthetic.db"));
  try {
    createSchema(db);
    const events = join(storage.dir, "events"), log = join(events, "events-a.jsonl");
    await appendEvent(fact("baseline"), log);
    const admission = createSourceOperationAdmission(log), before = db.serialize();
    await admission.run(async lease => {
      await expect(rebuildProjectionsWithReport(db, undefined, events)).rejects.toThrow("busy");
      await expect(recoverPendingProjections(db, undefined, events)).rejects.toThrow("busy");
      expect(db.serialize()).toEqual(before);
      await rebuildProjections(db, undefined, events, "explicit", lease);
      expect(await recoverPendingProjections(db, undefined, events, lease)).toEqual({ rebuilt: false, pending: false });
    });
    await appendEvent(fact("pending"), log);
    expect(await recoverPendingProjections(db, undefined, events)).toEqual({ rebuilt: true, pending: false });
    using rows = db.prepare("SELECT uuid FROM facts ORDER BY uuid");
    expect(rows.all()).toEqual([{ uuid: "baseline" }, { uuid: "pending" }]);
  } finally { db.close(); storage.cleanup(); }
});
