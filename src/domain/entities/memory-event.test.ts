import { describe, expect, test } from "bun:test";
import { MemoryEventEnvelope } from "./memory-event.js";

function createEnvelope(overrides: Partial<Parameters<typeof MemoryEventEnvelope.create>[0]> = {}) {
  return MemoryEventEnvelope.create({
    machineId: "machine-devbox",
    sequence: 42,
    kind: "decision",
    operation: "add",
    occurredAt: new Date("2026-06-05T08:00:00Z"),
    observedAt: new Date("2026-06-05T08:00:01Z"),
    scope: {
      project: "memory-nexus",
      visibility: "project",
    },
    provenance: {
      source: "session",
      actor: "memory extract",
      method: "llm-extraction",
      sourceIds: ["session-123"],
    },
    privacy: {
      redactionState: "redacted",
      containsSensitiveContent: true,
      redactedFields: ["payload.fact.content"],
      policy: "default",
    },
    consent: {
      status: "granted",
      scopes: ["provider-egress"],
      grantedAt: new Date("2026-06-05T07:59:00Z"),
    },
    causality: {
      parentEventIds: ["parent-event"],
      supersedesEventIds: [],
      relatedEventIds: [],
    },
    payload: {
      fact: {
        uuid: "fact-123",
        type: "decision",
        project: "memory-nexus",
        content: "Use a canonical event envelope",
        metadata: { confidence: 0.91 },
        observedAt: "2026-06-05T08:00:01.000Z",
      },
    },
    ...overrides,
  });
}

