/**
 * Show Formatter Tests
 *
 * Tests for session detail formatting with conversation thread display.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  createShowFormatter,
  summarizeToolResult,
  type SessionDetail,
  type ShowOutputMode,
} from "./show-formatter.js";
import { Session } from "../../../domain/entities/session.js";
import { Message } from "../../../domain/entities/message.js";
import { ToolUse } from "../../../domain/entities/tool-use.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";

/**
 * Create a test session with default values.
 */
function createTestSession(overrides: Partial<{
  id: string;
  projectName: string;
  startTime: Date;
  endTime: Date | undefined;
}> = {}): Session {
  const projectPath = ProjectPath.fromDecoded(
    `C:\\Users\\Test\\Projects\\${overrides.projectName ?? "test-project"}`
  );
  return Session.create({
    id: overrides.id ?? "session-abc123def456",
    projectPath,
    startTime: overrides.startTime ?? new Date("2026-01-15T10:00:00Z"),
    endTime: "endTime" in overrides
      ? overrides.endTime
      : new Date("2026-01-15T11:30:00Z"),
  });
}

/**
 * Create a test message.
 */
function createTestMessage(overrides: Partial<{
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolUseIds: string[];
}> = {}): Message {
  return Message.create({
    id: overrides.id ?? "msg-1",
    role: overrides.role ?? "user",
    content: overrides.content ?? "Test message content",
    timestamp: overrides.timestamp ?? new Date("2026-01-15T10:05:00Z"),
    toolUseIds: overrides.toolUseIds,
  });
}

/**
 * Create a test tool use.
 */
function createTestToolUse(overrides: Partial<{
  id: string;
  name: string;
  input: Record<string, unknown>;
  timestamp: Date;
  status: "pending" | "success" | "error";
  result: string | undefined;
}> = {}): ToolUse {
  return ToolUse.create({
    id: overrides.id ?? "tool-1",
    name: overrides.name ?? "Read",
    input: overrides.input ?? { file_path: "/path/to/file.ts" },
    timestamp: overrides.timestamp ?? new Date("2026-01-15T10:06:00Z"),
    status: overrides.status ?? "success",
    result: "result" in overrides ? overrides.result : "file content here",
  });
}

/**
 * Create a session detail object.
 */
function createSessionDetail(overrides: Partial<{
  session: Session;
  messages: Message[];
  toolUses: Map<string, ToolUse>;
}> = {}): SessionDetail {
  return {
    session: overrides.session ?? createTestSession(),
    messages: overrides.messages ?? [],
    toolUses: overrides.toolUses ?? new Map(),
  };
}

