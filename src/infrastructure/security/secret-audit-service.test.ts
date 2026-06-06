import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryEventEnvelope } from "../../domain/entities/memory-event.js";
import { createSchema } from "../database/schema.js";
import { readMemoryEvents } from "../database/event-log.js";
import { PatternRedactor } from "./pattern-redactor.js";
import { SecretAuditService } from "./secret-audit-service.js";

describe("SecretAuditService", () => {
  let db: Database;
  let tempDir: string;
  let eventLogPath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `memory-secret-audit-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    eventLogPath = join(tempDir, "events.jsonl");
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("scans database and event logs without returning raw secrets", async () => {
    const secret = openAiLikeSecret();
    seedSecretRows(db, secret);
    writeFileSync(eventLogPath, JSON.stringify({ content: `event has ${secret}` }) + "\n", "utf-8");

    const report = await new SecretAuditService(new PatternRedactor()).audit({
      db,
      eventLogPaths: [eventLogPath],
    });

    expect(report.summary.totalFindings).toBeGreaterThanOrEqual(4);
    expect(report.findings.some((finding) =>
      finding.surface === "database" &&
      finding.table === "messages_meta" &&
      finding.column === "content"
    )).toBe(true);
    expect(report.findings.some((finding) =>
      finding.surface === "event_log" &&
      finding.filePath === eventLogPath &&
      finding.lineNumber === 1
    )).toBe(true);
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  test("tolerates empty and partial scan targets while writing redacted reports", async () => {
    const service = new SecretAuditService(new PatternRedactor());
    const emptyReport = await service.audit();

    expect(emptyReport.summary.totalFindings).toBe(0);
    expect(emptyReport.remediation.database.requested).toBe(false);
    expect(emptyReport.remediation.eventLogs.requested).toBe(false);

    const partialDb = new Database(":memory:");
    try {
      partialDb.exec(`
        CREATE TABLE sessions (summary TEXT);
        CREATE TABLE tool_uses (id TEXT);
      `);
      const reportPath = join(tempDir, "reports", "secret-audit.json");
      const report = await service.audit({
        db: partialDb,
        eventLogPaths: [join(tempDir, "missing-events.jsonl")],
        reportPath,
      });

      expect(report.summary.totalFindings).toBe(0);
      expect(existsSync(reportPath)).toBe(true);
      expect(JSON.parse(readFileSync(reportPath, "utf-8")).summary.totalFindings).toBe(0);
    } finally {
      partialDb.close();
    }
  });

  test("redacts mutable database content and rebuilds FTS indexes", async () => {
    const secret = openAiLikeSecret();
    seedSecretRows(db, secret);
    const token = ["phase38auditsecret", "abcdefghijklmnopqrstuvwxyz"].join("");

    expect(
      db.prepare<{ count: number }, [string]>("SELECT COUNT(*) AS count FROM messages_fts WHERE messages_fts MATCH ?")
        .get(token)?.count
    ).toBe(1);

    const report = await new SecretAuditService(new PatternRedactor()).audit({
      db,
      redactDatabase: true,
    });

    expect(report.remediation.database.updatedFields).toBeGreaterThanOrEqual(4);
    expect(report.remediation.database.rebuiltFtsIndexes).toEqual(
      expect.arrayContaining(["messages_fts", "facts_fts", "memory_files_fts", "sessions_fts"]),
    );

    const stored = JSON.stringify({
      messages: db.prepare("SELECT content FROM messages_meta").all(),
      tools: db.prepare("SELECT input, result FROM tool_uses").all(),
      facts: db.prepare("SELECT content, metadata FROM facts").all(),
      friction: db.prepare("SELECT description, context FROM friction_log").all(),
      memoryFiles: db.prepare("SELECT content FROM memory_files").all(),
      sessions: db.prepare("SELECT summary FROM sessions").all(),
    });
    expect(stored).not.toContain(secret);
    expect(stored).toContain("[REDACTED:");
    expect(
      db.prepare<{ count: number }, [string]>("SELECT COUNT(*) AS count FROM messages_fts WHERE messages_fts MATCH ?")
        .get(token)?.count
    ).toBe(0);

    const cleanReport = await new SecretAuditService(new PatternRedactor()).audit({ db });
    expect(cleanReport.summary.totalFindings).toBe(0);
  });

  test("redacts database content without FTS indexes when projections are absent", async () => {
    const secret = openAiLikeSecret();
    const leanDb = new Database(":memory:");

    try {
      leanDb.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          project_path_decoded TEXT,
          project_name TEXT,
          summary TEXT
        );
        INSERT INTO sessions (id, project_path_decoded, project_name, summary)
        VALUES ('session-lean', '/project', 'project', 'summary ${secret}');
      `);

      const report = await new SecretAuditService(new PatternRedactor()).audit({
        db: leanDb,
        redactDatabase: true,
      });

      expect(report.remediation.database.updatedFields).toBe(1);
      expect(report.remediation.database.rebuiltFtsIndexes).toEqual([]);
      expect(leanDb.prepare<{ summary: string }, []>("SELECT summary FROM sessions").get()?.summary)
        .not.toContain(secret);
    } finally {
      leanDb.close();
    }
  });

  test("quarantines raw event logs and leaves replayable sanitized v2 events active", async () => {
    const secret = openAiLikeSecret();
    const event = MemoryEventEnvelope.create({
      eventId: "event-secret",
      machineId: "machine-a",
      sequence: 1,
      kind: "observation",
      operation: "add",
      occurredAt: new Date("2026-06-05T10:00:00Z"),
      observedAt: new Date("2026-06-05T10:00:00Z"),
      scope: { project: "memory-nexus", visibility: "project" },
      provenance: {
        source: "test",
        actor: "memory",
        method: "secret-audit-test",
        sourceIds: ["event-secret"],
      },
      privacy: { redactionState: "none", containsSensitiveContent: false, redactedFields: ["payload.previous"] },
      consent: { status: "not_required", scopes: [] },
      causality: { parentEventIds: [], supersedesEventIds: [], relatedEventIds: [] },
      payload: { fact: { uuid: "event-secret", content: `event payload ${secret}` } },
    });
    writeFileSync(eventLogPath, JSON.stringify(event.toJSON()) + "\n", "utf-8");

    const quarantineDir = join(tempDir, "quarantine");
    const report = await new SecretAuditService(new PatternRedactor()).audit({
      eventLogPaths: [eventLogPath],
      quarantineEvents: true,
      quarantineDir,
    });

    expect(report.remediation.eventLogs.quarantinedFiles.length).toBe(1);
    expect(report.remediation.eventLogs.sanitizedFiles).toEqual([eventLogPath]);
    expect(JSON.stringify(report)).not.toContain(secret);

    const activeContent = readFileSync(eventLogPath, "utf-8");
    expect(activeContent).not.toContain(secret);
    expect(activeContent).toContain("[REDACTED:");

    const quarantinedPath = report.remediation.eventLogs.quarantinedFiles[0]!.quarantinedPath;
    expect(existsSync(quarantinedPath)).toBe(true);
    expect(readFileSync(quarantinedPath, "utf-8")).toContain(secret);

    const replayed = [];
    for await (const memoryEvent of readMemoryEvents(eventLogPath)) {
      replayed.push(memoryEvent);
    }
    expect(replayed).toHaveLength(1);
    expect(replayed[0]!.privacy.redactionState).toBe("redacted");
    expect(JSON.stringify(replayed[0]!.toJSON())).not.toContain(secret);
  });

  test("leaves clean JSON event log lines unchanged in read-only scans", async () => {
    writeFileSync(eventLogPath, JSON.stringify({ content: "clean event" }) + "\n", "utf-8");

    const report = await new SecretAuditService(new PatternRedactor()).audit({
      eventLogPaths: [eventLogPath],
    });

    expect(report.summary.totalFindings).toBe(0);
    expect(readFileSync(eventLogPath, "utf-8")).toBe(JSON.stringify({ content: "clean event" }) + "\n");
  });

  test("preserves CRLF event-log shape when quarantining plain-text logs", async () => {
    const secret = openAiLikeSecret();
    writeFileSync(eventLogPath, `first ${secret}\r\nsecond ${secret}\r\n`, "utf-8");

    const report = await new SecretAuditService(new PatternRedactor()).audit({
      eventLogPaths: [eventLogPath],
      quarantineEvents: true,
      quarantineDir: join(tempDir, "quarantine-crlf"),
    });

    const activeContent = readFileSync(eventLogPath, "utf-8");
    expect(report.summary.eventLogFindings).toBe(2);
    expect(activeContent).not.toContain(secret);
    expect(activeContent).toContain("\r\n");
    expect(activeContent.endsWith("\r\n")).toBe(true);
  });
});

