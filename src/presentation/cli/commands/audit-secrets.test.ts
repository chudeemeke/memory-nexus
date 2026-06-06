import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createAuditSecretsCommand,
  executeAuditSecretsCommand,
  type AuditSecretsCommandDeps,
} from "./audit-secrets.js";
import type { SecretAuditReport } from "../../../infrastructure/security/secret-audit-service.js";

describe("audit-secrets command", () => {
  const rawSecret = ["sk", "test_abcdefghijklmnopqrstuvwxyz123456"].join("-");
  let logs: string[];
  let errors: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let tempDir: string;

  beforeEach(() => {
    logs = [];
    errors = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
    tempDir = mkdtempSync(join(tmpdir(), "memory-audit-secrets-command-"));
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates command with the expected name and options", () => {
    const command = createAuditSecretsCommand();

    expect(command.name()).toBe("audit-secrets");
    expect(command.options.some((option) => option.long === "--redact-db")).toBe(true);
    expect(command.options.some((option) => option.long === "--quarantine-events")).toBe(true);
    expect(command.options.some((option) => option.long === "--report")).toBe(true);
  });

  it("returns exit code 1 for read-only findings and never prints raw secrets", async () => {
    const calls: unknown[] = [];
    const deps = depsWithReports([reportWithFinding()], calls);

    const result = await executeAuditSecretsCommand({
      json: true,
      eventLog: [join(tempDir, `${rawSecret}.jsonl`)],
    }, deps);

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(result.exitCode).toBe(1);
    expect(calls).toHaveLength(1);
    expect(parsed.scan.summary.totalFindings).toBe(1);
    expect(output).not.toContain(rawSecret);
    expect(output).toContain("[REDACTED:api_key:");
  });

  it("uses default options without requiring explicit arguments", async () => {
    const calls: unknown[] = [];
    const deps = depsWithReports([emptyReport()], calls, {
      databaseExists: () => false,
      getAllLogFiles: () => [],
    });

    const result = await executeAuditSecretsCommand(undefined, deps);

    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(logs.join("\n")).toContain("No suspected secrets found.");
  });

  it("verifies after remediation and exits 0 when no findings remain", async () => {
    const calls: any[] = [];
    const closed: Database[] = [];
    const db = {} as Database;
    const reportPath = join(tempDir, "reports", "audit.json");
    const deps = depsWithReports([reportWithFinding(), emptyReport()], calls, {
      initializeDatabase: () => ({ db }),
      closeDatabase: (closedDb) => closed.push(closedDb),
    });

    const result = await executeAuditSecretsCommand({
      redactDb: true,
      quarantineEvents: true,
      report: reportPath,
    }, deps);

    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0].redactDatabase).toBe(true);
    expect(calls[0].quarantineEvents).toBe(true);
    expect(calls[1].redactDatabase).toBeUndefined();
    expect(calls[1].quarantineEvents).toBeUndefined();
    expect(closed).toEqual([db]);

    const reportContent = readFileSync(reportPath, "utf-8");
    expect(reportContent).not.toContain(rawSecret);
    expect(JSON.parse(reportContent).verification.totalFindings).toBe(0);
  });

  it("returns exit code 2 and prints remediation evidence when findings remain after remediation", async () => {
    const calls: unknown[] = [];
    const deps = depsWithReports([
      reportWithFindings(21, {
        database: {
          requested: true,
          updatedFields: 3,
          rebuiltFtsIndexes: ["messages_fts"],
        },
        eventLogs: {
          requested: true,
          sanitizedFiles: ["events.jsonl"],
          quarantinedFiles: [{ originalPath: "events.jsonl", quarantinedPath: "quarantine/events.jsonl.raw" }],
        },
      }),
      reportWithFinding(),
    ], calls);

    const result = await executeAuditSecretsCommand({
      redactDb: true,
      quarantineEvents: true,
    }, deps);

    const output = logs.join("\n");
    expect(result.exitCode).toBe(2);
    expect(calls).toHaveLength(2);
    expect(output).toContain("... 1 more");
    expect(output).toContain("Remediation:");
    expect(output).toContain("Verification remaining findings: 1");
    expect(output).not.toContain(rawSecret);
  });

  it("does not create or open a missing database during read-only scan", async () => {
    const calls: any[] = [];
    let initializeCalled = false;
    const deps = depsWithReports([emptyReport()], calls, {
      databaseExists: () => false,
      initializeDatabase: () => {
        initializeCalled = true;
        return { db: {} as Database };
      },
    });

    const result = await executeAuditSecretsCommand({ skipEvents: true }, deps);

    expect(result.exitCode).toBe(0);
    expect(initializeCalled).toBe(false);
    expect(calls[0].db).toBeUndefined();
    expect(logs.join("\n")).toContain("Database: not found");
  });

  it("formats event-log findings and unknown database target paths", async () => {
    const missingPathDeps = depsWithReports([reportWithEventLogFinding()], [], {
      getDefaultDbPath: () => undefined as unknown as string,
      databaseExists: () => false,
    });

    const missingPathResult = await executeAuditSecretsCommand({}, missingPathDeps);

    expect(missingPathResult.exitCode).toBe(1);
    expect(logs.join("\n")).toContain("Database: not found (unknown)");
    expect(logs.join("\n")).toContain("event log events.jsonl:7");
    expect(logs.join("\n")).not.toContain(rawSecret);

    logs = [];

    const db = {} as Database;
    const scannedPathDeps = depsWithReports([emptyReport()], [], {
      getDefaultDbPath: () => undefined as unknown as string,
      databaseExists: () => true,
      initializeDatabase: () => ({ db }),
    });

    const scannedPathResult = await executeAuditSecretsCommand({ skipEvents: true }, scannedPathDeps);

    expect(scannedPathResult.exitCode).toBe(0);
    expect(logs.join("\n")).toContain("Database: scanned (unknown)");
  });

  it("returns exit code 2 for operational failures and redacts error text", async () => {
    const deps: AuditSecretsCommandDeps = {
      getDefaultDbPath: () => join(tempDir, "memory.db"),
      databaseExists: () => true,
      initializeDatabase: () => {
        throw new Error(`failed with ${rawSecret}`);
      },
    };

    const result = await executeAuditSecretsCommand({ json: true }, deps);

    const output = logs.join("\n");
    expect(result.exitCode).toBe(2);
    expect(output).not.toContain(rawSecret);
    expect(output).toContain("[REDACTED:api_key:");
  });

  it("prints redacted operational failures to stderr in text mode", async () => {
    const deps: AuditSecretsCommandDeps = {
      getDefaultDbPath: () => join(tempDir, "memory.db"),
      databaseExists: () => true,
      initializeDatabase: () => {
        throw new Error(`failed with ${rawSecret}`);
      },
    };

    const result = await executeAuditSecretsCommand({}, deps);

    expect(result.exitCode).toBe(2);
    expect(logs).toEqual([]);
    expect(errors.join("\n")).not.toContain(rawSecret);
    expect(errors.join("\n")).toContain("[REDACTED:api_key:");
  });
});

