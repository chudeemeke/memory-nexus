/**
 * dto-helpers.test.ts
 *
 * Tests pure DTO helper functions extracted from JsonOutputFormatter
 * (per Codex MEDIUM-1).
 *
 * INVARIANT (Gemini LOW): highlight offsets MUST be computed BEFORE
 * <mark> tags are stripped from the snippet. Computing after-strip
 * would always produce offset 0 (no tags remain). Verified here.
 */

import { describe, expect, it } from "bun:test";
import { SearchResult } from "../../../domain/value-objects/search-result.js";
import { Session } from "../../../domain/entities/session.js";
import { Message } from "../../../domain/entities/message.js";
import { ToolUse } from "../../../domain/entities/tool-use.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";
import {
  toSearchResultDto,
  toFileResultDto,
  toSessionListDto,
  toShowSessionDto,
  toRelatedDto,
  toStatsDto,
  toContextDto,
} from "./dto-helpers.js";

describe("toSearchResultDto (Plan 32-02 MEDIUM-1)", () => {
  function makeResult(overrides: {
    snippet?: string;
    rawScores?: { bm25?: number; cosine?: number; rrf?: number };
    source?: "fts" | "vector" | "both";
  } = {}): SearchResult {
    return SearchResult.create({
      sessionId: "session-123",
      messageId: "message-456",
      snippet: overrides.snippet ?? "plain snippet",
      score: 0.5,
      timestamp: new Date("2026-01-15T12:00:00.000Z"),
      role: "user",
      source: overrides.source,
      rawScores: overrides.rawScores,
    });
  }

  describe("base shape", () => {
    it("returns sessionId, messageId, role, score, timestamp, snippet", () => {
      const r = makeResult();
      const dto = toSearchResultDto(r);
      expect(dto.sessionId).toBe("session-123");
      expect(dto.messageId).toBe("message-456");
      expect(dto.role).toBe("user");
      expect(dto.score).toBe(0.5);
      expect(dto.timestamp).toBe("2026-01-15T12:00:00.000Z");
      expect(dto.snippet).toBe("plain snippet");
    });

    it("strips <mark>...</mark> from the snippet", () => {
      const r = makeResult({ snippet: "foo <mark>bar</mark> baz" });
      const dto = toSearchResultDto(r);
      expect(dto.snippet).toBe("foo bar baz");
    });
  });

  describe("INVARIANT — highlights computed BEFORE strip (Gemini LOW)", () => {
    it("captures highlight offset/length on the clean text", () => {
      const r = makeResult({ snippet: "foo <mark>bar</mark> baz" });
      const dto = toSearchResultDto(r, { includeSearchMetaFields: true });
      // Offset is in the CLEAN snippet ("foo bar baz"). "bar" starts at index 4.
      expect(dto.highlights).toEqual([{ offset: 4, length: 3 }]);
      // The snippet field is the stripped form.
      expect(dto.snippet).toBe("foo bar baz");
    });

    it("captures highlights for multiple matches", () => {
      const r = makeResult({
        snippet: "<mark>a</mark> b <mark>c</mark>",
      });
      const dto = toSearchResultDto(r, { includeSearchMetaFields: true });
      expect(dto.highlights).toEqual([
        { offset: 0, length: 1 },
        { offset: 4, length: 1 },
      ]);
      expect(dto.snippet).toBe("a b c");
    });

    it("omits highlights field when none present (search-meta mode)", () => {
      const r = makeResult({ snippet: "no marks here" });
      const dto = toSearchResultDto(r, { includeSearchMetaFields: true });
      expect(dto.highlights).toBeUndefined();
    });

    it("does not include highlights when includeSearchMetaFields is false", () => {
      const r = makeResult({ snippet: "foo <mark>bar</mark> baz" });
      const dto = toSearchResultDto(r);
      expect(dto.highlights).toBeUndefined();
    });
  });

  describe("hybrid-search-meta fields (raw_scores, source, rank)", () => {
    it("includes rank when opts.rank is provided", () => {
      const r = makeResult();
      const dto = toSearchResultDto(r, {
        rank: 1,
        includeSearchMetaFields: true,
      });
      expect(dto.rank).toBe(1);
    });

    it("includes raw_scores when rawScores is present on the result", () => {
      const r = makeResult({ rawScores: { bm25: 0.7, cosine: 0.4 } });
      const dto = toSearchResultDto(r, {
        rank: 1,
        includeSearchMetaFields: true,
      });
      expect(dto.raw_scores).toEqual({ bm25: 0.7, cosine: 0.4 });
    });

    it("includes source when present", () => {
      const r = makeResult({ source: "both" });
      const dto = toSearchResultDto(r, {
        rank: 1,
        includeSearchMetaFields: true,
      });
      expect(dto.source).toBe("both");
    });

    it("does not leak hybrid fields when includeSearchMetaFields is false", () => {
      const r = makeResult({
        source: "fts",
        rawScores: { bm25: 0.9 },
      });
      const dto = toSearchResultDto(r);
      expect(dto.rank).toBeUndefined();
      expect(dto.raw_scores).toBeUndefined();
      expect(dto.source).toBeUndefined();
    });
  });

  describe("CONTEXT_BUDGET boundary documentation (no truncation here)", () => {
    it("does not truncate — caller owns context budget", () => {
      // The DTO helper is shape-only. CONTEXT_BUDGET truncation is the
      // formatter's responsibility (output-formatter.ts), preserved
      // per Codex MEDIUM-1 boundary.
      const longSnippet = "x".repeat(100_000);
      const r = makeResult({ snippet: longSnippet });
      const dto = toSearchResultDto(r);
      expect(dto.snippet.length).toBe(100_000);
    });
  });
});

