import { expect, it } from "bun:test";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ExtractionBatch, type ExtractionBatchRecord } from "../../../src/domain/entities/extraction-batch.js";
import { MemoryEventEnvelope, type MemoryEventCreateParams } from "../../../src/domain/entities/memory-event.js";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { appendMemoryEvent, readEvents, readMemoryEvents, readProjectionEventsWithReport, rebuildProjections, rebuildProjectionsWithReport } from "../../../src/infrastructure/database/event-log.js";
import { SqliteFactRepository } from "../../../src/infrastructure/database/repositories/fact-repository.js";
import { SqliteMemoryGovernanceRepository } from "../../../src/infrastructure/database/repositories/memory-governance-repository.js";
import { SecretAuditService } from "../../../src/infrastructure/security/secret-audit-service.js";
import { PatternRedactor } from "../../../src/infrastructure/security/pattern-redactor.js";
import { expandExtractionBatch } from "../../../src/infrastructure/database/extraction-batch-events.js";
import { assertProjectionPayload } from "../../../src/infrastructure/database/projection-payload.js";
import { GitRemoteEventTransport, runGitCommand } from "../../../src/infrastructure/remote/git-remote-event-transport.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

const time = "2026-09-28T10:00:00.000Z";
function batchRecord(): ExtractionBatchRecord {
  return { version: 1, sessionId: "synthetic-session", inputIdentity: "v1:" + "a".repeat(64), project: "synthetic", provider: "synthetic", model: "synthetic", extractedAt: time,
    result: { added: 2, updated: 1, superseded: 1, skipped: 0 },
    facts: [{ uuid: "z-first", type: "learning", content: "first synthetic fact" }, { uuid: "a-last", type: "preference", content: "final synthetic fact", metadata: { graph_edges: [{ source: "synthetic", target: "synthetic-target", relationship: "uses" }] } }, { uuid: "m-replace", type: "supersedence", content: "replace first", metadata: { superseded_uuid: "z-first", superseded_by_uuid: "a-last" } }] };
}
function wrapper(record = batchRecord(), overrides: Partial<MemoryEventCreateParams> = {}): MemoryEventEnvelope {
  return MemoryEventEnvelope.create({ eventId: "batch-one", machineId: "synthetic", sequence: 30, kind: "projection", operation: "add", occurredAt: new Date(time), observedAt: new Date(time), scope: { project: "synthetic", visibility: "project" }, provenance: { source: "memory-extraction", actor: "memory", method: "extraction-batch-v1", sourceIds: ["synthetic-session"] }, privacy: { redactionState: "redacted", containsSensitiveContent: true }, consent: { status: "denied", scopes: ["synthetic-scope"], expiresAt: "2026-10-01T00:00:00.000Z" }, causality: { parentEventIds: [], relatedEventIds: [], supersedesEventIds: [] }, payload: { extractionBatch: ExtractionBatch.fromJSON(record).toJSON() }, ...overrides });
}
function ordinary(id: string): MemoryEventEnvelope {
  return wrapper(batchRecord(), { eventId: id, sequence: 20, kind: "learning", payload: { fact: { uuid: id, type: "learning", project: "synthetic", content: "ordinary synthetic fact", observedAt: time } } });
}
async function fixture(run: (ctx: { db: OwnedDatabase; log: string; dir: string; facts: SqliteFactRepository; governance: SqliteMemoryGovernanceRepository }) => Promise<void>) {
  const storage = createOwnedTestDirectory("memory-batch-replay-"), db = new OwnedDatabase(join(storage.dir, "synthetic.db"));
  try { createSchema(db); await run({ db, log: join(storage.dir, "events", "events-a.jsonl"), dir: storage.dir, facts: new SqliteFactRepository(db), governance: new SqliteMemoryGovernanceRepository(db) }); }
  finally { db.close(); storage.cleanup(); }
}

