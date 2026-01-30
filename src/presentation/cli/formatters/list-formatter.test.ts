/**
 * List Formatter Tests
 *
 * Tests for session list output formatting.
 */

import { describe, it, expect } from "bun:test";
import {
  createListFormatter,
  type ListOutputMode,
  type ListFormatOptions,
} from "./list-formatter.js";
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

describe("createListFormatter", () => {
  it("should create default formatter", () => {
    const formatter = createListFormatter("default", false);
    expect(formatter).toBeDefined();
  });

  it("should create json formatter", () => {
    const formatter = createListFormatter("json", false);
    expect(formatter).toBeDefined();
  });

  it("should create quiet formatter", () => {
    const formatter = createListFormatter("quiet", false);
    expect(formatter).toBeDefined();
  });

  it("should create verbose formatter", () => {
    const formatter = createListFormatter("verbose", false);
    expect(formatter).toBeDefined();
  });
});

describe("DefaultListFormatter", () => {
  it("should format sessions with columns", () => {
    const formatter = createListFormatter("default", false);
    const sessions = [
      createTestSession({
        id: "abc12345-session",
        projectPath: ProjectPath.fromDecoded("C:\\Projects\\memory-nexus"),
      }),
    ];

    const output = formatter.formatSessions(sessions);

    expect(output).toContain("Sessions (1 result):");
    expect(output).toContain("abc12345");
    expect(output).toContain("memory-nexus");
    expect(output).toContain("0 messages");
  });

  it("should show correct result count pluralization", () => {
    const formatter = createListFormatter("default", false);

    const singleSession = [createTestSession()];
    const multipleSessions = [createTestSession({ id: "s1" }), createTestSession({ id: "s2" })];

    expect(formatter.formatSessions(singleSession)).toContain("1 result");
    expect(formatter.formatSessions(multipleSessions)).toContain("2 results");
  });

  it("should format multiple sessions", () => {
    const formatter = createListFormatter("default", false);
    const sessions = [
      createTestSession({ id: "session-1-uuid-abcd", projectPath: ProjectPath.fromDecoded("C:\\Projects\\project-a") }),
      createTestSession({ id: "session-2-uuid-efgh", projectPath: ProjectPath.fromDecoded("C:\\Projects\\project-b") }),
    ];

    const output = formatter.formatSessions(sessions);

    // First 8 characters of session ID are shown
    expect(output).toContain("session-");
    expect(output).toContain("project-a");
    expect(output).toContain("project-b");
  });

  it("should format error message", () => {
    const formatter = createListFormatter("default", false);
    const error = new Error("Database connection failed");

    const output = formatter.formatError(error);

    expect(output).toBe("Error: Database connection failed");
  });

  it("should format empty state message", () => {
    const formatter = createListFormatter("default", false);

    const output = formatter.formatEmpty();

    expect(output).toBe("No sessions found. Run 'memory sync' to import sessions.");
  });

  it("should pluralize message count correctly", () => {
    const formatter = createListFormatter("default", false);
    // Session with 0 messages (messages property is always an empty array for created sessions)
    const session = createTestSession();

    const output = formatter.formatSessions([session]);

    expect(output).toContain("0 messages");
  });
});