describe("toFileResultDto (Plan 32-02 HIGH-4)", () => {
  it("returns minimum required fields when only score/file/title are present", () => {
    const dto = toFileResultDto({
      score: 0.42,
      file: "qmd://docs/foo.md",
      title: "Foo",
    });
    expect(dto.score).toBe(0.42);
    expect(dto.file).toBe("qmd://docs/foo.md");
    expect(dto.title).toBe("Foo");
    expect(dto.docid).toBeUndefined();
    expect(dto.context).toBeUndefined();
    expect(dto.snippet).toBeUndefined();
  });

  it("includes docid when present", () => {
    const dto = toFileResultDto({
      docid: "abc123",
      score: 0.8,
      file: "qmd://x.md",
      title: "X",
    });
    expect(dto.docid).toBe("abc123");
  });

  it("includes context when present", () => {
    const dto = toFileResultDto({
      score: 0.8,
      file: "qmd://x.md",
      title: "X",
      context: "around the match",
    });
    expect(dto.context).toBe("around the match");
  });

  it("includes snippet when present", () => {
    const dto = toFileResultDto({
      score: 0.8,
      file: "qmd://x.md",
      title: "X",
      snippet: "matched text",
    });
    expect(dto.snippet).toBe("matched text");
  });

  it("includes all optional fields together when all present", () => {
    const dto = toFileResultDto({
      docid: "id-1",
      score: 0.9,
      file: "qmd://y.md",
      title: "Y",
      context: "ctx",
      snippet: "snip",
    });
    expect(dto).toEqual({
      docid: "id-1",
      score: 0.9,
      file: "qmd://y.md",
      title: "Y",
      context: "ctx",
      snippet: "snip",
    });
  });
});