it("batch replay preserves ordered effects and raw canonical versus Fact reader contracts", async () => fixture(async ({ db, log, facts }) => {
  const event = wrapper(); await appendMemoryEvent(event, log);
  const result = await rebuildProjectionsWithReport(db, log);
  expect(result.invalidEvents).toBe(0); expect(result.replay.processedEvents).toBe(3);
  expect((await facts.findByUuid("z-first"))?.supersededBy).toBe("a-last"); expect((await facts.findByUuid("a-last"))?.supersededAt).toBeNull();
  const canonical = []; for await (const item of readMemoryEvents(log)) canonical.push(item.toJSON()); expect(canonical).toEqual([event.toJSON()]);
  const compatible = []; for await (const item of readEvents(log)) compatible.push(item.uuid); expect(compatible).toEqual(["z-first", "a-last", "m-replace"]);
  const before = await facts.findByProject("synthetic"), source = readFileSync(log, "utf8");
  await rebuildProjections(db, log); expect(readFileSync(log, "utf8")).toBe(source);
  expect((await facts.findByProject("synthetic"))).toHaveLength(3); expect(await facts.findByProject("synthetic")).toEqual(before);
}));

it("batch ordering is applied after complete source record ordering", async () => fixture(async ({ db, log, facts }) => {
  const record = batchRecord(); record.facts = [record.facts[1]!, { ...record.facts[2]!, metadata: { superseded_uuid: "external", superseded_by_uuid: "a-last" } }]; record.result.added = 1;
  await appendMemoryEvent(wrapper(record), log); await appendMemoryEvent(ordinary("external"), log);
  await rebuildProjections(db, log); expect((await facts.findByUuid("external"))?.supersededBy).toBe("a-last");
}));

it("identical batch duplicates have one durable projection effect", async () => fixture(async ({ db, log, facts }) => {
  const event = wrapper(); await appendMemoryEvent(event, log); await appendMemoryEvent(event, log);
  const report = await rebuildProjectionsWithReport(db, log); expect(report.replay.skippedDuplicateEvents).toBe(3); expect(await facts.findByProject("synthetic")).toHaveLength(3);
}));

it("empty batch records validate without changing existing facts", async () => fixture(async ({ db, log, facts }) => {
  await appendMemoryEvent(ordinary("existing"), log); const record = batchRecord(); record.facts = []; record.result = { added: 0, updated: 0, superseded: 0, skipped: 2 };
  await appendMemoryEvent(wrapper(record), log); await rebuildProjections(db, log); expect((await facts.findByProject("synthetic")).map(f => f.uuid)).toEqual(["existing"]);
}));

type Mutation = (json: any) => void;
const malformed: Array<[string, Mutation]> = [
  ["wrong kind", x => { x.kind = "learning"; }], ["wrong operation", x => { x.operation = "update"; }],
  ["project mismatch", x => { x.scope.project = "other"; }], ["scope widening", x => { x.scope.visibility = "global"; }],
  ["workspace scope", x => { x.scope.workspace = "other"; }], ["observed time", x => { x.observedAt = "2026-09-29T10:00:00.000Z"; }],
  ["occurred time", x => { x.occurredAt = "2026-09-29T10:00:00.000Z"; }], ["provenance source", x => { x.provenance.source = "other"; }],
  ["provenance method", x => { x.provenance.method = "other"; }], ["provenance session", x => { x.provenance.sourceIds = ["other"]; }],
  ["extra payload", x => { x.payload.fact = {}; }], ["invalid descriptor", x => { x.payload.extractionBatch.version = 2; }],
  ["wrapper child collision", x => { x.eventId = "a-last"; }],
  ["invalid later metadata", x => { x.payload.extractionBatch.facts[1].metadata.confidence = 2; }],
];
for (const [name, mutate] of malformed) it(`batch rejects ${name} without changing the target`, async () => fixture(async ({ db, log }) => {
  await appendMemoryEvent(ordinary("baseline"), log); await rebuildProjections(db, log); const before = db.serialize();
  const json = wrapper().toJSON(); mutate(json);
  const event = MemoryEventEnvelope.create({ ...json, occurredAt: new Date(json.occurredAt), observedAt: new Date(json.observedAt) });
  expect(() => assertProjectionPayload(event)).toThrow();
  await appendMemoryEvent(event, log); const source = readFileSync(log, "utf8");
  expect((await readProjectionEventsWithReport(log)).invalidEvents).toHaveLength(1);
  await expect(rebuildProjections(db, log)).rejects.toThrow(); expect(db.serialize()).toEqual(before); expect(readFileSync(log, "utf8")).toBe(source);
}));