function depsWithReports(
  reports: SecretAuditReport[],
  calls: unknown[],
  overrides: Partial<AuditSecretsCommandDeps> = {},
): AuditSecretsCommandDeps {
  return {
    getDefaultDbPath: () => "C:\\Projects\\memory-nexus\\memory.db",
    databaseExists: () => true,
    initializeDatabase: () => ({ db: {} as Database }),
    closeDatabase: () => {},
    getAllLogFiles: () => ["C:\\Projects\\memory-nexus\\events.jsonl"],
    createService: () => ({
      audit: async (options) => {
        calls.push(options);
        const next = reports.shift();
        if (!next) throw new Error("No mock audit report available");
        return next;
      },
    }),
    ...overrides,
  };
}

function emptyReport(): SecretAuditReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-06-05T00:00:00.000Z",
    redactionPolicy: "pattern-redactor-v2",
    summary: {
      totalFindings: 0,
      databaseFindings: 0,
      eventLogFindings: 0,
    },
    findings: [],
    remediation: {
      database: {
        requested: false,
        updatedFields: 0,
        rebuiltFtsIndexes: [],
      },
      eventLogs: {
        requested: false,
        sanitizedFiles: [],
        quarantinedFiles: [],
      },
    },
  };
}

function reportWithFinding(): SecretAuditReport {
  return {
    ...emptyReport(),
    summary: {
      totalFindings: 1,
      databaseFindings: 1,
      eventLogFindings: 0,
    },
    findings: [{
      surface: "database",
      kind: "api_key",
      placeholder: "[REDACTED:api_key:abcd1234]",
      hash: "abcd1234",
      ruleVersion: "pattern-redactor-v2",
      table: "messages_meta",
      column: "content",
      rowId: 1,
    }],
  };
}

function reportWithEventLogFinding(): SecretAuditReport {
  return {
    ...emptyReport(),
    summary: {
      totalFindings: 1,
      databaseFindings: 0,
      eventLogFindings: 1,
    },
    findings: [{
      surface: "event_log",
      kind: "api_key",
      placeholder: "[REDACTED:api_key:abcd1234]",
      hash: "abcd1234",
      ruleVersion: "pattern-redactor-v2",
      filePath: "events.jsonl",
      lineNumber: 7,
    }],
  };
}

function reportWithFindings(
  count: number,
  remediation: SecretAuditReport["remediation"] = emptyReport().remediation,
): SecretAuditReport {
  return {
    ...emptyReport(),
    summary: {
      totalFindings: count,
      databaseFindings: count,
      eventLogFindings: 0,
    },
    findings: Array.from({ length: count }, (_, index) => ({
      surface: "database" as const,
      kind: "api_key" as const,
      placeholder: `[REDACTED:api_key:${String(index).padStart(8, "0")}]`,
      hash: String(index).padStart(8, "0"),
      ruleVersion: "pattern-redactor-v2",
      table: "messages_meta",
      column: "content",
      rowId: index + 1,
    })),
    remediation,
  };
}
