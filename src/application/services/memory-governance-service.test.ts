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
});