describe("toSessionListDto", () => {
  function makeSession(overrides: {
    endTime?: Date;
    summary?: string;
    messageCount?: number;
  } = {}): Session {
    const projectPath = ProjectPath.fromEncoded("C--Users-Test-Proj");
    return Session.create({
      id: "session-1",
      projectPath,
      startTime: new Date("2026-01-15T10:00:00.000Z"),
      endTime: overrides.endTime,
      summary: overrides.summary,
      messageCount: overrides.messageCount,
    });
  }

  it("returns minimal shape when endTime/messageCount/summary are absent", () => {
    const session = makeSession();
    const dto = toSessionListDto(session);
    expect(dto.id).toBe("session-1");
    expect(dto.startTime).toBe("2026-01-15T10:00:00.000Z");
    expect(dto.projectPath).toBe("C:\\Users\\Test\\Proj");
    expect(dto.project).toBe("Proj");
    expect(dto.endTime).toBeUndefined();
    expect(dto.summary).toBeUndefined();
    // messageCount has a fallback (messages.length = 0), so it's set when no explicit value
    // But the DTO only includes it if `session.messageCount !== undefined`.
    // Looking at Session.messageCount getter: returns _messageCount ?? messages.length
    // So it's always defined (number). DTO includes when not undefined.
    expect(dto.messageCount).toBe(0);
  });

  it("includes endTime when set", () => {
    const session = makeSession({
      endTime: new Date("2026-01-15T11:00:00.000Z"),
    });
    const dto = toSessionListDto(session);
    expect(dto.endTime).toBe("2026-01-15T11:00:00.000Z");
  });

  it("includes summary when set", () => {
    const session = makeSession({ summary: "Did some work" });
    const dto = toSessionListDto(session);
    expect(dto.summary).toBe("Did some work");
  });

  it("includes explicit messageCount when set", () => {
    const session = makeSession({ messageCount: 42 });
    const dto = toSessionListDto(session);
    expect(dto.messageCount).toBe(42);
  });
});

describe("toShowSessionDto", () => {
  it("transforms session detail with messages and tool uses", () => {
    const projectPath = ProjectPath.fromEncoded("C--Users-Test-Proj");
    const session = Session.create({
      id: "session-X",
      projectPath,
      startTime: new Date("2026-01-15T10:00:00.000Z"),
    });
    const message = Message.create({
      id: "msg-1",
      role: "user",
      content: "hello",
      timestamp: new Date("2026-01-15T10:05:00.000Z"),
    });
    const toolUse = ToolUse.create({
      id: "tool-1",
      name: "Read",
      input: { path: "/foo" },
      timestamp: new Date("2026-01-15T10:06:00.000Z"),
      status: "success",
      result: "ok",
    });
    const dto = toShowSessionDto({
      session,
      messages: [message],
      toolUses: new Map([[toolUse.id, toolUse]]),
    });
    expect(dto.session.id).toBe("session-X");
    expect(dto.messages).toHaveLength(1);
    expect(dto.messages[0].id).toBe("msg-1");
    expect(dto.messages[0].role).toBe("user");
    expect(dto.messages[0].content).toBe("hello");
    expect(dto.messages[0].timestamp).toBe("2026-01-15T10:05:00.000Z");
    expect(dto.toolUses).toHaveLength(1);
    expect(dto.toolUses[0].id).toBe("tool-1");
    expect(dto.toolUses[0].name).toBe("Read");
    expect(dto.toolUses[0].input).toEqual({ path: "/foo" });
    expect(dto.toolUses[0].result).toBe("ok");
  });

  it("omits tool result field when not present", () => {
    const projectPath = ProjectPath.fromEncoded("C--Users-Test-Proj");
    const session = Session.create({
      id: "session-Y",
      projectPath,
      startTime: new Date("2026-01-15T10:00:00.000Z"),
    });
    const toolUse = ToolUse.create({
      id: "tool-2",
      name: "Glob",
      input: { pattern: "*.ts" },
      timestamp: new Date("2026-01-15T10:06:00.000Z"),
    });
    const dto = toShowSessionDto({
      session,
      messages: [],
      toolUses: new Map([[toolUse.id, toolUse]]),
    });
    expect(dto.toolUses[0].result).toBeUndefined();
  });

  it("handles empty messages and toolUses", () => {
    const projectPath = ProjectPath.fromEncoded("C--Users-Test-Proj");
    const session = Session.create({
      id: "session-Z",
      projectPath,
      startTime: new Date("2026-01-15T10:00:00.000Z"),
    });
    const dto = toShowSessionDto({
      session,
      messages: [],
      toolUses: new Map(),
    });
    expect(dto.messages).toEqual([]);
    expect(dto.toolUses).toEqual([]);
  });
});

describe("toRelatedDto", () => {
  it("transforms a related session entry", () => {
    const projectPath = ProjectPath.fromEncoded("C--Users-Test-Proj");
    const session = Session.create({
      id: "session-rel",
      projectPath,
      startTime: new Date("2026-01-15T10:00:00.000Z"),
    });
    const dto = toRelatedDto({
      session,
      weight: 0.75,
      hops: 2,
    });
    expect(dto.session.id).toBe("session-rel");
    expect(dto.weight).toBe(0.75);
    expect(dto.hops).toBe(2);
  });
});

