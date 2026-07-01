import { beforeEach, describe, expect, test } from "bun:test";
import { DreamEntry } from "../../domain/entities/dream-entry.js";
import { Database } from "bun:sqlite";
import { Fact } from "../../domain/entities/fact.js";
import type { MemoryEventEnvelope } from "../../domain/entities/memory-event.js";
import { SqliteDreamRepository } from "../../infrastructure/database/repositories/dream-repository.js";
import { SqliteFactRepository } from "../../infrastructure/database/repositories/fact-repository.js";
import { SqliteMemoryGovernanceRepository } from "../../infrastructure/database/repositories/memory-governance-repository.js";
import { createSchema } from "../../infrastructure/database/schema.js";
import { PatternRedactor } from "../../infrastructure/security/pattern-redactor.js";
import { MemoryGovernanceService } from "./memory-governance-service.js";
import { DreamingService } from "./dreaming-service.js";

describe("DreamingService", () => {
  let db: Database;
  let dreamRepo: SqliteDreamRepository;
  let factRepo: SqliteFactRepository;
  let governanceRepo: SqliteMemoryGovernanceRepository;
  let writtenEvents: MemoryEventEnvelope[];
  let sequence: number;
  let service: DreamingService;

  beforeEach(async () => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    dreamRepo = new SqliteDreamRepository(db);
    factRepo = new SqliteFactRepository(db);
    governanceRepo = new SqliteMemoryGovernanceRepository(db);
    writtenEvents = [];
    sequence = 0;
    const writeEvent = async (event: MemoryEventEnvelope) => {
      writtenEvents.push(event);
    };
    service = new DreamingService({
      dreamRepo,
      factRepo,
      governanceService: new MemoryGovernanceService({
        repository: governanceRepo,
        writeEvent,
        machineId: "machine",
        now: () => new Date("2026-06-07T08:00:00Z"),
        nextSequence: () => ++sequence,
      }),
      writeEvent,
      redactor: new PatternRedactor(),
      machineId: "machine",
      now: () => new Date("2026-06-07T08:00:00Z"),
      nextSequence: () => ++sequence,
    });

    await factRepo.save(Fact.create({
      uuid: "fact-provider-old",
      type: "decision",
      project: "memory-nexus",
      content: "Provider health checks enumerate three providers directly.",
      observedAt: new Date("2026-06-07T07:00:00Z"),
    }));
  });

  test("proposes redacted, review-gated dream supersedence without mutating facts", async () => {
    const proposal = await service.proposeSupersedence({
      project: "memory-nexus",
      sourceEventIds: ["evt-provider-old", "evt-provider-new"],
      targetFactUuid: "fact-provider-old",
      proposedContent: "Provider registry uses capability metadata and never stores sk-ant-123456789012345678901234.",
      reason: "Supersedes the old hard-coded provider switch note.",
      confidence: 0.91,
      actor: "memory",
    });
    const storedFact = await factRepo.findByUuid("fact-provider-old");
    const governance = await governanceRepo.findByTarget("dream", proposal.dreamId);

    expect(proposal.status).toBe("pending_review");
    expect(proposal.autoPromoted).toBe(false);
    expect(proposal.proposedFact.content).not.toContain("sk-ant-123456789012345678901234");
    expect(proposal.audit.redactionState).toBe("redacted");
    expect(storedFact?.supersededAt).toBeNull();
    expect(governance?.surface).toBe("dream");
    expect(writtenEvents.map((event) => event.kind)).toEqual(["dream", "governance"]);
    expect(writtenEvents[0].privacy.redactionState).toBe("redacted");
  });

  test("requires explicit approval and confirmation before canonical supersedence events are emitted", async () => {
    const proposal = await service.proposeSupersedence({
      project: "memory-nexus",
      sourceEventIds: ["evt-provider-old", "evt-provider-new"],
      targetFactUuid: "fact-provider-old",
      proposedContent: "Provider registry uses capability metadata.",
      reason: "Supersedes the old hard-coded provider switch note.",
      actor: "memory",
    });

    await expect(service.applyProposal(proposal.dreamId, { actor: "user", confirm: true })).rejects.toThrow("approved");
    const approved = await service.approveProposal(proposal.dreamId, { actor: "user" });
    await expect(service.applyProposal(approved.dreamId, { actor: "user" })).rejects.toThrow("confirm");

    const applied = await service.applyProposal(approved.dreamId, { actor: "user", confirm: true });
    const stored = await dreamRepo.findByDreamId(proposal.dreamId);
    const appliedKinds = writtenEvents.slice(-3).map((event) => event.kind);
    const appliedOperations = writtenEvents.slice(-3).map((event) => event.operation);

    expect(applied.entry.status).toBe("applied");
    expect(stored?.status).toBe("applied");
    expect(applied.canonicalEventIds).toHaveLength(2);
    expect(appliedKinds).toEqual(["decision", "supersedence", "dream"]);
    expect(appliedOperations).toEqual(["add", "supersede", "update"]);
  });

  test("rolls back applied proposals by appending canonical restore and dream rollback events", async () => {
    const proposal = await service.proposeSupersedence({
      project: "memory-nexus",
      sourceEventIds: ["evt-provider-old", "evt-provider-new"],
      targetFactUuid: "fact-provider-old",
      proposedContent: "Provider registry uses capability metadata.",
      reason: "Supersedes the old hard-coded provider switch note.",
      actor: "memory",
    });
    const approved = await service.approveProposal(proposal.dreamId, { actor: "user" });
    await service.applyProposal(approved.dreamId, { actor: "user", confirm: true });
    await expect(service.rollbackProposal(approved.dreamId, { actor: "user" })).rejects.toThrow("confirm");

    const rolledBack = await service.rollbackProposal(approved.dreamId, { actor: "user", confirm: true });
    const tail = writtenEvents.slice(-2);

    expect(rolledBack.entry.status).toBe("rolled_back");
    expect(rolledBack.rollbackEventIds).toHaveLength(1);
    expect(tail.map((event) => event.kind)).toEqual(["decision", "dream"]);
    expect(tail[0].operation).toBe("update");
    expect(tail[1].payload.dream).toBeDefined();
  });

  test("lists and rejects proposals through explicit state changes", async () => {
    const proposal = await service.proposeSupersedence({
      project: "memory-nexus",
      sourceEventIds: ["evt-provider-old", "evt-provider-new"],
      targetFactUuid: "fact-provider-old",
      proposedContent: "Provider registry uses capability metadata.",
      reason: "Supersedes the old hard-coded provider switch note.",
      actor: "memory",
    });
    const rejected = await service.rejectProposal(proposal.dreamId, { actor: "user" });
    const listed = await service.list({ project: "memory-nexus", status: "rejected" });

    expect(rejected.status).toBe("rejected");
    expect(listed.map((entry) => entry.dreamId)).toEqual([proposal.dreamId]);
    expect(await service.show(proposal.dreamId)).not.toBeNull();
  });

  test("supports explicit proposals without optional writer, governance, or redactor dependencies", async () => {
    const minimal = new DreamingService({
      dreamRepo,
      factRepo,
      now: () => new Date("2026-06-07T10:00:00Z"),
      nextSequence: () => ++sequence,
    });

    const proposal = await minimal.proposeSupersedence({
      project: "memory-nexus",
      sourceEventIds: ["evt-provider-old"],
      targetFactUuid: "fact-provider-old",
      proposedContent: "Provider registry uses capability metadata.",
      reason: "Supersedes the old hard-coded provider switch note.",
    });

    expect(proposal.status).toBe("pending_review");
    expect(proposal.audit.redactionState).toBe("none");
    expect(proposal.proposedFact.uuid).toStartWith("fact-");
    expect(await dreamRepo.findByDreamId(proposal.dreamId)).not.toBeNull();
  });

  test("rejects invalid proposal input before persisting dream events", async () => {
    const valid = {
      project: "memory-nexus",
      sourceEventIds: ["evt-provider-old"],
      targetFactUuid: "fact-provider-old",
      proposedContent: "Provider registry uses capability metadata.",
      reason: "Supersedes the old hard-coded provider switch note.",
    };

    await expect(service.proposeSupersedence({ ...valid, project: " " })).rejects.toThrow("project");
    await expect(service.proposeSupersedence({ ...valid, sourceEventIds: [] })).rejects.toThrow("sourceEventIds");
    await expect(service.proposeSupersedence({ ...valid, sourceEventIds: undefined as never })).rejects.toThrow("sourceEventIds");
    await expect(service.proposeSupersedence({ ...valid, targetFactUuid: " " })).rejects.toThrow("targetFactUuid");
    await expect(service.proposeSupersedence({ ...valid, proposedContent: " " })).rejects.toThrow("proposedContent");
    await expect(service.proposeSupersedence({ ...valid, reason: " " })).rejects.toThrow("reason");
    await expect(service.proposeSupersedence({ ...valid, confidence: Number.NaN })).rejects.toThrow("confidence");
    await expect(service.proposeSupersedence({ ...valid, confidence: -0.01 })).rejects.toThrow("confidence");
    await expect(service.proposeSupersedence({ ...valid, confidence: 1.01 })).rejects.toThrow("confidence");

    expect(writtenEvents).toEqual([]);
  });

  test("fails safe when approval, apply, or rollback targets are missing or malformed", async () => {
    await expect(service.approveProposal(" ")).rejects.toThrow("dreamId");
    await expect(service.rejectProposal("missing")).rejects.toThrow("not found");

    const missingTarget = await service.proposeSupersedence({
      project: "memory-nexus",
      sourceEventIds: ["evt-provider-old"],
      targetFactUuid: "fact-missing",
      proposedContent: "Provider registry uses capability metadata.",
      reason: "Supersedes the old hard-coded provider switch note.",
    });
    const approvedMissingTarget = await service.approveProposal(missingTarget.dreamId, { actor: "user" });
    await expect(service.applyProposal(approvedMissingTarget.dreamId, { actor: "user", confirm: true })).rejects.toThrow("Target fact not found");

    const proposal = await service.proposeSupersedence({
      project: "memory-nexus",
      sourceEventIds: ["evt-provider-old"],
      targetFactUuid: "fact-provider-old",
      proposedContent: "Provider registry uses capability metadata.",
      reason: "Supersedes the old hard-coded provider switch note.",
    });
    const approved = await service.approveProposal(proposal.dreamId, { actor: "user" });
    await service.applyProposal(approved.dreamId, { actor: "user", confirm: true });
    db.prepare("DELETE FROM facts WHERE uuid = ?").run("fact-provider-old");

    await expect(service.rollbackProposal(approved.dreamId, { actor: "user", confirm: true })).rejects.toThrow("Target fact not found");
  });

  test("propagates redaction metadata into canonical apply events", async () => {
    const proposal = await service.proposeSupersedence({
      project: "memory-nexus",
      sourceEventIds: ["evt-provider-old", "evt-provider-new"],
      targetFactUuid: "fact-provider-old",
      proposedContent: "Provider registry uses capability metadata and masks sk-ant-123456789012345678901234.",
      reason: "Supersedes sk-ant-123456789012345678901234 from the old note.",
      actor: "memory",
    });
    const approved = await service.approveProposal(proposal.dreamId, { actor: "reviewer" });

    await service.applyProposal(approved.dreamId, { actor: "operator", confirm: true });
    const canonicalEvents = writtenEvents.slice(-3, -1);

    expect(canonicalEvents).toHaveLength(2);
    expect(canonicalEvents.every((event) => event.privacy.redactionState === "redacted")).toBe(true);
    expect(canonicalEvents.every((event) => event.privacy.containsSensitiveContent)).toBe(true);
    expect(canonicalEvents.flatMap((event) => event.privacy.redactedFields ?? [])).toContain("dream.proposedFact.content");
    expect(canonicalEvents[0].provenance.actor).toBe("operator");
  });

  test("uses default actors, clocks, sequences, and list options safely", async () => {
    const defaulted = new DreamingService({
      dreamRepo,
      factRepo,
      governanceService: new MemoryGovernanceService({
        repository: governanceRepo,
        writeEvent: async (event) => writtenEvents.push(event),
      }),
      writeEvent: async (event) => writtenEvents.push(event),
      redactor: new PatternRedactor(),
    });
    const proposal = await defaulted.proposeSupersedence({
      project: "memory-nexus",
      sourceEventIds: ["evt-provider-old"],
      targetFactUuid: "fact-provider-old",
      proposedContent: "Provider registry uses capability metadata.",
      reason: "Supersedes the old hard-coded provider switch note.",
    });
    const approved = await defaulted.approveProposal(proposal.dreamId);
    const applied = await defaulted.applyProposal(approved.dreamId, { confirm: true });
    const rolledBack = await defaulted.rollbackProposal(applied.entry.dreamId, { confirm: true });
    const listed = await defaulted.list();

    expect(proposal.dreamId).toStartWith("dream-");
    expect(approved.audit.reviewer).toBe("user");
    expect(applied.canonicalEventIds).toHaveLength(2);
    expect(rolledBack.rollbackEventIds).toHaveLength(1);
    expect(listed.some((entry) => entry.dreamId === proposal.dreamId)).toBe(true);
    expect(writtenEvents.some((event) => event.provenance.actor === "user")).toBe(true);
  });

  test("requires explicit apply and rollback state even with default commands", async () => {
    const proposal = await service.proposeSupersedence({
      project: "memory-nexus",
      sourceEventIds: ["evt-provider-old"],
      targetFactUuid: "fact-provider-old",
      proposedContent: "Provider registry uses capability metadata.",
      reason: "Supersedes the old hard-coded provider switch note.",
    });

    await expect(service.applyProposal(proposal.dreamId)).rejects.toThrow("confirm");
    await expect(service.rollbackProposal(proposal.dreamId)).rejects.toThrow("confirm");
    await expect(service.rollbackProposal(proposal.dreamId, { confirm: true })).rejects.toThrow("applied");
  });

  test("applies entries without proposed metadata and rolls back facts without carrying stale supersedence timestamps", async () => {
    await factRepo.save(Fact.create({
      uuid: "fact-superseded",
      type: "decision",
      project: "memory-nexus",
      content: "Older superseded fact.",
      observedAt: new Date("2026-06-07T06:00:00Z"),
      supersededAt: new Date("2026-06-07T06:30:00Z"),
      supersededBy: "fact-other",
    }));
    const proposal = await dreamRepo.save((await service.proposeSupersedence({
      project: "memory-nexus",
      sourceEventIds: ["evt-provider-old"],
      targetFactUuid: "fact-superseded",
      proposedContent: "Provider registry uses capability metadata.",
      proposedFactUuid: "fact-without-metadata",
      reason: "Supersedes the old hard-coded provider switch note.",
    })).approve("reviewer", new Date("2026-06-07T08:30:00Z")));

    await dreamRepo.save(DreamEntryForTest.withoutProposedMetadata(proposal));
    const applied = await service.applyProposal(proposal.dreamId, { confirm: true });
    const rolledBack = await service.rollbackProposal(applied.entry.dreamId, { confirm: true });
    const restore = writtenEvents.at(-2);

    expect(rolledBack.entry.status).toBe("rolled_back");
    expect(restore?.payload.fact?.supersededAt).toBeNull();
  });
});

class DreamEntryForTest {
  static withoutProposedMetadata(entry: DreamEntry): DreamEntry {
    return DreamEntry.create({
      ...entry.toParams(),
      proposedFact: {
        uuid: entry.proposedFact.uuid,
        type: entry.proposedFact.type,
        project: entry.proposedFact.project,
        content: entry.proposedFact.content,
      },
    });
  }
}
