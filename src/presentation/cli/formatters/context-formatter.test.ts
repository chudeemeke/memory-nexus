/**
 * Context Formatter Tests
 *
 * Tests for context output formatting across all modes.
 */

import { describe, it, expect } from "bun:test";
import {
  createContextFormatter,
  type ContextOutputMode,
  type ContextFormatOptions,
} from "./context-formatter.js";
import type { ProjectContext } from "../../../infrastructure/database/services/context-service.js";

/**
 * Helper to create test context.
 */
function createTestContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    projectName: "test-project",
    projectPathDecoded: "C:\\Projects\\test-project",
    sessionCount: 15,
    totalMessages: 2340,
    userMessages: 980,
    assistantMessages: 1360,
    recentTopics: ["authentication", "testing", "refactoring"],
    recentToolUses: [
      { name: "Read", count: 45 },
      { name: "Write", count: 23 },
      { name: "Bash", count: 12 },
    ],
    lastActivity: new Date("2026-01-30T14:23:45Z"),
    ...overrides,
  };
}

describe("createContextFormatter", () => {
  it("should create brief formatter for default mode", () => {
    const formatter = createContextFormatter("default", false);
    expect(formatter).toBeDefined();
  });

  it("should create brief formatter for brief mode", () => {
    const formatter = createContextFormatter("brief", false);
    expect(formatter).toBeDefined();
  });

  it("should create detailed formatter", () => {
    const formatter = createContextFormatter("detailed", false);
    expect(formatter).toBeDefined();
  });

  it("should create json formatter", () => {
    const formatter = createContextFormatter("json", false);
    expect(formatter).toBeDefined();
  });

  it("should create quiet formatter", () => {
    const formatter = createContextFormatter("quiet", false);
    expect(formatter).toBeDefined();
  });

  it("should create verbose formatter", () => {
    const formatter = createContextFormatter("verbose", false);
    expect(formatter).toBeDefined();
  });
});

describe("BriefContextFormatter", () => {
  it("should show compact single-line structure", () => {
    const formatter = createContextFormatter("brief", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);

    expect(output).toContain("test-project Context");
    expect(output).toContain("Sessions: 15");
    expect(output).toContain("Messages: 2,340");
    expect(output).toContain("Last active:");
  });

  it("should show topics when present", () => {
    const formatter = createContextFormatter("brief", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);

    expect(output).toContain("Topics:");
    expect(output).toContain("authentication");
    expect(output).toContain("testing");
  });

  it("should show tools when present", () => {
    const formatter = createContextFormatter("brief", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);

    expect(output).toContain("Tools:");
    expect(output).toContain("Read (45)");
    expect(output).toContain("Write (23)");
  });

  it("should show (+N more) when topics exceed limit", () => {
    const formatter = createContextFormatter("brief", false);
    const context = createTestContext({
      recentTopics: ["a", "b", "c", "d", "e", "f"],
    });

    const output = formatter.formatContext(context);

    // Shows first 3 topics then (+3 more)
    expect(output).toContain("(+3 more)");
  });

  it("should omit topics section when empty", () => {
    const formatter = createContextFormatter("brief", false);
    const context = createTestContext({ recentTopics: [] });

    const output = formatter.formatContext(context);

    expect(output).not.toContain("Topics:");
  });

  it("should omit tools section when empty", () => {
    const formatter = createContextFormatter("brief", false);
    const context = createTestContext({ recentToolUses: [] });

    const output = formatter.formatContext(context);

    expect(output).not.toContain("Tools:");
  });

  it("should format error message", () => {
    const formatter = createContextFormatter("brief", false);
    const error = new Error("Database connection failed");

    const output = formatter.formatError(error);

    expect(output).toBe("Error: Database connection failed");
  });

  it("should format empty state message", () => {
    const formatter = createContextFormatter("brief", false);

    const output = formatter.formatEmpty("unknown-project");

    expect(output).toContain("No sessions found");
    expect(output).toContain("unknown-project");
  });
});

describe("DetailedContextFormatter", () => {
  it("should show full breakdown with separator", () => {
    const formatter = createContextFormatter("detailed", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);

    expect(output).toContain("test-project Context");
    expect(output).toContain("=".repeat(40));
    expect(output).toContain("Project: C:\\Projects\\test-project");
    expect(output).toContain("Sessions: 15");
  });

  it("should show message breakdown", () => {
    const formatter = createContextFormatter("detailed", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);

    expect(output).toContain("Messages: 2,340 (user: 980, assistant: 1,360)");
  });

  it("should show full timestamp for last activity", () => {
    const formatter = createContextFormatter("detailed", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);

    expect(output).toContain("Last active:");
    expect(output).toContain("2026-01-30");
  });

  it("should list all topics", () => {
    const formatter = createContextFormatter("detailed", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);

    expect(output).toContain("Topics:");
    expect(output).toContain("  - authentication");
    expect(output).toContain("  - testing");
    expect(output).toContain("  - refactoring");
  });

  it("should list all tools with counts", () => {
    const formatter = createContextFormatter("detailed", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);

    expect(output).toContain("Tool Usage:");
    expect(output).toContain("  - Read: 45 times");
    expect(output).toContain("  - Write: 23 times");
    expect(output).toContain("  - Bash: 12 times");
  });

  it("should show message when no topics", () => {
    const formatter = createContextFormatter("detailed", false);
    const context = createTestContext({ recentTopics: [] });

    const output = formatter.formatContext(context);

    expect(output).toContain("Topics:");
    expect(output).toContain("no topics extracted yet");
  });

  it("should show message when no tools", () => {
    const formatter = createContextFormatter("detailed", false);
    const context = createTestContext({ recentToolUses: [] });

    const output = formatter.formatContext(context);

    expect(output).toContain("Tool Usage:");
    expect(output).toContain("no tool usage recorded");
  });
});

