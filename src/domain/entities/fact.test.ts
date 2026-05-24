/**
 * Fact Domain Entity Tests
 *
 * [TDD-RED]
 * Validates Fact entity invariants, UUID generation, structural validations,
 * defensive copies, and model mutation paths.
 */

import { describe, test, expect } from "bun:test";
import { Fact } from "./fact.js";

describe("Fact Entity", () => {
  test("creates a valid fact with auto-generated UUID", () => {
    const fact = Fact.create({
      type: "decision",
      project: "memory-nexus",
      content: "Use hybrid event-log SSOT for knowledge storage",
      metadata: { rationale: "Proven design in adjacent audit" },
      observedAt: new Date("2026-05-23T08:00:00Z"),
    });

    expect(fact.uuid).toBeDefined();
    expect(fact.uuid.length).toBe(36); // standard UUID v4 length
    expect(fact.type).toBe("decision");
    expect(fact.project).toBe("memory-nexus");
    expect(fact.content).toBe("Use hybrid event-log SSOT for knowledge storage");
    expect(fact.metadata).toEqual({ rationale: "Proven design in adjacent audit" });
    expect(fact.observedAt.toISOString()).toBe("2026-05-23T08:00:00.000Z");
    expect(fact.supersededAt).toBeNull();
    expect(fact.supersededBy).toBeNull();
  });

  test("accepts explicit valid UUID", () => {
    const explicitUuid = "abc12345-def6-7890-abcd-ef1234567890";
    const fact = Fact.create({
      uuid: explicitUuid,
      type: "learning",
      project: "memory-nexus",
      content: "Brave blocks showDirectoryPicker by default",
      observedAt: new Date(),
    });

    expect(fact.uuid).toBe(explicitUuid);
  });

  test("throws if name or project is empty", () => {
    expect(() => {
      Fact.create({
        type: "preference",
        project: "",
        content: "Be extremely concise",
        observedAt: new Date(),
      });
    }).toThrow("Fact project cannot be empty");

    expect(() => {
      Fact.create({
        type: "preference",
        project: "memory-nexus",
        content: "  ",
        observedAt: new Date(),
      });
    }).toThrow("Fact content cannot be empty");
  });

  test("throws on invalid type", () => {
    expect(() => {
      Fact.create({
        type: "invalid-type" as any,
        project: "memory-nexus",
        content: "Some facts",
        observedAt: new Date(),
      });
    }).toThrow("Invalid fact type");
  });

  test("protects metadata against mutation via defensive copying", () => {
    const meta = { nested: { value: 42 } };
    const fact = Fact.create({
      type: "observation",
      project: "memory-nexus",
      content: "Observation",
      metadata: meta,
      observedAt: new Date(),
    });

    // Mutate local reference
    meta.nested.value = 99;
    expect(fact.metadata?.nested.value).toBe(42);

    // Mutate returned reference
    const retrievedMeta = fact.metadata;
    if (retrievedMeta) {
      retrievedMeta.nested.value = 100;
    }
    expect(fact.metadata?.nested.value).toBe(42);
  });

  test("creates a new instance withId", () => {
    const fact = Fact.create({
      type: "friction",
      project: "memory-nexus",
      content: "Cli truncation issues in logs",
      observedAt: new Date(),
    });

    expect(fact.id).toBeUndefined();
    const persistedFact = fact.withId(99);
    expect(persistedFact.id).toBe(99);
    expect(persistedFact.uuid).toBe(fact.uuid);
    expect(persistedFact.type).toBe("friction");
  });

  test("creates a new instance withSuperseded", () => {
    const fact = Fact.create({
      type: "decision",
      project: "memory-nexus",
      content: "Decision 1",
      observedAt: new Date("2026-05-23T08:00:00Z"),
    });

    const supersededTime = new Date("2026-05-23T09:00:00Z");
    const replacementUuid = "xyz98765-def6-7890-abcd-ef1234567890";
    
    const supersededFact = fact.withSuperseded(supersededTime, replacementUuid);
    expect(supersededFact.supersededAt?.toISOString()).toBe(supersededTime.toISOString());
    expect(supersededFact.supersededBy).toBe(replacementUuid);
    expect(supersededFact.uuid).toBe(fact.uuid);
  });
});
