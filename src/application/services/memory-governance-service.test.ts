import { describe, expect, test } from "bun:test";
import { MemoryGovernanceService } from "./memory-governance-service.js";
import type { MemoryEventEnvelope } from "../../domain/entities/memory-event.js";
import type {
  IMemoryGovernanceRepository,
  MemoryGovernanceListOptions,
} from "../../domain/ports/repositories.js";
import {
  MemoryGovernanceEntry,
  type MemoryGovernanceSurface,
} from "../../domain/entities/memory-governance.js";

class InMemoryGovernanceRepo implements IMemoryGovernanceRepository {
  entries = new Map<string, MemoryGovernanceEntry>();

  async save(entry: MemoryGovernanceEntry): Promise<MemoryGovernanceEntry> {
    this.entries.set(`${entry.surface}:${entry.targetId}`, entry);
    return entry;
  }

  async findByTarget(surface: MemoryGovernanceSurface, targetId: string): Promise<MemoryGovernanceEntry | null> {
    return this.entries.get(`${surface}:${targetId}`) ?? null;
  }

  async findByTargetIds(surface: MemoryGovernanceSurface, targetIds: string[]): Promise<MemoryGovernanceEntry[]> {
    return targetIds
      .map((id) => this.entries.get(`${surface}:${id}`))
      .filter((entry): entry is MemoryGovernanceEntry => entry !== undefined);
  }

  async findAll(options: MemoryGovernanceListOptions = {}): Promise<MemoryGovernanceEntry[]> {
    return [...this.entries.values()].filter((entry) => {
      if (options.surface && entry.surface !== options.surface) return false;
      if (options.targetId && entry.targetId !== options.targetId) return false;
      if (options.status && entry.status !== options.status) return false;
      if (options.project && entry.project !== options.project) return false;
      return true;
    });
  }

  async applyMemoryEvent(event: MemoryEventEnvelope): Promise<MemoryGovernanceEntry | null> {
    const payload = event.payload.governance as any;
    if (!payload) return null;
    const key = `${payload.surface}:${payload.targetId}`;
    const existing = this.entries.get(key);
    if (payload.control === "register" || !existing) {
      const entry = MemoryGovernanceEntry.create({
        surface: payload.surface,
        targetId: payload.targetId,
        project: payload.project,
        visibility: payload.visibility,
        sourceEventIds: payload.sourceEventIds,
        transformationMethod: payload.transformationMethod,
        actor: payload.actor,
        confidence: payload.confidence,
        redactionState: payload.redactionState,
        consentStatus: payload.consentStatus,
        consentScopes: payload.consentScopes,
        scope: event.scope,
        status: payload.control === "suppress" ? "suppressed" : "active",
        statusReason: payload.reason,
        createdAt: event.observedAt,
        updatedAt: event.observedAt,
        lastEventId: event.eventId,
      });
      this.entries.set(key, entry);
      return entry;
    }
    const updated = existing.withControl({
      control: payload.control,
      actor: payload.actor,
      reason: payload.reason,
      occurredAt: event.observedAt,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined,
      consentStatus: payload.consentStatus,
      consentScopes: payload.consentScopes,
      lastEventId: event.eventId,
    });
    this.entries.set(key, updated);
    return updated;
  }

  async clearAll(): Promise<void> {
    this.entries.clear();
  }
}

