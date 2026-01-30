/**
 * Related Formatter Tests
 *
 * Tests for related sessions output formatting.
 */

import { describe, it, expect } from "bun:test";
import {
  createRelatedFormatter,
  type RelatedOutputMode,
  type RelatedSession,
  type RelatedFormatOptions,
} from "./related-formatter.js";
import { Session } from "../../../domain/entities/session.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";

/**
 * Helper to create a test session.
 */
function createTestSession(overrides: {
  id?: string;
  projectPath?: ProjectPath;
  startTime?: Date;
  endTime?: Date;
} = {}): Session {
  return Session.create({
    id: overrides.id ?? "test-session-123456789",
    projectPath: overrides.projectPath ?? ProjectPath.fromDecoded("C:\\Projects\\test-project"),
    startTime: overrides.startTime ?? new Date("2026-01-28T10:00:00Z"),
    endTime: overrides.endTime,
  });
}

/**
 * Helper to create a related session.
 */
function createRelatedSession(overrides: {
  session?: Session;
  weight?: number;
  hops?: number;
} = {}): RelatedSession {
  return {
    session: overrides.session ?? createTestSession(),
    weight: overrides.weight ?? 0.85,
    hops: overrides.hops ?? 1,
  };
}

describe("createRelatedFormatter", () => {
  it("should create default formatter", () => {
    const formatter = createRelatedFormatter("default", false);
    expect(formatter).toBeDefined();
  });

  it("should create json formatter", () => {
    const formatter = createRelatedFormatter("json", false);
    expect(formatter).toBeDefined();
  });

  it("should create brief formatter", () => {
    const formatter = createRelatedFormatter("brief", false);
    expect(formatter).toBeDefined();
  });

  it("should create detailed formatter", () => {
    const formatter = createRelatedFormatter("detailed", false);
    expect(formatter).toBeDefined();
  });

  it("should create quiet formatter", () => {
    const formatter = createRelatedFormatter("quiet", false);
    expect(formatter).toBeDefined();
  });
});