function openAiLikeSecret(): string {
  return ["sk", ["phase38auditsecret", "abcdefghijklmnopqrstuvwxyz"].join("")].join("-");
}

function seedSecretRows(db: Database, secret: string): void {
  db.exec(`
    INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time, message_count, summary)
    VALUES ('session-secret', 'project', '/test/project', 'project', '2026-06-05T10:00:00Z', 1, 'summary ${secret}');
  `);
  db.exec(`
    INSERT INTO messages_meta (id, session_id, role, content, timestamp)
    VALUES ('msg-secret', 'session-secret', 'user', 'message ${secret}', '2026-06-05T10:00:00Z');
  `);
  db.exec(`
    INSERT INTO tool_uses (id, session_id, name, input, timestamp, status, result)
    VALUES ('tool-secret', 'session-secret', 'Bash', '{"apiKey":"short-runtime-secret"}', '2026-06-05T10:00:01Z', 'success', 'result ${secret}');
  `);
  db.exec(`
    INSERT INTO facts (uuid, type, project, content, metadata, observed_at)
    VALUES ('fact-secret', 'observation', 'project', 'fact ${secret}', '{"token":"short-token"}', '2026-06-05T10:00:02Z');
  `);
  db.exec(`
    INSERT INTO friction_log (description, severity, category, tool, status, context, logged_at)
    VALUES ('friction ${secret}', 'medium', 'cli', 'memory', 'open', 'context ${secret}', '2026-06-05T10:00:03Z');
  `);
  db.exec(`
    INSERT INTO memory_files (file_path, file_type, project_encoded, content, content_hash, last_indexed_at)
    VALUES ('/test/MEMORY.md', 'learnings', 'project', 'memory file ${secret}', 'hash', '2026-06-05T10:00:04Z');
  `);
}