describe("MemoryEventEnvelope", () => {
  test("creates schema-versioned envelopes with required metadata and integrity hashes", () => {
    const event = createEnvelope();

    expect(event.schemaVersion).toBe(2);
    expect(event.eventId).toMatch(/[0-9a-f-]{36}/);
    expect(event.machineId).toBe("machine-devbox");
    expect(event.sequence).toBe(42);
    expect(event.kind).toBe("decision");
    expect(event.operation).toBe("add");
    expect(event.integrity.algorithm).toBe("sha256");
    expect(event.integrity.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(event.integrity.envelopeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(event.privacy.redactionState).toBe("redacted");
    expect(event.consent.status).toBe("granted");
    expect(event.provenance.sourceIds).toEqual(["session-123"]);
  });

  test("round-trips JSON and verifies payload integrity", () => {
    const event = createEnvelope();

    const roundTripped = MemoryEventEnvelope.fromJSON(event.toJSON());

    expect(roundTripped.toJSON()).toEqual(event.toJSON());
  });

  test("rejects invalid identity, sequence, scope, provenance, privacy, consent, and dates", () => {
    expect(() => createEnvelope({ machineId: "" })).toThrow("machineId");
    expect(() => createEnvelope({ sequence: 0 })).toThrow("sequence");
    expect(() => createEnvelope({ occurredAt: new Date("invalid") })).toThrow("occurredAt");
    expect(() => createEnvelope({ observedAt: new Date("invalid") })).toThrow("observedAt");
    expect(() => createEnvelope({ scope: { project: "", visibility: "project" } })).toThrow("scope.project");
    expect(() => createEnvelope({ provenance: { source: "", actor: "memory", method: "extract" } })).toThrow("provenance.source");
    expect(() => createEnvelope({ privacy: { redactionState: "invalid" as never, containsSensitiveContent: false } })).toThrow("privacy.redactionState");
    expect(() => createEnvelope({ consent: { status: "invalid" as never, scopes: [] } })).toThrow("consent.status");
  });

  test("rejects tampered payloads when loading persisted JSON", () => {
    const persisted = createEnvelope().toJSON();
    (persisted.payload as { fact: { content: string } }).fact.content = "Tampered after hashing";

    expect(() => MemoryEventEnvelope.fromJSON(persisted)).toThrow("payload integrity");
  });

  test("rejects invalid persisted envelope records with specific validation errors", () => {
    const cases: Array<[string, (json: any) => unknown, string]> = [
      ["non-object", () => "not-an-envelope", "object"],
      ["wrong schema", (json) => ({ ...json, schemaVersion: 1 }), "schemaVersion"],
      ["missing integrity", (json) => {
        delete json.integrity;
        return json;
      }, "integrity"],
      ["empty event id", (json) => ({ ...json, eventId: "" }), "eventId"],
      ["empty machine id", (json) => ({ ...json, machineId: "" }), "machineId"],
      ["invalid sequence", (json) => ({ ...json, sequence: -1 }), "sequence"],
      ["empty kind", (json) => ({ ...json, kind: "" }), "kind"],
      ["invalid operation", (json) => ({ ...json, operation: "merge" }), "operation"],
      ["missing scope", (json) => ({ ...json, scope: null }), "scope"],
      ["invalid visibility", (json) => ({ ...json, scope: { project: "memory-nexus", visibility: "private" } }), "scope.visibility"],
      ["empty actor", (json) => ({ ...json, provenance: { ...json.provenance, actor: "" } }), "provenance.actor"],
      ["empty method", (json) => ({ ...json, provenance: { ...json.provenance, method: "" } }), "provenance.method"],
      ["invalid privacy boolean", (json) => ({ ...json, privacy: { ...json.privacy, containsSensitiveContent: "yes" } }), "privacy.containsSensitiveContent"],
      ["invalid consent date", (json) => ({ ...json, consent: { ...json.consent, expiresAt: "not-a-date" } }), "consent.expiresAt"],
      ["invalid payload", (json) => ({ ...json, payload: "not-an-object" }), "payload"],
      ["invalid integrity algorithm", (json) => ({ ...json, integrity: { ...json.integrity, algorithm: "md5" } }), "integrity.algorithm"],
      ["tampered envelope", (json) => ({ ...json, machineId: "different-machine" }), "envelope integrity"],
    ];

    for (const [, mutate, expected] of cases) {
      const persisted = createEnvelope().toJSON();
      expect(() => MemoryEventEnvelope.fromJSON(mutate(persisted))).toThrow(expected);
    }
  });

  test("protects nested payload and metadata from mutation", () => {
    const event = createEnvelope();
    const json = event.toJSON();

    (json.payload as { fact: { metadata: { confidence: number } } }).fact.metadata.confidence = 0.1;
    json.privacy.redactedFields?.push("payload.fact.metadata");
    json.consent.scopes.push("remote-sync");

    expect((event.payload as { fact: { metadata: { confidence: number } } }).fact.metadata.confidence).toBe(0.91);
    expect(event.privacy.redactedFields).toEqual(["payload.fact.content"]);
    expect(event.consent.scopes).toEqual(["provider-egress"]);
  });

  test("supports workspace-scoped events", () => {
    const event = createEnvelope({
      scope: {
        workspace: "workspace-a",
        visibility: "workspace",
      },
    });

    expect(event.scope.workspace).toBe("workspace-a");
    expect(event.scope.visibility).toBe("workspace");
  });

  test("normalizes optional create metadata to durable empty/default values", () => {
    const event = createEnvelope({
      scope: {
        visibility: "global",
      },
      provenance: {
        source: "session",
        actor: "memory extract",
        method: "llm-extraction",
      },
      privacy: {
        redactionState: "none",
        containsSensitiveContent: false,
      },
      consent: {
        status: "not_required",
        scopes: [],
        expiresAt: new Date("2026-06-06T08:00:00Z"),
      },
      causality: undefined,
    });

    expect(event.scope.project).toBeUndefined();
    expect(event.scope.workspace).toBeUndefined();
    expect(event.provenance.sourceIds).toEqual([]);
    expect(event.privacy.redactedFields).toBeUndefined();
    expect(event.consent.expiresAt).toBe("2026-06-06T08:00:00.000Z");
    expect(event.causality.parentEventIds).toEqual([]);
    expect(event.causality.supersedesEventIds).toEqual([]);
    expect(event.causality.relatedEventIds).toEqual([]);
  });

  test("normalizes missing persisted scalar fields to validation failures before integrity checks", () => {
    const cases: Array<[string, (json: any) => unknown, string]> = [
      ["eventId", (json) => ({ ...json, eventId: undefined }), "eventId"],
      ["machineId", (json) => ({ ...json, machineId: undefined }), "machineId"],
      ["occurredAt", (json) => ({ ...json, occurredAt: undefined }), "occurredAt"],
      ["observedAt", (json) => ({ ...json, observedAt: undefined }), "observedAt"],
    ];

    for (const [, mutate, expected] of cases) {
      const persisted = createEnvelope().toJSON();
      expect(() => MemoryEventEnvelope.fromJSON(mutate(persisted))).toThrow(expected);
    }
  });

  test("normalizes missing persisted integrity hashes to integrity failures", () => {
    const payloadHashMissing = createEnvelope().toJSON() as any;
    payloadHashMissing.integrity.payloadHash = undefined;
    expect(() => MemoryEventEnvelope.fromJSON(payloadHashMissing)).toThrow("payload integrity");

    const envelopeHashMissing = createEnvelope().toJSON() as any;
    envelopeHashMissing.integrity.envelopeHash = undefined;
    expect(() => MemoryEventEnvelope.fromJSON(envelopeHashMissing)).toThrow("envelope integrity");
  });

  test("rejects null persisted metadata blocks through shared validation", () => {
    const cases: Array<[string, (json: any) => unknown, string]> = [
      ["null provenance", (json) => ({ ...json, provenance: null }), "provenance.source"],
      ["null privacy", (json) => ({ ...json, privacy: null }), "privacy.redactionState"],
      ["null consent", (json) => ({ ...json, consent: null }), "consent.status"],
      ["null causality", (json) => ({ ...json, causality: null }), "envelope integrity"],
    ];

    for (const [, mutate, expected] of cases) {
      const persisted = createEnvelope().toJSON();
      expect(() => MemoryEventEnvelope.fromJSON(mutate(persisted))).toThrow(expected);
    }
  });

  test("rejects invalid create-time metadata instead of coercing it", () => {
    const cases: Array<[string, Partial<Parameters<typeof MemoryEventEnvelope.create>[0]>, string]> = [
      ["null scope", { scope: null as never }, "scope"],
      ["non-string project scope", { scope: { project: 123 as never, visibility: "project" } }, "scope.project"],
      ["non-string provenance source ids", { provenance: { source: "session", actor: "memory", method: "extract", sourceIds: [1 as never] } }, "provenance.sourceIds"],
      ["non-string privacy redacted fields", { privacy: { redactionState: "redacted", containsSensitiveContent: true, redactedFields: [1 as never] } }, "privacy.redactedFields"],
      ["non-string consent scopes", { consent: { status: "granted", scopes: [1 as never] } }, "consent.scopes"],
      ["non-string causality parents", { causality: { parentEventIds: [1 as never], supersedesEventIds: [], relatedEventIds: [] } }, "causality.parentEventIds"],
      ["undefined payload", { payload: undefined as never }, "payload"],
    ];

    for (const [, overrides, expected] of cases) {
      expect(() => createEnvelope(overrides)).toThrow(expected);
    }
  });
});