describe("JsonListFormatter", () => {
  it("should output valid JSON", () => {
    const formatter = createListFormatter("json", false);
    const sessions = [
      createTestSession({
        id: "json-session-id",
        projectPath: ProjectPath.fromDecoded("C:\\Projects\\json-project"),
        startTime: new Date("2026-01-28T10:00:00Z"),
      }),
    ];

    const output = formatter.formatSessions(sessions);
    const parsed = JSON.parse(output);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("json-session-id");
    expect(parsed[0].projectName).toBe("json-project");
    expect(parsed[0].startTime).toBe("2026-01-28T10:00:00.000Z");
    expect(parsed[0].messageCount).toBe(0);
  });

  it("should include all session fields", () => {
    const formatter = createListFormatter("json", false);
    const sessions = [
      createTestSession({
        id: "full-session",
        projectPath: ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\test"),
        startTime: new Date("2026-01-28T10:00:00Z"),
        endTime: new Date("2026-01-28T11:00:00Z"),
      }),
    ];

    const output = formatter.formatSessions(sessions);
    const parsed = JSON.parse(output);

    expect(parsed[0]).toHaveProperty("id");
    expect(parsed[0]).toHaveProperty("projectPath");
    expect(parsed[0]).toHaveProperty("projectName");
    expect(parsed[0]).toHaveProperty("startTime");
    expect(parsed[0]).toHaveProperty("endTime");
    expect(parsed[0]).toHaveProperty("messageCount");
    expect(parsed[0].endTime).toBe("2026-01-28T11:00:00.000Z");
  });

  it("should handle null endTime", () => {
    const formatter = createListFormatter("json", false);
    const sessions = [createTestSession()];

    const output = formatter.formatSessions(sessions);
    const parsed = JSON.parse(output);

    expect(parsed[0].endTime).toBeNull();
  });

  it("should format error as JSON", () => {
    const formatter = createListFormatter("json", false);
    const error = new Error("Test error");

    const output = formatter.formatError(error);
    const parsed = JSON.parse(output);

    expect(parsed.error).toBe("Test error");
  });

  it("should format empty as empty array", () => {
    const formatter = createListFormatter("json", false);

    const output = formatter.formatEmpty();

    expect(output).toBe("[]");
  });
});

describe("QuietListFormatter", () => {
  it("should output only session IDs", () => {
    const formatter = createListFormatter("quiet", false);
    const sessions = [
      createTestSession({ id: "session-id-1" }),
      createTestSession({ id: "session-id-2" }),
    ];

    const output = formatter.formatSessions(sessions);
    const lines = output.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("session-id-1");
    expect(lines[1]).toBe("session-id-2");
  });

  it("should return empty string for empty result", () => {
    const formatter = createListFormatter("quiet", false);

    const output = formatter.formatSessions([]);

    expect(output).toBe("");
  });

  it("should return empty string from formatEmpty", () => {
    const formatter = createListFormatter("quiet", false);

    const output = formatter.formatEmpty();

    expect(output).toBe("");
  });
});

describe("VerboseListFormatter", () => {
  it("should show execution timing", () => {
    const formatter = createListFormatter("verbose", false);
    const sessions = [createTestSession()];
    const options: ListFormatOptions = {
      executionTimeMs: 42,
    };

    const output = formatter.formatSessions(sessions, options);

    expect(output).toContain("=== Execution Details ===");
    expect(output).toContain("Time: 42ms");
  });

  it("should show filters applied", () => {
    const formatter = createListFormatter("verbose", false);
    const sessions = [createTestSession()];
    const options: ListFormatOptions = {
      filtersApplied: ["limit: 10", "project: memory"],
    };

    const output = formatter.formatSessions(sessions, options);

    expect(output).toContain("Filters: limit: 10, project: memory");
  });

  it("should show full session ID", () => {
    const formatter = createListFormatter("verbose", false);
    const sessions = [
      createTestSession({ id: "full-session-uuid-that-is-long" }),
    ];

    const output = formatter.formatSessions(sessions);

    expect(output).toContain("full-session-uuid-that-is-long");
  });

  it("should show project path in verbose mode", () => {
    const formatter = createListFormatter("verbose", false);
    const sessions = [
      createTestSession({
        projectPath: ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\detailed-project"),
      }),
    ];

    const output = formatter.formatSessions(sessions);

    expect(output).toContain("detailed-project");
    expect(output).toContain("C:\\Users\\Test\\Projects\\detailed-project");
  });

  it("should format empty state same as default", () => {
    const formatter = createListFormatter("verbose", false);

    const output = formatter.formatEmpty();

    expect(output).toBe("No sessions found. Run 'memory sync' to import sessions.");
  });

  it("should include stack trace in error", () => {
    const formatter = createListFormatter("verbose", false);
    const error = new Error("Test error with stack");

    const output = formatter.formatError(error);

    expect(output).toContain("Error: Test error with stack");
    expect(output).toContain("at"); // Stack trace contains "at"
  });
});