for (const mode of ["ordinary-child", "other-batch-child", "wrapper-child"] as const) for (const reverse of [false, true]) it(`batch rejects ${mode} collision in either source order=${reverse}`, async () => fixture(async ({ db, log }) => {
  const first = wrapper();
  const second = mode === "ordinary-child" ? ordinary("a-last") : mode === "other-batch-child" ? wrapper(batchRecord(), { eventId: "other-batch" }) : wrapper({ ...batchRecord(), facts: [], result: { added: 0, updated: 0, superseded: 0, skipped: 0 } }, { eventId: "a-last" });
  const before = db.serialize(); for (const event of reverse ? [second, first] : [first, second]) await appendMemoryEvent(event, log);
  const report = await readProjectionEventsWithReport(log); expect(report.invalidEvents).toHaveLength(1);
  await expect(rebuildProjections(db, log)).rejects.toThrow(); expect(db.serialize()).toEqual(before);
}));

it("batch governance preserves policy and provenance for facts, persona and graph", async () => fixture(async ({ db, log, governance }) => {
  await appendMemoryEvent(wrapper(), log); await rebuildProjections(db, log);
  for (const surface of ["fact", "persona", "graph"] as const) {
    using query = db.prepare("SELECT target_id FROM memory_governance WHERE surface=?"); const rows = query.all(surface) as { target_id: string }[]; expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) { const entry = (await governance.findByTarget(surface, row.target_id))!; expect(entry.consentStatus).toBe("denied"); expect(entry.consentScopes).toEqual(["synthetic-scope"]); expect(entry.redactionState).toBe("redacted"); expect(entry.sourceEventIds).toContain("batch-one"); expect(entry.expiresAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z"); expect(entry.scope).toEqual({ project: "synthetic", visibility: "project" }); }
  }
}));

for (const surface of ["persona", "graph"] as const) it(`batch refuses derived ${surface} scope widening`, async () => fixture(async ({ db, log }) => {
  const record = batchRecord(); if (surface === "persona") record.facts[1]!.metadata!.visibility = "global";
  else (record.facts[1]!.metadata!.graph_edges as any[])[0].project = "other-project";
  await appendMemoryEvent(wrapper(record), log); const before = db.serialize(); await expect(rebuildProjections(db, log)).rejects.toThrow(); expect(db.serialize()).toEqual(before);
}));

it("batch recursive privacy remediation keeps one valid envelope and replayable effects", async () => fixture(async ({ db, log, dir, facts }) => {
  const secret = "sk-" + "a".repeat(48), record = batchRecord(); record.facts[0]!.content = "synthetic " + secret;
  await appendMemoryEvent(wrapper(record), log);
  const report = await new SecretAuditService(new PatternRedactor()).audit({ eventLogPaths: [log], quarantineEvents: true, quarantineDir: join(dir, "quarantine") });
  expect(report.remediation.eventLogs.sanitizedFiles).toEqual([log]); expect(JSON.stringify(report)).not.toContain(secret);
  expect(readFileSync(log, "utf8")).not.toContain(secret); await rebuildProjections(db, log); expect((await facts.findByUuid("z-first"))?.content).not.toContain(secret);
}));

it("batch records coexist with legacy source and retain effects after byte-preserving transfer", async () => fixture(async ({ db, log, dir, facts }) => {
  await appendMemoryEvent(wrapper(), log);
  appendFileSync(log, JSON.stringify({ uuid: "legacy", type: "learning", project: "synthetic", content: "legacy synthetic", observedAt: "2026-09-27T10:00:00.000Z" }) + "\n");
  await rebuildProjections(db, log); const expected = (await facts.findByProject("synthetic")).map(f => [f.uuid, f.content, f.supersededBy]).sort();
  const receiver = join(dir, "receiver"); mkdirSync(receiver); const copy = join(receiver, "events-b.jsonl"), bytes = readFileSync(log); writeFileSync(copy, bytes);
  const other = new OwnedDatabase(join(receiver, "receiver.db"));
  try { createSchema(other); await rebuildProjections(other, copy); expect(readFileSync(copy)).toEqual(bytes); expect((await new SqliteFactRepository(other).findByProject("synthetic")).map(f => [f.uuid, f.content, f.supersededBy]).sort()).toEqual(expected); }
  finally { other.close(); }
}));

it("batch effect privacy preserves stricter markers and inherited policy", () => {
  const record = batchRecord(); record.facts[0]!.metadata = { redactionState: "quarantined", containsSensitiveContent: true, redactedFields: ["one"], redaction: { state: "redacted", fields: ["shared"], policy: "metadata-policy" }, privacy: { redactionState: "none", containsSensitiveContent: true, redactedFields: ["two", "shared"] } };
  const inherited = expandExtractionBatch(wrapper(record, { privacy: { redactionState: "none", containsSensitiveContent: false, policy: "parent-policy", redactedFields: ["parent", "shared"] } }))!;
  expect(inherited[0]!.privacy).toEqual({ redactionState: "quarantined", containsSensitiveContent: true, policy: "parent-policy", redactedFields: ["parent", "shared", "one", "two"] });
  const fallback = expandExtractionBatch(wrapper(record, { privacy: { redactionState: "none", containsSensitiveContent: false } }))!;
  expect(fallback[0]!.privacy.policy).toBe("metadata-policy"); expect(fallback[1]!.privacy.redactionState).toBe("none"); expect(fallback[1]!.privacy.containsSensitiveContent).toBe(false);
  expect(expandExtractionBatch(ordinary("unbatched"))).toBeNull();
});

for (const expiry of [undefined, "2026-10-01T00:00:00.000Z", "2026-09-29T00:00:00.000Z"]) it(`batch derived expiry never extends consent or persona lifetime ${expiry}`, async () => fixture(async ({ db, log }) => {
  const record = batchRecord(); record.facts[1]!.metadata!.expires_at = "2026-09-30T00:00:00.000Z";
  await appendMemoryEvent(wrapper(record, { consent: { status: "revoked", scopes: [], expiresAt: expiry } }), log); await rebuildProjections(db, log);
  using query = db.prepare("SELECT expires_at,consent_status FROM memory_governance WHERE surface='persona'");
  expect(query.get()).toEqual({ expires_at: expiry === "2026-09-29T00:00:00.000Z" ? expiry : "2026-09-30T00:00:00.000Z", consent_status: "revoked" });
}));

it("batch source bytes survive the actual local Git transport and receiver replay", async () => fixture(async ({ log, dir }) => {
  await appendMemoryEvent(wrapper(), log);
  const senderDir = join(dir, "events"), receiverDir = join(dir, "git-receiver"), remoteDir = join(dir, "remote.git"), hooks = join(dir, "empty-hooks"); mkdirSync(hooks);
  const env = { ...process.env, HOME: dir, USERPROFILE: dir, XDG_CONFIG_HOME: join(dir, "config") };
  const sender = new GitRemoteEventTransport(senderDir, { env }), receiver = new GitRemoteEventTransport(receiverDir, { env });
  expect((await runGitCommand(["init", "--bare", remoteDir], dir, { env })).success).toBe(true);
  for (const [transport, cwd, machineId] of [[sender, senderDir, "a"], [receiver, receiverDir, "b"]] as const) {
    expect(await transport.initRepository({ machineId, userName: "Chude", userEmail: "chude@emeke.org" })).toEqual({ success: true });
    expect((await runGitCommand(["config", "core.hooksPath", hooks], cwd, { env })).success).toBe(true);
    expect((await runGitCommand(["config", "core.autocrlf", "false"], cwd, { env })).success).toBe(true);
    expect(await transport.setRemoteUrl(remoteDir)).toEqual({ success: true });
  }
  expect(await sender.commitEventLog("a", "test: transfer synthetic extraction batch")).toEqual({ success: true });
  expect(await sender.push("origin", "main")).toEqual({ success: true }); expect(await receiver.fetch("origin")).toEqual({ success: true });
  expect(await receiver.pullRebase("origin", "main")).toEqual({ success: true }); await receiver.assertProjectionSourceSettled();
  expect(await receiver.listEventLogFingerprints()).toEqual(await sender.listEventLogFingerprints());
  const received = join(receiverDir, "events-a.jsonl"); expect(readFileSync(received)).toEqual(readFileSync(log));
  const db = new OwnedDatabase(join(dir, "received.db"));
  try { createSchema(db); await rebuildProjections(db, received); expect((await new SqliteFactRepository(db).findByUuid("z-first"))?.supersededBy).toBe("a-last"); }
  finally { db.close(); }
}));
