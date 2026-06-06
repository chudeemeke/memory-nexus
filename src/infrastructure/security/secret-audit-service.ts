import type { Database } from "bun:sqlite";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { MemoryEventEnvelope, type MemoryEventEnvelopeJson } from "../../domain/entities/memory-event.js";
import type { IRedactor, RedactionFinding } from "../../domain/ports/redactor.js";
import { getDataDir } from "../paths.js";

export type SecretAuditSurface = "database" | "event_log";

export interface SecretAuditFinding {
  surface: SecretAuditSurface;
  kind: RedactionFinding["kind"];
  placeholder: string;
  hash?: string | undefined;
  ruleVersion?: string | undefined;
  table?: string | undefined;
  column?: string | undefined;
  rowId?: string | number | undefined;
  filePath?: string | undefined;
  lineNumber?: number | undefined;
}

export interface SecretAuditReport {
  schemaVersion: 1;
  generatedAt: string;
  redactionPolicy: string;
  summary: {
    totalFindings: number;
    databaseFindings: number;
    eventLogFindings: number;
  };
  findings: SecretAuditFinding[];
  remediation: {
    database: {
      requested: boolean;
      updatedFields: number;
      rebuiltFtsIndexes: string[];
    };
    eventLogs: {
      requested: boolean;
      sanitizedFiles: string[];
      quarantinedFiles: Array<{
        originalPath: string;
        quarantinedPath: string;
      }>;
    };
  };
}

export interface SecretAuditOptions {
  db?: Database | undefined;
  eventLogPaths?: string[] | undefined;
  redactDatabase?: boolean | undefined;
  quarantineEvents?: boolean | undefined;
  quarantineDir?: string | undefined;
  reportPath?: string | undefined;
}

interface DatabaseScanTarget {
  table: string;
  idColumn: string;
  columns: readonly string[];
  jsonColumns?: readonly string[] | undefined;
}

interface RedactedValue {
  value: string;
  findings: RedactionFinding[];
}

const DATABASE_SCAN_TARGETS: readonly DatabaseScanTarget[] = [
  {
    table: "sessions",
    idColumn: "id",
    columns: ["project_path_decoded", "project_name", "summary"],
  },
  {
    table: "messages_meta",
    idColumn: "rowid",
    columns: ["content"],
  },
  {
    table: "tool_uses",
    idColumn: "id",
    columns: ["name", "input", "result"],
    jsonColumns: ["input"],
  },
  {
    table: "extraction_state",
    idColumn: "id",
    columns: ["session_path", "error_message"],
  },
  {
    table: "entities",
    idColumn: "id",
    columns: ["name", "metadata"],
    jsonColumns: ["metadata"],
  },
  {
    table: "memory_files",
    idColumn: "id",
    columns: ["file_path", "content"],
  },
  {
    table: "friction_log",
    idColumn: "id",
    columns: ["description", "tool", "tags", "context", "source_project", "resolution"],
    jsonColumns: ["tags"],
  },
  {
    table: "backfill_state",
    idColumn: "session_id",
    columns: ["daily_log_path", "error_message"],
  },
  {
    table: "facts",
    idColumn: "id",
    columns: ["project", "content", "metadata"],
    jsonColumns: ["metadata"],
  },
];

export class SecretAuditService {
  constructor(private readonly redactor: IRedactor) {}

  async audit(options: SecretAuditOptions = {}): Promise<SecretAuditReport> {
    const findings: SecretAuditFinding[] = [];
    const remediation: SecretAuditReport["remediation"] = {
      database: {
        requested: options.redactDatabase === true,
        updatedFields: 0,
        rebuiltFtsIndexes: [],
      },
      eventLogs: {
        requested: options.quarantineEvents === true,
        sanitizedFiles: [],
        quarantinedFiles: [],
      },
    };

    if (options.db) {
      remediation.database.updatedFields = this.scanDatabase(
        options.db,
        options.redactDatabase === true,
        findings,
      );
      if (options.redactDatabase && remediation.database.updatedFields > 0) {
        remediation.database.rebuiltFtsIndexes = rebuildFtsIndexes(options.db);
      }
    }

    if (options.eventLogPaths) {
      const eventRemediation = this.scanEventLogs(
        options.eventLogPaths,
        options.quarantineEvents === true,
        options.quarantineDir,
        findings,
      );
      remediation.eventLogs.sanitizedFiles = eventRemediation.sanitizedFiles;
      remediation.eventLogs.quarantinedFiles = eventRemediation.quarantinedFiles;
    }

    const report: SecretAuditReport = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      redactionPolicy: inferRedactionPolicy(findings),
      summary: {
        totalFindings: findings.length,
        databaseFindings: findings.filter((finding) => finding.surface === "database").length,
        eventLogFindings: findings.filter((finding) => finding.surface === "event_log").length,
      },
      findings,
      remediation,
    };