describe("ShowFormatter", () => {
  describe("DefaultShowFormatter", () => {
    test("formats header with all metadata", () => {
      const formatter = createShowFormatter("default", false);
      const session = createTestSession({
        id: "abc123def456789",
        projectName: "my-project",
        startTime: new Date("2026-01-15T10:00:00Z"),
        endTime: new Date("2026-01-15T11:30:00Z"),
      });
      const messages = [
        createTestMessage({ id: "msg-1", role: "user" }),
        createTestMessage({ id: "msg-2", role: "assistant" }),
      ];
      const detail = createSessionDetail({ session, messages });

      const output = formatter.formatSession(detail);

      expect(output).toContain("Session: abc123def456789");
      expect(output).toContain("Project: my-project");
      expect(output).toContain("Duration:");
      expect(output).toContain("1h 30m");
      expect(output).toContain("Messages: 2");
      expect(output).toContain("Tools: 0");
      expect(output).toContain("---");
    });

    test("formats conversation thread in order", () => {
      const formatter = createShowFormatter("default", false);
      const messages = [
        createTestMessage({
          id: "msg-1",
          role: "user",
          content: "What is this file?",
          timestamp: new Date("2026-01-15T10:05:00Z"),
        }),
        createTestMessage({
          id: "msg-2",
          role: "assistant",
          content: "This is a TypeScript file.",
          timestamp: new Date("2026-01-15T10:06:00Z"),
        }),
        createTestMessage({
          id: "msg-3",
          role: "user",
          content: "Can you explain more?",
          timestamp: new Date("2026-01-15T10:07:00Z"),
        }),
      ];
      const detail = createSessionDetail({ messages });

      const output = formatter.formatSession(detail);

      // Check order by finding positions
      const userPos1 = output.indexOf("What is this file?");
      const assistantPos = output.indexOf("This is a TypeScript file.");
      const userPos2 = output.indexOf("Can you explain more?");

      expect(userPos1).toBeLessThan(assistantPos);
      expect(assistantPos).toBeLessThan(userPos2);

      // Check role prefixes
      expect(output).toContain("[USER]");
      expect(output).toContain("[ASSISTANT]");
    });

    test("adds inline tool markers for assistant messages", () => {
      const formatter = createShowFormatter("default", false);
      const toolUse = createTestToolUse({
        id: "tool-read-1",
        name: "Read",
        input: { file_path: "/src/main.ts" },
        result: "line1\nline2\nline3\nline4\nline5",
      });
      const messages = [
        createTestMessage({
          id: "msg-1",
          role: "assistant",
          content: "Let me read the file.",
          toolUseIds: ["tool-read-1"],
        }),
      ];
      const toolUses = new Map<string, ToolUse>([["tool-read-1", toolUse]]);
      const detail = createSessionDetail({ messages, toolUses });

      const output = formatter.formatSession(detail);

      expect(output).toContain("[Read:");
      expect(output).toContain("main.ts");
      expect(output).toContain("5 lines");
    });

    test("skips inline tool markers when referenced tool records are missing", () => {
      const formatter = createShowFormatter("default", false);
      const detail = createSessionDetail({
        messages: [
          createTestMessage({
            role: "assistant",
            content: "I called a tool that is no longer present in storage.",
            toolUseIds: ["missing-tool"],
          }),
        ],
        toolUses: new Map(),
      });

      const output = formatter.formatSession(detail);

      expect(output).toContain("I called a tool");
      expect(output).not.toContain("[missing-tool");
    });

    test("handles ongoing session (no end time)", () => {
      const formatter = createShowFormatter("default", false);
      const session = createTestSession({
        startTime: new Date("2026-01-15T10:00:00Z"),
        endTime: undefined,
      });
      const detail = createSessionDetail({ session });

      const output = formatter.formatSession(detail);

      expect(output).toContain("ongoing");
    });

    test("formats sub-minute and minute durations", () => {
      const formatter = createShowFormatter("default", false);

      const shortOutput = formatter.formatSession(createSessionDetail({
        session: createTestSession({
          startTime: new Date("2026-01-15T10:00:00Z"),
          endTime: new Date("2026-01-15T10:00:30Z"),
        }),
      }));
      const minuteOutput = formatter.formatSession(createSessionDetail({
        session: createTestSession({
          startTime: new Date("2026-01-15T10:00:00Z"),
          endTime: new Date("2026-01-15T10:05:00Z"),
        }),
      }));

      expect(shortOutput).toContain("< 1m");
      expect(minuteOutput).toContain("5m");
    });

    test("formats singular hour and minute durations", () => {
      const formatter = createShowFormatter("default", false);
      const output = formatter.formatSession(createSessionDetail({
        session: createTestSession({
          startTime: new Date("2026-01-15T10:00:00Z"),
          endTime: new Date("2026-01-15T11:01:00Z"),
        }),
      }));

      expect(output).toContain("1h 1m");
    });
  });

  describe("summarizeToolResult", () => {
    test("handles Read tool", () => {
      const tool = createTestToolUse({
        name: "Read",
        input: { file_path: "/path/to/config.json" },
        result: "line1\nline2\nline3",
      });

      const summary = summarizeToolResult(tool);

      expect(summary).toContain("config.json");
      expect(summary).toContain("3 lines");
    });

    test("falls back to the original path when a path ends with a separator", () => {
      const tool = createTestToolUse({
        name: "Write",
        input: { file_path: "C:\\Projects\\memory\\" },
      });

      expect(summarizeToolResult(tool)).toBe("C:\\Projects\\memory\\");
    });

    test("handles Read tool without a result", () => {
      const tool = createTestToolUse({
        name: "Read",
        input: { file_path: "C:\\tmp\\empty.txt" },
        result: undefined as unknown as string,
      });

      expect(summarizeToolResult(tool)).toBe("empty.txt -> 0 lines");
    });

    test("handles Write tool", () => {
      const tool = createTestToolUse({
        name: "Write",
        input: { file_path: "/src/output.ts", content: "export const x = 1;" },
        status: "success",
      });

      const summary = summarizeToolResult(tool);

      expect(summary).toBe("output.ts");
    });

    test("handles Bash tool success", () => {
      const tool = createTestToolUse({
        name: "Bash",
        input: { command: "npm test --coverage" },
        status: "success",
        result: "All tests passed",
      });

      const summary = summarizeToolResult(tool);

      expect(summary).toContain("npm test");
    });

    test("keeps short Bash commands untruncated", () => {
      const tool = createTestToolUse({
        name: "Bash",
        input: { command: "pwd" },
        status: "success",
      });

      expect(summarizeToolResult(tool)).toBe("pwd");
    });

    test("handles Bash tool failure", () => {
      const tool = createTestToolUse({
        name: "Bash",
        input: { command: "npm test --coverage" },
        status: "error",
        result: "Tests failed",
      });

      const summary = summarizeToolResult(tool);

      expect(summary).toBe("FAILED");
    });

    test("handles Glob tool", () => {
      const tool = createTestToolUse({
        name: "Glob",
        input: { pattern: "**/*.ts" },
        status: "success",
        result: "file1.ts\nfile2.ts\nfile3.ts",
      });

      const summary = summarizeToolResult(tool);

      expect(summary).toBe("3 files");
    });

    test("handles Glob tool without a result", () => {
      const tool = createTestToolUse({
        name: "Glob",
        input: { pattern: "**/*.ts" },
        result: undefined as unknown as string,
      });

      expect(summarizeToolResult(tool)).toBe("0 files");
    });

    test("handles Grep tool success", () => {
      const tool = createTestToolUse({
        name: "Grep",
        input: { pattern: "TODO" },
        status: "success",
        result: "found matches",
      });

      const summary = summarizeToolResult(tool);

      expect(summary).toBe("matches");
    });

    test("handles Grep tool no matches", () => {
      const tool = createTestToolUse({
        name: "Grep",
        input: { pattern: "NOTFOUND" },
        status: "error",
        result: "",
      });

      const summary = summarizeToolResult(tool);

      expect(summary).toBe("no matches");
    });

    test("handles Edit tool", () => {
      const tool = createTestToolUse({
        name: "Edit",
        input: { file_path: "/src/app.ts", old_string: "a", new_string: "b" },
        status: "success",
      });

      const summary = summarizeToolResult(tool);

      expect(summary).toBe("app.ts edited");
    });

    test("handles unknown tool gracefully", () => {
      const tool = createTestToolUse({
        name: "CustomTool",
        input: { custom: "params" },
        status: "success",
      });

      const summary = summarizeToolResult(tool);

      expect(summary).toBe("success");
    });
  });

  describe("ToolsShowFormatter", () => {
    test("shows full tool inputs", () => {
      const formatter = createShowFormatter("tools", false);
      const toolUse = createTestToolUse({
        id: "tool-1",
        name: "Read",
        input: { file_path: "/src/main.ts" },
        result: "content",
      });
      const messages = [
        createTestMessage({
          id: "msg-1",
          role: "assistant",
          content: "Reading file.",
          toolUseIds: ["tool-1"],
        }),
      ];
      const toolUses = new Map<string, ToolUse>([["tool-1", toolUse]]);
      const detail = createSessionDetail({ messages, toolUses });

      const output = formatter.formatSession(detail);

      expect(output).toContain("[TOOL: Read]");
      expect(output).toContain("Input:");
      expect(output).toContain("file_path");
      expect(output).toContain("/src/main.ts");
    });

    test("shows tool results truncated at 500 chars", () => {
      const formatter = createShowFormatter("tools", false);
      const longResult = "x".repeat(1000);
      const toolUse = createTestToolUse({
        id: "tool-1",
        name: "Read",
        input: { file_path: "/src/main.ts" },
        result: longResult,
      });
      const messages = [
        createTestMessage({
          id: "msg-1",
          role: "assistant",
          content: "Reading file.",
          toolUseIds: ["tool-1"],
        }),
      ];
      const toolUses = new Map<string, ToolUse>([["tool-1", toolUse]]);
      const detail = createSessionDetail({ messages, toolUses });

      const output = formatter.formatSession(detail);

      expect(output).toContain("Result:");
      expect(output).toContain("...");
      // The result section should be truncated
      const resultIndex = output.indexOf("Result:");
      const afterResult = output.substring(resultIndex);
      // Count x's in the result - should be ~500 not 1000
      const xCount = (afterResult.match(/x/g) || []).length;
      expect(xCount).toBeLessThanOrEqual(520); // Allow for some buffer
    });

    test("shows tool status", () => {
      const formatter = createShowFormatter("tools", false);
      const toolUse = createTestToolUse({
        id: "tool-1",
        name: "Bash",
        input: { command: "npm test" },
        status: "success",
        result: "OK",
      });
      const messages = [
        createTestMessage({
          id: "msg-1",
          role: "assistant",
          content: "Running tests.",
          toolUseIds: ["tool-1"],
        }),
      ];
      const toolUses = new Map<string, ToolUse>([["tool-1", toolUse]]);
      const detail = createSessionDetail({ messages, toolUses });

      const output = formatter.formatSession(detail);

      expect(output).toContain("Status: success");
    });

    test("omits detailed tool result when a tool has no result", () => {
      const formatter = createShowFormatter("tools", false);
      const toolUse = createTestToolUse({
        id: "tool-no-result",
        name: "Bash",
        input: { command: "true" },
        result: "",
      });
      const messages = [
        createTestMessage({
          id: "msg-1",
          role: "assistant",
          content: "Running command.",
          toolUseIds: ["tool-no-result"],
        }),
      ];
      const detail = createSessionDetail({
        messages,
        toolUses: new Map<string, ToolUse>([["tool-no-result", toolUse]]),
      });

      const output = formatter.formatSession(detail);
      expect(output).toContain("[TOOL: Bash]");
      expect(output).toContain("Status: success");
      expect(output).not.toContain("Result:");
    });

    test("skips detailed tool output when referenced tool records are missing", () => {
      const formatter = createShowFormatter("tools", false);
      const detail = createSessionDetail({
        messages: [
          createTestMessage({
            role: "assistant",
            content: "Tool record missing.",
            toolUseIds: ["missing-tool"],
          }),
        ],
        toolUses: new Map(),
      });

      const output = formatter.formatSession(detail);

      expect(output).toContain("Tool record missing.");
      expect(output).not.toContain("[TOOL:");
    });
  });

  describe("JsonShowFormatter", () => {
    test("outputs valid JSON", () => {
      const formatter = createShowFormatter("json", false);
      const session = createTestSession({ id: "json-test-123" });
      const messages = [
        createTestMessage({ id: "msg-1", role: "user", content: "Hello" }),
      ];
      const detail = createSessionDetail({ session, messages });

      const output = formatter.formatSession(detail);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty("session");
      expect(parsed.session.id).toBe("json-test-123");
      expect(parsed).toHaveProperty("messages");
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.messages[0].content).toBe("Hello");
    });

    test("includes toolUses keyed by id", () => {
      const formatter = createShowFormatter("json", false);
      const toolUse = createTestToolUse({
        id: "tool-json-1",
        name: "Read",
        input: { file_path: "/test.ts" },
      });
      const messages = [
        createTestMessage({
          id: "msg-1",
          role: "assistant",
          content: "Reading",
          toolUseIds: ["tool-json-1"],
        }),
      ];
      const toolUses = new Map<string, ToolUse>([["tool-json-1", toolUse]]);
      const detail = createSessionDetail({ messages, toolUses });

      const output = formatter.formatSession(detail);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty("toolUses");
      expect(parsed.toolUses).toHaveProperty("tool-json-1");
      expect(parsed.toolUses["tool-json-1"].name).toBe("Read");
    });

    test("serializes nullable session end time, duration, and tool result", () => {
      const formatter = createShowFormatter("json", false);
      const toolUse = createTestToolUse({
        id: "tool-json-null",
        result: undefined as unknown as string,
      });
      const detail = createSessionDetail({
        session: createTestSession({ endTime: undefined }),
        toolUses: new Map<string, ToolUse>([["tool-json-null", toolUse]]),
      });

      const parsed = JSON.parse(formatter.formatSession(detail));
      expect(parsed.session.endTime).toBeNull();
      expect(parsed.session.durationMs).toBeNull();
      expect(parsed.toolUses["tool-json-null"].result).toBeNull();
    });

    test("formats error and not-found as JSON", () => {
      const formatter = createShowFormatter("json", false);

      expect(JSON.parse(formatter.formatError(new Error("bad")))).toEqual({ error: "bad" });
      expect(JSON.parse(formatter.formatNotFound("missing")).error).toContain("missing");
    });
  });

  describe("VerboseShowFormatter", () => {
    test("adds execution details header", () => {
      const formatter = createShowFormatter("verbose", false);
      const detail = createSessionDetail();

      const output = formatter.formatSession(detail, { executionTimeMs: 150 });

      expect(output).toContain("=== Execution Details ===");
      expect(output).toContain("Time: 150ms");
    });

    test("shows full session ID in header", () => {
      const formatter = createShowFormatter("verbose", false);
      const session = createTestSession({ id: "verbose-full-session-id-here" });
      const detail = createSessionDetail({ session });

      const output = formatter.formatSession(detail);

      expect(output).toContain("verbose-full-session-id-here");
    });

    test("shows full tool results without truncation", () => {
      const formatter = createShowFormatter("verbose", false);
      const longResult = "x".repeat(1000);
      const toolUse = createTestToolUse({
        id: "tool-1",
        name: "Read",
        input: { file_path: "/src/main.ts" },
        result: longResult,
      });
      const messages = [
        createTestMessage({
          id: "msg-1",
          role: "assistant",
          content: "Reading file.",
          toolUseIds: ["tool-1"],
        }),
      ];
      const toolUses = new Map<string, ToolUse>([["tool-1", toolUse]]);
      const detail = createSessionDetail({ messages, toolUses });

      const output = formatter.formatSession(detail);

      // Verbose mode should include all 1000 x's
      const xCount = (output.match(/x/g) || []).length;
      expect(xCount).toBe(1000);
    });

    test("shows verbose tool status without a result block when result is empty", () => {
      const formatter = createShowFormatter("verbose", false);
      const toolUse = createTestToolUse({
        id: "tool-empty-result",
        name: "Bash",
        input: { command: "true" },
        result: "",
      });
      const messages = [
        createTestMessage({
          id: "msg-1",
          role: "assistant",
          content: "Running command.",
          toolUseIds: ["tool-empty-result"],
        }),
      ];
      const detail = createSessionDetail({
        messages,
        toolUses: new Map<string, ToolUse>([["tool-empty-result", toolUse]]),
      });

      const output = formatter.formatSession(detail);
      expect(output).toContain("[TOOL: Bash]");
      expect(output).toContain("Status: success");
      expect(output).not.toContain("Result:");
    });

    test("formats errors with stack and not-found messages", () => {
      const formatter = createShowFormatter("verbose", false);
      const errorOutput = formatter.formatError(new Error("verbose failure"));

      expect(errorOutput).toContain("verbose failure");
      expect(errorOutput).toContain("at");
      expect(formatter.formatNotFound("missing-verbose")).toContain("missing-verbose");
    });

    test("handles verbose errors without stacks and missing tool records", () => {
      const formatter = createShowFormatter("verbose", false);
      const error = new Error("no stack");
      error.stack = undefined;
      const detail = createSessionDetail({
        messages: [
          createTestMessage({
            role: "assistant",
            content: "Verbose missing tool.",
            toolUseIds: ["missing-tool"],
          }),
        ],
        toolUses: new Map(),
      });

      const output = formatter.formatSession(detail);

      expect(output).toContain("Verbose missing tool.");
      expect(output).not.toContain("[TOOL:");
      expect(formatter.formatError(error)).toBe("Error: no stack\n");
    });
  });

  describe("QuietShowFormatter", () => {
    test("outputs minimal format - just message content", () => {
      const formatter = createShowFormatter("quiet", false);
      const messages = [
        createTestMessage({ id: "msg-1", role: "user", content: "Hello world" }),
        createTestMessage({ id: "msg-2", role: "assistant", content: "Hi there" }),
      ];
      const detail = createSessionDetail({ messages });

      const output = formatter.formatSession(detail);

      // Should have message content
      expect(output).toContain("Hello world");
      expect(output).toContain("Hi there");
      // Should NOT have session header
      expect(output).not.toContain("Session:");
      expect(output).not.toContain("Project:");
      expect(output).not.toContain("Duration:");
    });

    test("formats errors and not-found messages", () => {
      const formatter = createShowFormatter("quiet", false);

      expect(formatter.formatError(new Error("quiet failure"))).toContain("quiet failure");
      expect(formatter.formatNotFound("missing-quiet")).toContain("missing-quiet");
    });
  });

  describe("BriefShowFormatter", () => {
    test("outputs a single-line session summary", () => {
      const formatter = createShowFormatter("brief", false);
      const detail = createSessionDetail({
        session: createTestSession({ id: "brief-session", projectName: "brief-project" }),
        messages: [
          createTestMessage({ id: "msg-1" }),
          createTestMessage({ id: "msg-2" }),
        ],
      });

      const output = formatter.formatSession(detail);

      expect(output).toContain("brief-session | brief-project | 2 messages");
      expect(output).not.toContain("\n");
    });

    test("formats errors and not-found messages", () => {
      const formatter = createShowFormatter("brief", false);

      expect(formatter.formatError(new Error("brief failure"))).toContain("brief failure");
      expect(formatter.formatNotFound("missing-brief")).toContain("missing-brief");
    });
  });

  describe("ToolsShowFormatter errors", () => {
    test("formats errors and not-found messages", () => {
      const formatter = createShowFormatter("tools", false);

      expect(formatter.formatError(new Error("tools failure"))).toContain("tools failure");
      expect(formatter.formatNotFound("missing-tools")).toContain("missing-tools");
    });
  });

  describe("formatNotFound", () => {
    test("returns appropriate message", () => {
      const formatter = createShowFormatter("default", false);

      const output = formatter.formatNotFound("missing-session-id");

      expect(output).toContain("missing-session-id");
      expect(output).toContain("not found");
    });
  });

  describe("formatError", () => {
    test("includes error message", () => {
      const formatter = createShowFormatter("default", false);
      const error = new Error("Database connection failed");

      const output = formatter.formatError(error);

      expect(output).toContain("Database connection failed");
      expect(output).toContain("Error:");
    });
  });
});
