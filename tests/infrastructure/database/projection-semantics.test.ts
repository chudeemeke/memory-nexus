import { describe, expect, it } from "bun:test";
import { existsSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { rebuildProjectionsWithReport, appendMemoryEvent } from "../../../src/infrastructure/database/event-log.js";
import { MemoryEventEnvelope, type MemoryEventKind, type MemoryEventOperation } from "../../../src/domain/entities/memory-event.js";
import { executeProjectionsRebuildCommand } from "../../../src/presentation/cli/commands/projections.js";
import { captureStreams } from "../../helpers/capture-json.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

const legacy = { uuid: "same", type: "learning", project: "synthetic", content: "retainedneedle", observedAt: "2026-01-01T00:00:00Z" };
function event(kind: MemoryEventKind, payload: Record<string, unknown>, operation: MemoryEventOperation = "add", machineId = "synthetic") {
  const time = new Date("2026-01-01T00:00:00Z");
  return MemoryEventEnvelope.create({ eventId: "same", machineId, sequence: 1, kind, operation, occurredAt: time, observedAt: time,
    scope: { project: "synthetic", visibility: "project" }, provenance: { source: "test", actor: "test", method: "fixture" },
    privacy: { redactionState: "none", containsSensitiveContent: false }, consent: { status: "not_required", scopes: [] },
    causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] }, payload });
}
async function fixture(run: (db: OwnedDatabase, log: string, dir: string, target: string) => Promise<void>) {
  const storage = createOwnedTestDirectory("memory-projection-semantics-"), db = new OwnedDatabase(":memory:");
  try {
    createSchema(db); db.exec("INSERT INTO facts(uuid,type,project,content,observed_at) VALUES('retained','learning','synthetic','retainedneedle','synthetic')");
    await run(db, join(storage.dir, "events-one.jsonl"), storage.dir, join(storage.dir, "target.db"));
  } finally { db.close(); storage.cleanup(); }
}
describe("semantic projection admission", () => {
  for (const input of [
    event("learning", {}), event("governance", {}), event("governance", { governance: { control: "suppress" } }),
    event("dream", { dream: {} }), event("privacy", {}), event("projection", {}),
    ...(["delete", "noop", "migrate"] as const).map(op => event("learning", { fact: legacy }, op)),
  ]) {
    it(`refuses unprojectable ${input.kind}/${input.operation} in verify and rebuild`, async () => {
      await fixture(async (db, log, dir, target) => {
        await appendMemoryEvent(input, log); const before = db.serialize();
        const verified = await captureStreams(() => executeProjectionsRebuildCommand({ eventsDirOverride: dir, dbPathOverride: target }, { verify: true, json: true }));
        expect(verified.exitCode).toBe(1); expect(JSON.parse(verified.stdout).data.ready).toBe(false);
        expect(existsSync(target)).toBe(false);
        await expect(rebuildProjectionsWithReport(db, log)).rejects.toThrow("source cannot be replayed");
        expect(db.serialize().equals(before)).toBe(true);
      });
    });
  }
  for (const conflict of ["content", "provenance", "legacy"]) {
    it(`refuses conflicting ${conflict} under the same event ID`, async () => {
      await fixture(async (db, log, dir, target) => {
        if (conflict === "legacy") writeFileSync(log, [legacy, { ...legacy, content: "conflictneedle" }].map(x => JSON.stringify(x)).join("\n"));
        else {
          await appendMemoryEvent(event("learning", { fact: legacy }), log);
          await appendMemoryEvent(event("learning", { fact: { ...legacy, content: conflict === "content" ? "conflictneedle" : legacy.content } }, "add", conflict === "provenance" ? "different" : "synthetic"), log);
        }
        const before = db.serialize(), report = await rebuildProjectionsWithReport(db, log);
        expect(report.invalidEvents).toBe(1); expect(report.replay.processedEvents).toBe(0); expect(db.serialize().equals(before)).toBe(true);
        const verified = await captureStreams(() => executeProjectionsRebuildCommand({ eventsDirOverride: dir, dbPathOverride: target }, { verify: true, json: true }));
        expect(verified.exitCode).toBe(1); expect(JSON.parse(verified.stdout).data.ready).toBe(false);
        expect(verified.stdout + verified.stderr).not.toContain("conflictneedle");
      });
    });
  }
  it("keeps identical legacy duplicates idempotent across generated machine and line metadata", async () => {
    await fixture(async (db, log, dir) => {
      writeFileSync(log, JSON.stringify(legacy) + "\n");
      writeFileSync(join(dir, "events-two.jsonl"), "\n\n" + JSON.stringify(legacy) + "\n");
      const report = await rebuildProjectionsWithReport(db, undefined, dir);
      expect(report.invalidEvents).toBe(0); expect(report.replay.processedEvents).toBe(1); expect(report.replay.skippedDuplicateEvents).toBe(1);
    });
  });
  it("keeps identical v2 duplicates idempotent", async () => {
    await fixture(async (db, log) => {
      const input = event("learning", { fact: legacy });
      await appendMemoryEvent(input, log); await appendMemoryEvent(input, log);
      const report = await rebuildProjectionsWithReport(db, log);
      expect(report.replay.processedEvents).toBe(1); expect(report.replay.skippedDuplicateEvents).toBe(1);
    });
  });
  it("retains explicit legacy sequence differences as conflicting identities", async () => {
    await fixture(async (db, log) => {
      writeFileSync(log, [1, 2].map(sequence => JSON.stringify({ ...legacy, sequence })).join("\n"));
      const before = db.serialize(), report = await rebuildProjectionsWithReport(db, log);
      expect(report.invalidEvents).toBe(1); expect(report.replay.processedEvents).toBe(0);
      expect(db.serialize().equals(before)).toBe(true);
    });
  });
  for (const manifest of ["invalid", "null", "{}", JSON.stringify({ version: 1, scope: { kind: "directory", path: "synthetic" }, files: [] })]) {
    it(`refuses a corrupt prior receipt (${manifest}) without modifying projections`, async () => {
      await fixture(async (db, log, dir, target) => {
        writeFileSync(log, JSON.stringify(legacy));
        using receipt = db.prepare("INSERT INTO projection_replay_state(id,manifest) VALUES(1,?)");
        receipt.run(manifest); const before = db.serialize(); writeFileSync(target, before);
        await expect(rebuildProjectionsWithReport(db, log)).rejects.toThrow("receipt is invalid");
        expect(db.serialize().equals(before)).toBe(true);
        const verified = await captureStreams(() => executeProjectionsRebuildCommand({ eventsDirOverride: dir, dbPathOverride: target }, { verify: true, json: true }));
        expect(verified.exitCode).toBe(1); expect(JSON.parse(verified.stdout).data.ready).toBe(false);
      });
    });
  }
  it("refuses a single file that omits sibling canonical logs", async () => {
    await fixture(async (db, log, dir) => {
      writeFileSync(log, JSON.stringify(legacy)); writeFileSync(join(dir, "events-two.jsonl"), "");
      const before = db.serialize();
      await expect(rebuildProjectionsWithReport(db, log)).rejects.toThrow("source selection"); expect(db.serialize().equals(before)).toBe(true);
      expect((await rebuildProjectionsWithReport(db, undefined, dir)).replay.processedEvents).toBe(1);
    });
  });
  it("refuses missing prior files and directory authority narrowing, but permits file-to-directory widening", async () => {
    await fixture(async (db, log, dir) => {
      writeFileSync(log, JSON.stringify(legacy)); await rebuildProjectionsWithReport(db, log);
      await rebuildProjectionsWithReport(db, undefined, dir); const before = db.serialize();
      await expect(rebuildProjectionsWithReport(db, log)).rejects.toThrow("source authority"); expect(db.serialize().equals(before)).toBe(true);
      unlinkSync(log); writeFileSync(join(dir, "events-two.jsonl"), JSON.stringify(legacy));
      await expect(rebuildProjectionsWithReport(db, undefined, dir)).rejects.toThrow("previously applied"); expect(db.serialize().equals(before)).toBe(true);
    });
  });
  it("verifies existing target authority read-only and rejects a different source directory", async () => {
    await fixture(async (db, log, dir, target) => {
      writeFileSync(log, JSON.stringify(legacy)); await rebuildProjectionsWithReport(db, undefined, dir); writeFileSync(target, db.serialize());
      const alternate = join(dir, "alternate"); mkdirSync(alternate); writeFileSync(join(alternate, "events.jsonl"), JSON.stringify(legacy));
      const result = await captureStreams(() => executeProjectionsRebuildCommand({ eventsDirOverride: alternate, dbPathOverride: target }, { verify: true, json: true }));
      expect(result.exitCode).toBe(1); expect(JSON.parse(result.stdout).data.ready).toBe(false);
      const stored = new OwnedDatabase(target, { readonly: true });
      try { expect(stored.serialize().equals(db.serialize())).toBe(true); } finally { stored.close(); }
    });
  });
});
