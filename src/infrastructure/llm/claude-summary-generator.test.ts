/**
 * ClaudeSummaryGenerator Tests
 *
 * Tests for the infrastructure adapter that shells out to claude -p
 * for generating structured summaries from session content.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import type { Writable, Readable } from "node:stream";
import { ClaudeSummaryGenerator } from "./claude-summary-generator.js";

/**
 * Creates a mock child process with controllable stdin/stdout/stderr streams.
 */
function createMockProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: Writable & { written: string };
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
  };

  const written: string[] = [];
  proc.stdin = Object.assign(new EventEmitter(), {
    write: (data: string) => {
      written.push(data);
      return true;
    },
    end: () => {},
    written: "",
    get writtenData() {
      return written.join("");
    },
  }) as any;
  // Store reference for test assertions
  (proc.stdin as any)._written = written;

  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 12345;

  return proc;
}

describe("ClaudeSummaryGenerator", () => {
  let generator: ClaudeSummaryGenerator;
  let spawnSpy: ReturnType<typeof spyOn>;
  let originalClaudeCode: string | undefined;

  beforeEach(() => {
    generator = new ClaudeSummaryGenerator();
    originalClaudeCode = process.env.CLAUDECODE;
  });

  afterEach(() => {
    spawnSpy?.mockRestore();
    // Restore CLAUDECODE env var
    if (originalClaudeCode !== undefined) {
      process.env.CLAUDECODE = originalClaudeCode;
    } else {
      delete process.env.CLAUDECODE;
    }
  });

  it("spawns claude with -p and --output-format text flags", async () => {
    const mockProc = createMockProcess();
    spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

    const promise = generator.generateSummary(
      "User: hello\n\nAssistant: hi there",
      "session-123",
      "kanbanflow",
      "2026-03-08T10:00:00Z",
      "2026-03-08T11:00:00Z",
    );

    // Emit response
    mockProc.stdout.emit("data", Buffer.from("## Session: session-123"));
    mockProc.emit("close", 0);

    await promise;

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnSpy.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toContain("-p");
    expect(args).toContain("--output-format");
    expect(args).toContain("text");
  });

  it("returns stdout output trimmed", async () => {
    const mockProc = createMockProcess();
    spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

    const promise = generator.generateSummary(
      "content",
      "s1",
      "proj",
      "2026-03-08T10:00:00Z",
      "2026-03-08T11:00:00Z",
    );

    mockProc.stdout.emit("data", Buffer.from("  Summary text  \n"));
    mockProc.emit("close", 0);

    const result = await promise;
    expect(result).toBe("Summary text");
  });

  it("strips CLAUDECODE env var from child process environment", async () => {
    process.env.CLAUDECODE = "1";

    const mockProc = createMockProcess();
    spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

    const promise = generator.generateSummary(
      "content",
      "s1",
      "proj",
      "2026-03-08T10:00:00Z",
      "2026-03-08T11:00:00Z",
    );

    mockProc.stdout.emit("data", Buffer.from("summary"));
    mockProc.emit("close", 0);

    await promise;

    const spawnOptions = spawnSpy.mock.calls[0][2] as { env: Record<string, string> };
    expect(spawnOptions.env).toBeDefined();
    expect(spawnOptions.env.CLAUDECODE).toBeUndefined();
  });

  it("rejects with error when claude -p exits with non-zero code", async () => {
    const mockProc = createMockProcess();
    spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

    const promise = generator.generateSummary(
      "content",
      "s1",
      "proj",
      "2026-03-08T10:00:00Z",
      "2026-03-08T11:00:00Z",
    );

    mockProc.stderr.emit("data", Buffer.from("API rate limit exceeded"));
    mockProc.emit("close", 1);

    await expect(promise).rejects.toThrow("claude -p exited with code 1");
    await expect(promise).rejects.toThrow("API rate limit exceeded");
  });

  it("rejects with error when claude -p is not found (ENOENT)", async () => {
    const mockProc = createMockProcess();
    spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

    const promise = generator.generateSummary(
      "content",
      "s1",
      "proj",
      "2026-03-08T10:00:00Z",
      "2026-03-08T11:00:00Z",
    );

    mockProc.emit("error", new Error("spawn claude ENOENT"));

    await expect(promise).rejects.toThrow("Failed to spawn claude -p");
    await expect(promise).rejects.toThrow("ENOENT");
  });

  it("sends prompt containing session metadata and content to stdin", async () => {
    const mockProc = createMockProcess();
    spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

    const content = "User: What is Bun?\n\nAssistant: Bun is a JS runtime.";
    const promise = generator.generateSummary(
      content,
      "session-abc-123",
      "memory-nexus",
      "2026-03-08T10:00:00Z",
      "2026-03-08T11:30:00Z",
    );

    mockProc.stdout.emit("data", Buffer.from("summary"));
    mockProc.emit("close", 0);

    await promise;

    // Verify stdin received the prompt
    const stdinWritten = (mockProc.stdin as any)._written;
    expect(stdinWritten.length).toBeGreaterThan(0);
    const prompt = stdinWritten.join("");

    // Verify prompt contains session metadata
    expect(prompt).toContain("session-abc-123");
    expect(prompt).toContain("memory-nexus");
    expect(prompt).toContain("2026-03-08T10:00:00Z");
    expect(prompt).toContain("2026-03-08T11:30:00Z");

    // Verify prompt contains session content
    expect(prompt).toContain("What is Bun?");
    expect(prompt).toContain("Bun is a JS runtime");

    // Verify prompt requests daily log format sections
    expect(prompt).toContain("Topic");
    expect(prompt).toContain("Decisions");
    expect(prompt).toContain("Outcomes");
    expect(prompt).toContain("Unresolved");
    expect(prompt).toContain("Learnings");
    expect(prompt).toContain("Key Files");
  });

  it("handles multi-chunk stdout data", async () => {
    const mockProc = createMockProcess();
    spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

    const promise = generator.generateSummary(
      "content",
      "s1",
      "proj",
      "2026-03-08T10:00:00Z",
      "2026-03-08T11:00:00Z",
    );

    mockProc.stdout.emit("data", Buffer.from("## Session: s1\n"));
    mockProc.stdout.emit("data", Buffer.from("### Topic\n"));
    mockProc.stdout.emit("data", Buffer.from("Something happened"));
    mockProc.emit("close", 0);

    const result = await promise;
    expect(result).toBe("## Session: s1\n### Topic\nSomething happened");
  });
});