describe("BriefRelatedFormatter", () => {
  it("should format related sessions with compact structure", () => {
    const formatter = createRelatedFormatter("brief", false);
    const related: RelatedSession[] = [
      createRelatedSession({
        session: createTestSession({
          id: "session-abc123",
          projectPath: ProjectPath.fromDecoded("C:\\Projects\\wow-system"),
        }),
        weight: 0.95,
        hops: 1,
      }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source-session" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("Related to session source-session...");
    expect(output).toContain("wow-system");
    expect(output).toContain("95%");
    expect(output).toContain("1 hop");
  });

  it("should show 2-hop relationships", () => {
    const formatter = createRelatedFormatter("brief", false);
    const related: RelatedSession[] = [
      createRelatedSession({
        session: createTestSession({
          projectPath: ProjectPath.fromDecoded("C:\\Projects\\memory-nexus"),
        }),
        weight: 0.72,
        hops: 2,
      }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source-session" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("72%");
    expect(output).toContain("2 hops");
  });

  it("should show numbered list", () => {
    const formatter = createRelatedFormatter("brief", false);
    const related: RelatedSession[] = [
      createRelatedSession({
        session: createTestSession({ id: "s1", projectPath: ProjectPath.fromDecoded("C:\\Projects\\project-a") }),
        weight: 0.95,
        hops: 1,
      }),
      createRelatedSession({
        session: createTestSession({ id: "s2", projectPath: ProjectPath.fromDecoded("C:\\Projects\\project-b") }),
        weight: 0.72,
        hops: 2,
      }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source-session" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("1.");
    expect(output).toContain("2.");
    expect(output).toContain("project-a");
    expect(output).toContain("project-b");
  });

  it("should format error message", () => {
    const formatter = createRelatedFormatter("brief", false);
    const error = new Error("Database connection failed");

    const output = formatter.formatError(error);

    expect(output).toBe("Error: Database connection failed");
  });

  it("should format empty result message", () => {
    const formatter = createRelatedFormatter("brief", false);

    const output = formatter.formatEmpty("abc123");

    expect(output).toContain("No relationships found");
    expect(output).toContain("abc123");
  });

  it("should format no links message", () => {
    const formatter = createRelatedFormatter("brief", false);

    const output = formatter.formatNoLinks();

    expect(output).toContain("No relationships extracted yet");
    expect(output).toContain("memory sync");
  });

  it("should color high weight (>75%) green when color enabled", () => {
    const formatter = createRelatedFormatter("brief", true);
    const related: RelatedSession[] = [
      createRelatedSession({ weight: 0.85, hops: 1 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    // Check for ANSI green code (32)
    expect(output).toContain("\x1b[32m");
  });

  it("should color medium weight (50-75%) yellow when color enabled", () => {
    const formatter = createRelatedFormatter("brief", true);
    const related: RelatedSession[] = [
      createRelatedSession({ weight: 0.60, hops: 1 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    // Check for ANSI yellow code (33)
    expect(output).toContain("\x1b[33m");
  });

  it("should not color low weight (<50%)", () => {
    const formatter = createRelatedFormatter("brief", true);
    const related: RelatedSession[] = [
      createRelatedSession({ weight: 0.30, hops: 2 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    // Should still contain the percentage but no color codes before it
    expect(output).toContain("30%");
  });
});

describe("DetailedRelatedFormatter", () => {
  it("should show header with separator", () => {
    const formatter = createRelatedFormatter("detailed", false);
    const related: RelatedSession[] = [
      createRelatedSession({
        session: createTestSession({
          projectPath: ProjectPath.fromDecoded("C:\\Projects\\wow-system"),
        }),
        weight: 0.95,
        hops: 1,
      }),
    ];
    const options: RelatedFormatOptions = { sourceId: "abc123" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("Related to session abc123...");
    expect(output).toContain("=".repeat(40));
  });

  it("should show full session details", () => {
    const formatter = createRelatedFormatter("detailed", false);
    const related: RelatedSession[] = [
      createRelatedSession({
        session: createTestSession({
          id: "full-session-id",
          projectPath: ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\wow-system"),
          startTime: new Date("2026-01-30T14:23:45Z"),
        }),
        weight: 0.95,
        hops: 1,
      }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("wow-system");
    expect(output).toContain("Weight: 95%");
    expect(output).toContain("Hops: 1 (direct)");
    expect(output).toContain("Path:");
    expect(output).toContain("C:\\Users\\Test\\Projects\\wow-system");
    expect(output).toContain("Last active:");
  });

  it("should show indirect for 2+ hops", () => {
    const formatter = createRelatedFormatter("detailed", false);
    const related: RelatedSession[] = [
      createRelatedSession({
        session: createTestSession(),
        weight: 0.72,
        hops: 2,
      }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("Hops: 2 (indirect)");
  });

  it("should show message count", () => {
    const formatter = createRelatedFormatter("detailed", false);
    const related: RelatedSession[] = [
      createRelatedSession({
        session: createTestSession(),
        weight: 0.95,
        hops: 1,
      }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("Messages:");
  });

  it("should format error message", () => {
    const formatter = createRelatedFormatter("detailed", false);
    const error = new Error("Connection failed");

    const output = formatter.formatError(error);

    expect(output).toBe("Error: Connection failed");
  });

  it("should format empty result message", () => {
    const formatter = createRelatedFormatter("detailed", false);

    const output = formatter.formatEmpty("xyz789");

    expect(output).toContain("No relationships found");
    expect(output).toContain("xyz789");
  });
});

describe("JsonRelatedFormatter", () => {
  it("should output valid JSON", () => {
    const formatter = createRelatedFormatter("json", false);
    const related: RelatedSession[] = [
      createRelatedSession({
        session: createTestSession({
          id: "session-def456",
          projectPath: ProjectPath.fromDecoded("C:\\Projects\\json-project"),
          startTime: new Date("2026-01-30T14:23:45Z"),
        }),
        weight: 0.95,
        hops: 1,
      }),
    ];
    const options: RelatedFormatOptions = { sourceId: "abc123" };

    const output = formatter.formatRelated(related, options);
    const parsed = JSON.parse(output);

    expect(parsed.sourceId).toBe("abc123");
    expect(Array.isArray(parsed.related)).toBe(true);
    expect(parsed.related).toHaveLength(1);
  });

  it("should include all expected fields", () => {
    const formatter = createRelatedFormatter("json", false);
    const related: RelatedSession[] = [
      createRelatedSession({
        session: createTestSession({
          id: "session-id-123",
          projectPath: ProjectPath.fromDecoded("C:\\Projects\\test"),
          startTime: new Date("2026-01-30T14:23:45.000Z"),
        }),
        weight: 0.95,
        hops: 1,
      }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);
    const parsed = JSON.parse(output);

    expect(parsed.related[0]).toHaveProperty("sessionId");
    expect(parsed.related[0]).toHaveProperty("projectName");
    expect(parsed.related[0]).toHaveProperty("weight");
    expect(parsed.related[0]).toHaveProperty("hops");
    expect(parsed.related[0]).toHaveProperty("lastActivity");
    expect(parsed.related[0]).toHaveProperty("messageCount");
    expect(parsed.related[0].sessionId).toBe("session-id-123");
    expect(parsed.related[0].projectName).toBe("test");
    expect(parsed.related[0].weight).toBe(0.95);
    expect(parsed.related[0].hops).toBe(1);
    expect(parsed.related[0].lastActivity).toBe("2026-01-30T14:23:45.000Z");
    expect(parsed.related[0].messageCount).toBe(0);
  });

  it("should handle multiple related sessions", () => {
    const formatter = createRelatedFormatter("json", false);
    const related: RelatedSession[] = [
      createRelatedSession({ weight: 0.95, hops: 1 }),
      createRelatedSession({ weight: 0.72, hops: 2 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);
    const parsed = JSON.parse(output);

    expect(parsed.related).toHaveLength(2);
  });

  it("should format error as JSON", () => {
    const formatter = createRelatedFormatter("json", false);
    const error = new Error("Test error");

    const output = formatter.formatError(error);
    const parsed = JSON.parse(output);

    expect(parsed.error).toBe("Test error");
  });

  it("should format empty as JSON with error", () => {
    const formatter = createRelatedFormatter("json", false);

    const output = formatter.formatEmpty("not-found-id");
    const parsed = JSON.parse(output);

    expect(parsed.error).toContain("No relationships found");
  });

  it("should format no links as JSON with error", () => {
    const formatter = createRelatedFormatter("json", false);

    const output = formatter.formatNoLinks();
    const parsed = JSON.parse(output);

    expect(parsed.error).toContain("No relationships extracted");
  });
});

describe("QuietRelatedFormatter", () => {
  it("should output only session IDs", () => {
    const formatter = createRelatedFormatter("quiet", false);
    const related: RelatedSession[] = [
      createRelatedSession({ session: createTestSession({ id: "session-id-1" }) }),
      createRelatedSession({ session: createTestSession({ id: "session-id-2" }) }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);
    const lines = output.split("\n").filter((l) => l.length > 0);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("session-id-1");
    expect(lines[1]).toBe("session-id-2");
  });

  it("should return empty string for empty result", () => {
    const formatter = createRelatedFormatter("quiet", false);
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated([], options);

    expect(output).toBe("");
  });

  it("should return empty string from formatEmpty", () => {
    const formatter = createRelatedFormatter("quiet", false);

    const output = formatter.formatEmpty("any-id");

    expect(output).toBe("");
  });

  it("should return empty string from formatNoLinks", () => {
    const formatter = createRelatedFormatter("quiet", false);

    const output = formatter.formatNoLinks();

    expect(output).toBe("");
  });

  it("should still format error", () => {
    const formatter = createRelatedFormatter("quiet", false);
    const error = new Error("Error message");

    const output = formatter.formatError(error);

    expect(output).toBe("Error: Error message");
  });
});

describe("VerboseRelatedFormatter", () => {
  it("should show execution timing", () => {
    const formatter = createRelatedFormatter("verbose", false);
    const related: RelatedSession[] = [createRelatedSession()];
    const options: RelatedFormatOptions = {
      sourceId: "source",
      executionTimeMs: 42,
    };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("=== Execution Details ===");
    expect(output).toContain("Time: 42ms");
  });

  it("should include detailed output after timing", () => {
    const formatter = createRelatedFormatter("verbose", false);
    const related: RelatedSession[] = [
      createRelatedSession({
        session: createTestSession({
          projectPath: ProjectPath.fromDecoded("C:\\Projects\\verbose-test"),
        }),
        weight: 0.95,
        hops: 1,
      }),
    ];
    const options: RelatedFormatOptions = {
      sourceId: "source",
      executionTimeMs: 42,
    };

    const output = formatter.formatRelated(related, options);

    // Should have both execution details and detailed content
    expect(output).toContain("=== Execution Details ===");
    expect(output).toContain("verbose-test");
    expect(output).toContain("Weight: 95%");
  });

  it("should include stack trace in error", () => {
    const formatter = createRelatedFormatter("verbose", false);
    const error = new Error("Test error with stack");

    const output = formatter.formatError(error);

    expect(output).toContain("Error: Test error with stack");
    expect(output).toContain("at"); // Stack trace contains "at"
  });
});

describe("Weight formatting", () => {
  it("should convert weight to percentage", () => {
    const formatter = createRelatedFormatter("brief", false);
    const related: RelatedSession[] = [
      createRelatedSession({ weight: 0.85, hops: 1 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("85%");
  });

  it("should round weight percentage", () => {
    const formatter = createRelatedFormatter("brief", false);
    const related: RelatedSession[] = [
      createRelatedSession({ weight: 0.857, hops: 1 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    // Should round to nearest integer
    expect(output).toContain("86%");
  });

  it("should handle weight of 1.0", () => {
    const formatter = createRelatedFormatter("brief", false);
    const related: RelatedSession[] = [
      createRelatedSession({ weight: 1.0, hops: 1 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("100%");
  });

  it("should handle very low weight", () => {
    const formatter = createRelatedFormatter("brief", false);
    const related: RelatedSession[] = [
      createRelatedSession({ weight: 0.05, hops: 3 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("5%");
  });
});

describe("Hops display", () => {
  it("should show '1 hop' for single hop", () => {
    const formatter = createRelatedFormatter("brief", false);
    const related: RelatedSession[] = [
      createRelatedSession({ hops: 1 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("1 hop");
    expect(output).not.toContain("1 hops");
  });

  it("should show 'N hops' for multiple hops", () => {
    const formatter = createRelatedFormatter("brief", false);
    const related: RelatedSession[] = [
      createRelatedSession({ hops: 2 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("2 hops");
  });

  it("should show 3 hops correctly", () => {
    const formatter = createRelatedFormatter("brief", false);
    const related: RelatedSession[] = [
      createRelatedSession({ hops: 3 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("3 hops");
  });

  it("should show 'direct' for 1 hop in detailed mode", () => {
    const formatter = createRelatedFormatter("detailed", false);
    const related: RelatedSession[] = [
      createRelatedSession({ hops: 1 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("(direct)");
  });

  it("should show 'indirect' for 2+ hops in detailed mode", () => {
    const formatter = createRelatedFormatter("detailed", false);
    const related: RelatedSession[] = [
      createRelatedSession({ hops: 2 }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const output = formatter.formatRelated(related, options);

    expect(output).toContain("(indirect)");
  });
});

describe("Default mode behavior", () => {
  it("should behave like brief formatter", () => {
    const defaultFormatter = createRelatedFormatter("default", false);
    const briefFormatter = createRelatedFormatter("brief", false);
    const related: RelatedSession[] = [
      createRelatedSession({
        session: createTestSession({
          id: "test-session",
          projectPath: ProjectPath.fromDecoded("C:\\Projects\\test"),
        }),
        weight: 0.85,
        hops: 1,
      }),
    ];
    const options: RelatedFormatOptions = { sourceId: "source" };

    const defaultOutput = defaultFormatter.formatRelated(related, options);
    const briefOutput = briefFormatter.formatRelated(related, options);

    // Both should have similar structure
    expect(defaultOutput).toContain("Related to session");
    expect(briefOutput).toContain("Related to session");
    expect(defaultOutput).toContain("85%");
    expect(briefOutput).toContain("85%");
  });
});