describe("toStatsDto", () => {
  it("transforms stats without hooks", () => {
    const dto = toStatsDto({
      totalSessions: 10,
      totalMessages: 100,
      totalToolUses: 50,
      databaseSizeBytes: 12345,
      projectBreakdown: [
        { projectName: "A", sessionCount: 5, messageCount: 50 },
        { projectName: "B", sessionCount: 5, messageCount: 50 },
      ],
    });
    expect(dto.totalSessions).toBe(10);
    expect(dto.totalMessages).toBe(100);
    expect(dto.totalToolUses).toBe(50);
    expect(dto.databaseSizeBytes).toBe(12345);
    expect(dto.projectBreakdown).toEqual([
      { projectName: "A", sessionCount: 5, messageCount: 50 },
      { projectName: "B", sessionCount: 5, messageCount: 50 },
    ]);
    expect(dto.hooks).toBeUndefined();
  });

  it("transforms stats with hooks", () => {
    const dto = toStatsDto({
      totalSessions: 0,
      totalMessages: 0,
      totalToolUses: 0,
      databaseSizeBytes: 0,
      projectBreakdown: [],
      hooks: {
        installed: true,
        autoSync: false,
        pendingSessions: 3,
      },
    });
    expect(dto.hooks).toEqual({
      installed: true,
      autoSync: false,
      pendingSessions: 3,
    });
  });

  it("transforms empty projectBreakdown", () => {
    const dto = toStatsDto({
      totalSessions: 0,
      totalMessages: 0,
      totalToolUses: 0,
      databaseSizeBytes: 0,
      projectBreakdown: [],
    });
    expect(dto.projectBreakdown).toEqual([]);
  });
});

describe("toContextDto", () => {
  it("transforms context with all fields present", () => {
    const dto = toContextDto({
      projectName: "Proj",
      projectPathDecoded: "C:\\Users\\Test\\Proj",
      sessionCount: 5,
      totalMessages: 50,
      userMessages: 25,
      assistantMessages: 25,
      recentTopics: ["topic1", "topic2"],
      recentToolUses: [
        { name: "Read", count: 10 },
        { name: "Write", count: 5 },
      ],
      lastActivity: new Date("2026-01-15T10:00:00.000Z"),
    });
    expect(dto.projectName).toBe("Proj");
    expect(dto.projectPathDecoded).toBe("C:\\Users\\Test\\Proj");
    expect(dto.sessionCount).toBe(5);
    expect(dto.totalMessages).toBe(50);
    expect(dto.userMessages).toBe(25);
    expect(dto.assistantMessages).toBe(25);
    expect(dto.recentTopics).toEqual(["topic1", "topic2"]);
    expect(dto.recentToolUses).toEqual([
      { name: "Read", count: 10 },
      { name: "Write", count: 5 },
    ]);
    expect(dto.lastActivity).toBe("2026-01-15T10:00:00.000Z");
  });

  it("returns null lastActivity when not present", () => {
    const dto = toContextDto({
      projectName: "Empty",
      projectPathDecoded: "C:\\Empty",
      sessionCount: 0,
      totalMessages: 0,
      userMessages: 0,
      assistantMessages: 0,
      recentTopics: [],
      recentToolUses: [],
      lastActivity: null,
    });
    expect(dto.lastActivity).toBeNull();
    expect(dto.recentTopics).toEqual([]);
    expect(dto.recentToolUses).toEqual([]);
  });

  it("creates a defensive copy of recentTopics (not the same reference)", () => {
    const topics = ["t1", "t2"];
    const dto = toContextDto({
      projectName: "Proj",
      projectPathDecoded: "C:\\Proj",
      sessionCount: 1,
      totalMessages: 1,
      userMessages: 1,
      assistantMessages: 0,
      recentTopics: topics,
      recentToolUses: [],
      lastActivity: null,
    });
    expect(dto.recentTopics).toEqual(topics);
    expect(dto.recentTopics).not.toBe(topics);
  });
});