describe("MemoryGovernanceService", () => {
  test("uses safe defaults, supports no event writer, and allows unregistered memories", async () => {
    const repo = new InMemoryGovernanceRepo();
    const service = new MemoryGovernanceService({
      repository: repo,
      machineId: "   ",
      now: () => new Date("2026-06-06T08:00:00Z"),
      nextSequence: () => 20,
    });

    const entry = await service.registerDerivedMemory({
      surface: "context",
      targetId: "ctx-1",
      sourceEventIds: ["source-1"],
      transformationMethod: "context.compose",
    });
    const empty: Array<{ id: string }> = [];

    expect(entry.toJSON()).toMatchObject({
      surface: "context",
      target_id: "ctx-1",
      visibility: "global",
      actor: "memory",
      confidence: 1,
      redaction_state: "none",
      consent_status: "not_required",
      consent_scopes: [],
    });
    expect(entry.project).toBeUndefined();
    expect(await service.isAllowed("context", "missing")).toBe(true);
    await expect(service.filterAllowed("context", empty, (item) => item.id)).resolves.toBe(empty);
  });

  test("registers derived memory by emitting a canonical event and updating projection", async () => {
    const repo = new InMemoryGovernanceRepo();
    const events: MemoryEventEnvelope[] = [];
    const service = new MemoryGovernanceService({
      repository: repo,
      writeEvent: async (event) => { events.push(event); },
      machineId: "test-machine",
      now: () => new Date("2026-06-06T08:00:00Z"),
      nextSequence: () => 10,
    });

    const entry = await service.registerDerivedMemory({
      surface: "fact",
      targetId: "fact-1",
      project: "memory-nexus",
      sourceEventIds: ["source-1"],
      transformationMethod: "llm.extract",
      consentStatus: "granted",
      consentScopes: ["local-memory"],
      confidence: 0.75,
    });

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("governance");
    expect(events[0].payload.governance).toMatchObject({
      control: "register",
      surface: "fact",
      targetId: "fact-1",
      transformationMethod: "llm.extract",
    });
    expect(entry.consentStatus).toBe("granted");
  });

  test("applies all control commands and emits consent events for consent changes", async () => {
    const repo = new InMemoryGovernanceRepo();
    const events: MemoryEventEnvelope[] = [];
    const service = new MemoryGovernanceService({
      repository: repo,
      writeEvent: async (event) => { events.push(event); },
      machineId: "machine-1",
      now: () => new Date("2026-06-06T09:00:00Z"),
      nextSequence: (() => {
        let sequence = 100;
        return () => sequence++;
      })(),
    });
    await service.registerDerivedMemory({
      surface: "fact",
      targetId: "fact-controls",
      project: "memory-nexus",
      sourceEventIds: ["source-1"],
      transformationMethod: "test",
    });

    const suppressed = await service.suppress({ surface: "fact", targetId: "fact-controls", reason: "wrong" });
    const unsuppressed = await service.unsuppress({ surface: "fact", targetId: "fact-controls" });
    const invalidated = await service.invalidate({ surface: "fact", targetId: "fact-controls", reason: "false" });
    const reviewed = await service.review({ surface: "fact", targetId: "fact-controls" });
    const granted = await service.grantConsent({
      surface: "fact",
      targetId: "fact-controls",
      consentScopes: ["remote-sync"],
    });
    const revoked = await service.revokeConsent({ surface: "fact", targetId: "fact-controls" });
    const expired = await service.expire({ surface: "fact", targetId: "fact-controls" });

    expect(suppressed.status).toBe("suppressed");
    expect(unsuppressed.status).toBe("active");
    expect(invalidated.status).toBe("invalidated");
    expect(reviewed.reviewedAt?.toISOString()).toBe("2026-06-06T09:00:00.000Z");
    expect(granted.consentStatus).toBe("granted");
    expect(granted.consentScopes).toEqual(["remote-sync"]);
    expect(revoked.consentStatus).toBe("revoked");
    expect(expired.status).toBe("expired");
    expect(expired.expiresAt?.toISOString()).toBe("2026-06-06T09:00:00.000Z");
    expect(events.filter((event) => event.kind === "consent").map((event) => event.payload.governance.control))
      .toEqual(["consent_grant", "consent_revoke"]);
  });

  test("controls an unregistered target with explicit fallback provenance instead of dropping the request", async () => {
    const repo = new InMemoryGovernanceRepo();
    const events: MemoryEventEnvelope[] = [];
    const service = new MemoryGovernanceService({
      repository: repo,
      writeEvent: async (event) => { events.push(event); },
      now: () => new Date("2026-06-06T10:00:00Z"),
      nextSequence: () => 30,
    });

    const entry = await service.suppress({
      surface: "persona",
      targetId: "persona-1",
      actor: "user",
      reason: "do not personalize from this",
    });
    const payload = events[0].payload.governance as any;

    expect(entry.toJSON()).toMatchObject({
      surface: "persona",
      target_id: "persona-1",
      visibility: "global",
      source_event_ids: ["persona-1"],
      transformation_method: "governance.suppress",
      status: "suppressed",
      status_reason: "do not personalize from this",
    });
    expect(payload.visibility).toBe("global");
    expect(payload.sourceEventIds).toEqual(["persona-1"]);
  });

  test("suppresses entries and filters blocked items for downstream context/ranking surfaces", async () => {
    const repo = new InMemoryGovernanceRepo();
    const service = new MemoryGovernanceService({
      repository: repo,
      now: () => new Date("2026-06-06T09:00:00Z"),
    });
    await service.registerDerivedMemory({
      surface: "fact",
      targetId: "keep",
      sourceEventIds: ["keep"],
      transformationMethod: "test",
    });
    await service.registerDerivedMemory({
      surface: "fact",
      targetId: "drop",
      sourceEventIds: ["drop"],
      transformationMethod: "test",
    });

    await service.suppress({
      surface: "fact",
      targetId: "drop",
      reason: "wrong memory",
    });

    const allowed = await service.filterAllowed(
      "fact",
      [{ id: "keep" }, { id: "drop" }, { id: "unregistered" }],
      (item) => item.id,
    );

    expect(await service.isAllowed("fact", "drop")).toBe(false);
    expect(allowed.map((item) => item.id)).toEqual(["keep", "unregistered"]);
  });

  test("delegates list and show filters to the repository", async () => {
    const repo = new InMemoryGovernanceRepo();
    const service = new MemoryGovernanceService({ repository: repo });
    await service.registerDerivedMemory({
      surface: "fact",
      targetId: "fact-a",
      project: "a",
      sourceEventIds: ["source-a"],
      transformationMethod: "test",
    });
    await service.registerDerivedMemory({
      surface: "fact",
      targetId: "fact-b",
      project: "b",
      sourceEventIds: ["source-b"],
      transformationMethod: "test",
    });
    await service.suppress({ surface: "fact", targetId: "fact-b" });

    expect((await service.list({ project: "a" })).map((entry) => entry.targetId)).toEqual(["fact-a"]);
    expect((await service.list({ status: "suppressed" })).map((entry) => entry.targetId)).toEqual(["fact-b"]);
    expect((await service.show("fact", "fact-a"))?.targetId).toBe("fact-a");
    expect(await service.show("fact", "missing")).toBeNull();
  });

  test("fails loudly when repository projection does not materialize a registration or control", async () => {
    class NullProjectionRepo extends InMemoryGovernanceRepo {
      override async applyMemoryEvent(): Promise<MemoryGovernanceEntry | null> {
        return null;
      }
    }
    const service = new MemoryGovernanceService({
      repository: new NullProjectionRepo(),
      writeEvent: async () => undefined,
    });

    await expect(service.registerDerivedMemory({
      surface: "fact",
      targetId: "fact-null",
      sourceEventIds: ["source"],
      transformationMethod: "test",
    })).rejects.toThrow("Governance registration did not produce a projection entry");

    await expect(service.suppress({
      surface: "fact",
      targetId: "fact-null",
    })).rejects.toThrow("Governance suppress did not produce a projection entry");
  });
});