    if (options.reportPath) {
      mkdirSync(dirname(options.reportPath), { recursive: true });
      writeFileSync(options.reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
    }

    return report;
  }

  private scanDatabase(
    db: Database,
    redactDatabase: boolean,
    findings: SecretAuditFinding[],
  ): number {
    let updatedFields = 0;

    for (const target of DATABASE_SCAN_TARGETS) {
      if (!tableExists(db, target.table)) continue;
      const columns = target.columns.filter((column) => columnExists(db, target.table, column));
      if (columns.length === 0 || !columnExists(db, target.table, target.idColumn)) continue;

      const rowIdAlias = "__memory_audit_row_id";
      const selectColumns = [
        `${quoteIdentifier(target.idColumn)} AS ${rowIdAlias}`,
        ...columns.map((column) => quoteIdentifier(column)),
      ].join(", ");
      const rows = db.prepare<Record<string, unknown>, []>(
        `SELECT ${selectColumns} FROM ${quoteIdentifier(target.table)}`
      ).all();

      for (const row of rows) {
        const rowId = row[rowIdAlias] as string | number | undefined;
        for (const column of columns) {
          const raw = row[column];
          if (typeof raw !== "string" || raw.length === 0) continue;

          const redacted = redactColumnValue(this.redactor, raw, target.jsonColumns?.includes(column) === true);
          if (redacted.findings.length === 0) continue;

          findings.push(...redacted.findings.map((finding) => ({
            surface: "database" as const,
            table: target.table,
            column,
            rowId,
            ...publicFinding(finding),
          })));

          if (redactDatabase && redacted.value !== raw && rowId !== undefined) {
            db.prepare(
              `UPDATE ${quoteIdentifier(target.table)} SET ${quoteIdentifier(column)} = ? WHERE ${quoteIdentifier(target.idColumn)} = ?`
            ).run(redacted.value, rowId);
            updatedFields += 1;
          }
        }
      }
    }

    return updatedFields;
  }

  private scanEventLogs(
    eventLogPaths: string[],
    quarantineEvents: boolean,
    quarantineDir: string | undefined,
    findings: SecretAuditFinding[],
  ): Pick<SecretAuditReport["remediation"]["eventLogs"], "sanitizedFiles" | "quarantinedFiles"> {
    const sanitizedFiles: string[] = [];
    const quarantinedFiles: Array<{ originalPath: string; quarantinedPath: string }> = [];

    for (const filePath of eventLogPaths) {
      if (!existsSync(filePath)) continue;

      const content = readFileSync(filePath, "utf-8");
      const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
      const lines = content.split(/\r?\n/);
      const sanitizedLines: string[] = [];
      let fileHasFindings = false;

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        if (line.trim() === "" && index === lines.length - 1) {
          continue;
        }

        const result = this.redactEventLine(line);
        sanitizedLines.push(result.line);

        if (result.findings.length > 0) {
          fileHasFindings = true;
          findings.push(...result.findings.map((finding) => ({
            surface: "event_log" as const,
            filePath,
            lineNumber: index + 1,
            ...publicFinding(finding),
          })));
        }
      }

      if (quarantineEvents && fileHasFindings) {
        const resolvedQuarantineDir = quarantineDir ?? join(getDataDir(), "quarantine", "event-logs");
        mkdirSync(resolvedQuarantineDir, { recursive: true });
        const quarantinedPath = join(
          resolvedQuarantineDir,
          `${new Date().toISOString().replace(/[:.]/g, "-")}-${basename(filePath)}.raw`,
        );
        renameSync(filePath, quarantinedPath);
        writeFileSync(filePath, sanitizedLines.join(lineEnding) + lineEnding, "utf-8");
        sanitizedFiles.push(filePath);
        quarantinedFiles.push({ originalPath: filePath, quarantinedPath });
      }
    }