describe("JsonContextFormatter", () => {
  it("should output valid JSON", () => {
    const formatter = createContextFormatter("json", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);
    const parsed = JSON.parse(output);

    expect(parsed.projectName).toBe("test-project");
    expect(parsed.projectPath).toBe("C:\\Projects\\test-project");
    expect(parsed.sessionCount).toBe(15);
    expect(parsed.totalMessages).toBe(2340);
    expect(parsed.userMessages).toBe(980);
    expect(parsed.assistantMessages).toBe(1360);
  });

  it("should include topics array", () => {
    const formatter = createContextFormatter("json", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);
    const parsed = JSON.parse(output);

    expect(Array.isArray(parsed.topics)).toBe(true);
    expect(parsed.topics).toContain("authentication");
  });

  it("should include toolUsage array", () => {
    const formatter = createContextFormatter("json", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);
    const parsed = JSON.parse(output);

    expect(Array.isArray(parsed.toolUsage)).toBe(true);
    expect(parsed.toolUsage[0]).toEqual({ name: "Read", count: 45 });
  });

  it("should format lastActivity as ISO string", () => {
    const formatter = createContextFormatter("json", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);
    const parsed = JSON.parse(output);

    expect(parsed.lastActivity).toBe("2026-01-30T14:23:45.000Z");
  });

  it("should handle null lastActivity", () => {
    const formatter = createContextFormatter("json", false);
    const context = createTestContext({ lastActivity: null });

    const output = formatter.formatContext(context);
    const parsed = JSON.parse(output);

    expect(parsed.lastActivity).toBeNull();
  });

  it("should format error as JSON", () => {
    const formatter = createContextFormatter("json", false);
    const error = new Error("Test error");

    const output = formatter.formatError(error);
    const parsed = JSON.parse(output);

    expect(parsed.error).toBe("Test error");
  });

  it("should format empty as JSON error", () => {
    const formatter = createContextFormatter("json", false);

    const output = formatter.formatEmpty("missing-project");
    const parsed = JSON.parse(output);

    expect(parsed.error).toContain("missing-project");
  });
});

describe("QuietContextFormatter", () => {
  it("should show minimal single-line output", () => {
    const formatter = createContextFormatter("quiet", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);

    expect(output).toBe("test-project: 15 sessions, 2,340 messages");
  });

  it("should return empty string for formatEmpty", () => {
    const formatter = createContextFormatter("quiet", false);

    const output = formatter.formatEmpty("any-project");

    expect(output).toBe("");
  });

  it("should return empty string for formatNoTopics", () => {
    const formatter = createContextFormatter("quiet", false);

    const output = formatter.formatNoTopics();

    expect(output).toBe("");
  });
});

describe("VerboseContextFormatter", () => {
  it("should show execution timing", () => {
    const formatter = createContextFormatter("verbose", false);
    const context = createTestContext();
    const options: ContextFormatOptions = {
      executionTimeMs: 42,
    };

    const output = formatter.formatContext(context, options);

    expect(output).toContain("=== Execution Details ===");
    expect(output).toContain("Time: 42ms");
  });

  it("should show filters applied", () => {
    const formatter = createContextFormatter("verbose", false);
    const context = createTestContext();
    const options: ContextFormatOptions = {
      filtersApplied: ["days: 7"],
    };

    const output = formatter.formatContext(context, options);

    expect(output).toContain("Filters: days: 7");
  });

  it("should include detailed output after execution info", () => {
    const formatter = createContextFormatter("verbose", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);

    // Should include detailed content
    expect(output).toContain("Project: C:\\Projects\\test-project");
    expect(output).toContain("Topics:");
    expect(output).toContain("Tool Usage:");
  });

  it("should include stack trace in error", () => {
    const formatter = createContextFormatter("verbose", false);
    const error = new Error("Test error with stack");

    const output = formatter.formatError(error);

    expect(output).toContain("Error: Test error with stack");
    expect(output).toContain("at"); // Stack trace contains "at"
  });
});

describe("Color Support", () => {
  it("should apply bold when useColor is true", () => {
    const formatter = createContextFormatter("brief", true);
    const context = createTestContext();

    const output = formatter.formatContext(context);

    // ANSI bold code
    expect(output).toContain("\x1b[1m");
    expect(output).toContain("\x1b[0m");
  });

  it("should not apply bold when useColor is false", () => {
    const formatter = createContextFormatter("brief", false);
    const context = createTestContext();

    const output = formatter.formatContext(context);

    expect(output).not.toContain("\x1b[1m");
  });

  it("should apply dim for no topics message when useColor is true", () => {
    const formatter = createContextFormatter("detailed", true);
    const context = createTestContext({ recentTopics: [] });

    const output = formatter.formatContext(context);

    // ANSI dim code
    expect(output).toContain("\x1b[2m");
  });
});

describe("Number Formatting", () => {
  it("should format large numbers with thousands separator", () => {
    const formatter = createContextFormatter("brief", false);
    const context = createTestContext({ totalMessages: 1234567 });

    const output = formatter.formatContext(context);

    expect(output).toContain("1,234,567");
  });

  it("should format small numbers without separator", () => {
    const formatter = createContextFormatter("brief", false);
    const context = createTestContext({ totalMessages: 999 });

    const output = formatter.formatContext(context);

    expect(output).toContain("999");
    expect(output).not.toContain("0,999");
  });
});
