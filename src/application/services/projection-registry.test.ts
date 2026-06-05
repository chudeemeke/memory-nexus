import { describe, expect, test } from "bun:test";
import { MemoryEventEnvelope } from "../../domain/entities/memory-event.js";
import { ProjectionRegistry, type EventProjection } from "./projection-registry.js";

function event(kind: "decision" | "learning", eventId: string, content: string) {
  return MemoryEventEnvelope.create({
    eventId,
    machineId: "machine-a",
    sequence: kind === "decision" ? 1 : 2,
    kind,
    operation: "add",
    occurredAt: new Date("2026-06-05T08:00:00Z"),
    observedAt: new Date("2026-06-05T08:00:00Z"),
    scope: { project: "memory-nexus", visibility: "project" },
    provenance: { source: "test", actor: "test", method: "fixture" },
    privacy: { redactionState: "none", containsSensitiveContent: false },
    consent: { status: "not_required", scopes: [] },
    causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
    payload: { content },
  });
}

describe("ProjectionRegistry", () => {
  test("resets projections, declares consumed kinds, and skips duplicate event ids", async () => {
    const applied: string[] = [];
    const resets: string[] = [];

    const decisions: EventProjection<{ applied: string[] }> = {
      name: "facts.decisions",
      consumedKinds: ["decision"],
      reset: () => {
        resets.push("decisions");
      },
      apply: async (memoryEvent, context) => {
        context.applied.push(`decision:${memoryEvent.eventId}`);
      },
    };

    const learnings: EventProjection<{ applied: string[] }> = {
      name: "facts.learnings",
      consumedKinds: ["learning"],
      reset: () => {
        resets.push("learnings");
      },
      apply: async (memoryEvent, context) => {
        context.applied.push(`learning:${memoryEvent.eventId}`);
      },
    };

    const registry = new ProjectionRegistry([decisions, learnings]);

    const result = await registry.replay(
      [
        event("decision", "event-1", "first"),
        event("decision", "event-1", "duplicate"),
        event("learning", "event-2", "second"),
      ],
      { applied }
    );

    expect(registry.getConsumedKinds("facts.decisions")).toEqual(["decision"]);
    expect(resets).toEqual(["decisions", "learnings"]);
    expect(applied).toEqual(["decision:event-1", "learning:event-2"]);
    expect(result.processedEvents).toBe(2);
    expect(result.skippedDuplicateEvents).toBe(1);
    expect(result.appliedProjections).toEqual(["facts.decisions", "facts.learnings"]);
  });

  test("rejects duplicate projection names", () => {
    const projection: EventProjection<unknown> = {
      name: "facts",
      consumedKinds: ["decision"],
      apply: () => undefined,
    };

    expect(() => new ProjectionRegistry([projection, projection])).toThrow("Duplicate projection");
  });

  test("rejects empty projection names and unknown consumed-kind lookups", () => {
    const projection: EventProjection<unknown> = {
      name: " ",
      consumedKinds: ["decision"],
      apply: () => undefined,
    };

    expect(() => new ProjectionRegistry([projection])).toThrow("Projection name");

    const registry = new ProjectionRegistry<unknown>([]);
    expect(() => registry.getConsumedKinds("missing")).toThrow("Projection not found");
  });

  test("replays events when no projection consumes their kind", async () => {
    const applied: string[] = [];
    const projection: EventProjection<{ applied: string[] }> = {
      name: "learning-only",
      consumedKinds: ["learning"],
      apply: async (memoryEvent, context) => {
        context.applied.push(memoryEvent.eventId);
      },
    };
    const registry = new ProjectionRegistry([projection]);

    const result = await registry.replay(
      [event("decision", "unmatched-event", "not consumed")],
      { applied }
    );

    expect(result.processedEvents).toBe(1);
    expect(result.skippedDuplicateEvents).toBe(0);
    expect(result.appliedProjections).toEqual([]);
    expect(applied).toEqual([]);
  });
});