    return { sanitizedFiles, quarantinedFiles };
  }

  private redactEventLine(line: string): { line: string; findings: RedactionFinding[] } {
    try {
      const parsed = JSON.parse(line) as unknown;
      const result = this.redactor.redactJson(parsed);
      if (result.findings.length === 0) {
        return { line, findings: [] };
      }
      return {
        line: JSON.stringify(repairMemoryEventIntegrity(result.value)),
        findings: result.findings,
      };
    } catch {
      const result = this.redactor.redactText(line);
      return { line: result.text, findings: result.findings };
    }
  }
}

function redactColumnValue(redactor: IRedactor, raw: string, jsonColumn: boolean): RedactedValue {
  if (!jsonColumn) {
    const result = redactor.redactText(raw);
    return { value: result.text, findings: result.findings };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = redactor.redactJson(parsed);
    return {
      value: JSON.stringify(result.value),
      findings: result.findings,
    };
  } catch {
    const result = redactor.redactText(raw);
    return { value: result.text, findings: result.findings };
  }
}

function repairMemoryEventIntegrity(value: unknown): unknown {
  if (!isRecord(value) || value.schemaVersion !== 2) {
    return value;
  }

  const record = value as unknown as MemoryEventEnvelopeJson;
  try {
    const redactedFields = new Set([
      ...(Array.isArray(record.privacy?.redactedFields) ? record.privacy.redactedFields : []),
      "event",
    ]);
    return MemoryEventEnvelope.create({
      eventId: record.eventId,
      machineId: record.machineId,
      sequence: record.sequence,
      kind: record.kind,
      operation: record.operation,
      occurredAt: new Date(record.occurredAt),
      observedAt: new Date(record.observedAt),
      scope: record.scope,
      provenance: record.provenance,
      privacy: {
        ...record.privacy,
        redactionState: "redacted",
        containsSensitiveContent: true,
        policy: record.privacy?.policy ?? inferRedactionPolicy([]),
        redactedFields: [...redactedFields],
      },
      consent: record.consent,
      causality: record.causality,
      payload: record.payload,
    }).toJSON();
  } catch {
    return value;
  }
}

function rebuildFtsIndexes(db: Database): string[] {
  const rebuilt: string[] = [];
  const externalContentIndexes = ["messages_fts", "facts_fts", "memory_files_fts"];

  for (const indexName of externalContentIndexes) {
    if (!tableExists(db, indexName)) continue;
    db.exec(`INSERT INTO ${quoteIdentifier(indexName)}(${quoteIdentifier(indexName)}) VALUES('rebuild')`);
    rebuilt.push(indexName);
  }

  if (tableExists(db, "sessions_fts") && tableExists(db, "sessions")) {
    db.exec("DELETE FROM sessions_fts");
    db.exec("INSERT INTO sessions_fts(session_id, summary) SELECT id, summary FROM sessions WHERE summary IS NOT NULL AND summary != ''");
    rebuilt.push("sessions_fts");
  }

  return rebuilt;
}

function publicFinding(finding: RedactionFinding): Omit<SecretAuditFinding, "surface"> {
  return {
    kind: finding.kind,
    placeholder: finding.placeholder,
    hash: finding.hash,
    ruleVersion: finding.ruleVersion,
  };
}

function inferRedactionPolicy(findings: RedactionFinding[]): string {
  return findings.find((finding) => finding.ruleVersion)?.ruleVersion ?? "pattern-redactor-v2";
}

function tableExists(db: Database, table: string): boolean {
  const result = db.prepare<{ name: string }, [string]>(
    "SELECT name FROM sqlite_master WHERE name = ?"
  ).get(table);
  return Boolean(result);
}

function columnExists(db: Database, table: string, column: string): boolean {
  const rows = db.prepare<{ name: string }, []>(`PRAGMA table_info(${quoteIdentifier(table)})`).all();
  return rows.some((row) => row.name === column);
}

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
