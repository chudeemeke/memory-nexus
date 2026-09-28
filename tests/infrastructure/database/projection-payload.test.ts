import { describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { appendMemoryEvent, rebuildProjectionsWithReport, verifyProjectionRebuild } from "../../../src/infrastructure/database/event-log.js";
import { MemoryEventEnvelope, type MemoryEventKind, type MemoryEventOperation } from "../../../src/domain/entities/memory-event.js";
import { DreamEntry } from "../../../src/domain/entities/dream-entry.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

const time = new Date("2026-01-01T00:00:00Z");
const fact = { uuid: "synthetic", type: "learning", project: "synthetic", content: "synthetic", observedAt: time.toISOString() };
const dream = DreamEntry.create({ dreamId: "synthetic", kind: "supersedence_proposal", project: "synthetic", visibility: "project", sourceEventIds: ["source"], targetFactUuid: "target", proposedFact: { ...fact, type: "learning" }, reason: "synthetic", confidence: 0.8, audit: { redactionState: "none", reviewer: "user", redactedFields: [], findingHashes: [] }, createdAt: time, updatedAt: time }).toJSON();
function event(kind: MemoryEventKind, payload: Record<string, unknown>, operation: MemoryEventOperation = "add") {
  return MemoryEventEnvelope.create({ eventId: "synthetic", machineId: "synthetic", sequence: 1, kind, operation, occurredAt: time, observedAt: time,
    scope: { project: "synthetic", visibility: "project" }, provenance: { source: "test", actor: "test", method: "fixture" },
    privacy: { redactionState: "none", containsSensitiveContent: false }, consent: { status: "not_required", scopes: [] },
    causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] }, payload });
}
async function fixture(run: (db: OwnedDatabase, log: string) => Promise<void>) {
  const storage = createOwnedTestDirectory("memory-payload-"), db = new OwnedDatabase(":memory:");
  try { createSchema(db); db.exec("INSERT INTO facts(uuid,type,project,content,observed_at) VALUES('retained','learning','synthetic','retained','synthetic')"); await run(db, join(storage.dir, "events.jsonl")); }
  finally { db.close(); storage.cleanup(); }
}
const invalidFacts: Record<string, unknown>[] = [
  { uuid: "" }, { type: 1 }, { type: null }, { project: 123 }, { project: null }, { content: false },
  { observedAt: 0 }, { observedAt: "invalid" }, { observedAt: null }, { metadata: [] }, { metadata: null },
  { supersededAt: false }, { supersededAt: "invalid" }, { supersededBy: 1 }, { supersededBy: "" },
  { id: 0 }, { id: 1.5 }, { id: "1" }, { metadata: { confidence: "high" } },
  { metadata: { privacy: { containsSensitiveContent: "false" } } },
];
const invalidGovernance: Record<string, unknown>[] = [
  { control: false }, { control: "" }, { surface: 1 }, { targetId: false }, { project: 1 },
  { visibility: "unknown" }, { sourceEventIds: [1] }, { source_event_ids: "source" },
  { transformationMethod: 1 }, { actor: false }, { confidence: "high" }, { confidence: 2 },
  { redactionState: "unknown" }, { redaction_state: false }, { consentStatus: false }, { consent_status: "unknown" },
  { consentScopes: [false] }, { consent_scopes: 1 }, { scope: [] }, { scope: { visibility: "project", project: 1 } },
  { status: false }, { reason: 1 }, { status_reason: [] }, { createdAt: 0 }, { created_at: "invalid" },
  { reviewedAt: false }, { reviewed_at: "invalid" }, { expiresAt: false }, { expires_at: "invalid" },
  { target_id: "different" }, { consentStatus: "granted", consent_status: "revoked" },
];
describe("strict projection payload fields", () => {
  const inputs = [
    ...invalidFacts.map(fields => event("learning", { fact: { ...fact, ...fields } })),
    ...invalidGovernance.map(fields => event("governance", { governance: { targetId: "synthetic", ...fields } })),
    ...["reviewed_at", "applied_at", "rolled_back_at", "project", "id"].map(field => event("dream", { dream: { entry: { ...dream, [field]: false } } })),
    event("dream", { dream: { entry: dream } }, "supersede"),
    event("governance", { governance: { targetId: "synthetic" } }, "supersede"),
    event("consent", { governance: { targetId: "synthetic" } }, "supersede"),
  ];
  for (const [index, input] of inputs.entries()) {
    it(`rejects malformed authoritative payload ${index} through verify and mutation`, async () => {
      await fixture(async (db, log) => {
        await appendMemoryEvent(input, log); const before = db.serialize();
        await expect(verifyProjectionRebuild(log, undefined, db)).rejects.toThrow("source cannot be replayed");
        await expect(rebuildProjectionsWithReport(db, log)).rejects.toThrow("source cannot be replayed");
        expect(db.serialize().equals(before)).toBe(true);
      });
    });
  }
  for (const [index, fields] of [...invalidFacts, { sequence: "1" }, { metadata: { redactionState: "unknown" } }, { metadata: { containsSensitiveContent: "false" } }, { metadata: { redaction: { fields: [1] } } }].entries()) {
    it(`rejects malformed legacy fields before adaptation ${index}`, async () => {
      await fixture(async (db, log) => {
        writeFileSync(log, JSON.stringify({ ...fact, ...fields })); const before = db.serialize();
        expect((await verifyProjectionRebuild(log)).invalidEvents).toHaveLength(1);
        expect((await rebuildProjectionsWithReport(db, log)).invalidEvents).toBe(1);
        expect(db.serialize().equals(before)).toBe(true);
      });
    });
  }
  for (const input of [
    event("learning", { fact: { uuid: "synthetic", content: "synthetic", metadata: { extension: { arbitrary: true } } } }),
    event("learning", { fact: { ...fact, id: 1, supersededAt: null, supersededBy: null, metadata: { confidence: 0.5 } } }, "supersede"),
    event("governance", { governance: { target_id: "synthetic", source_event_ids: ["source"], consent_scopes: [], reviewed_at: null, expires_at: null } }),
    event("consent", { governance: { control: "consent_grant", targetId: "synthetic", consentStatus: "granted", consentScopes: ["remote_sync"] } }, "update"),
    event("dream", { dream: { entry: dream, extension: true } }),
  ]) {
    it(`accepts legitimate optional fields and unknown extensions for ${input.kind}/${input.operation}`, async () => {
      await fixture(async (db, log) => {
        await appendMemoryEvent(input, log); expect((await verifyProjectionRebuild(log)).invalidEvents).toHaveLength(0);
        expect((await rebuildProjectionsWithReport(db, log)).replay.processedEvents).toBe(1);
      });
    });
  }
  it("retains valid legacy privacy fields and explicit sequence through adaptation", async () => {
    await fixture(async (db, log) => {
      writeFileSync(log, JSON.stringify({ ...fact, sequence: 5, metadata: { privacy: { containsSensitiveContent: true, redactionState: "redacted", redactedFields: ["content"] }, redaction: { policy: "synthetic" } } }));
      const verified = await verifyProjectionRebuild(log);
      expect(verified.events[0]?.privacy).toEqual({ containsSensitiveContent: true, redactionState: "redacted", redactedFields: ["content"], policy: "synthetic" });
      expect(verified.events[0]?.sequence).toBe(5);
      expect((await rebuildProjectionsWithReport(db, log)).replay.processedEvents).toBe(1);
      using stored = db.prepare("SELECT redaction_state FROM memory_governance WHERE surface='fact' AND target_id='synthetic'");
      expect(stored.get()).toEqual({ redaction_state: "redacted" });
    });
  });
});
