/**
 * Secret Audit Command
 *
 * Scans durable memory surfaces for likely secrets. Read-only by default;
 * database redaction and event-log quarantine require explicit flags.
 */

import { Command } from "commander";
import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CommandResult } from "../command-result.js";
import {
  closeDatabase,
  getDefaultDbPath,
  initializeDatabase,
} from "../../../infrastructure/database/index.js";
import { getAllLogFiles } from "../../../infrastructure/paths.js";
import {
  SecretAuditService,
  type SecretAuditFinding,
  type SecretAuditReport,
} from "../../../infrastructure/security/secret-audit-service.js";
import { PatternRedactor } from "../../../infrastructure/security/pattern-redactor.js";
import type { IRedactor } from "../../../domain/ports/redactor.js";
import { unknownErrorMessage } from "../../../domain/errors/unknown-error.js";

export interface AuditSecretsOptions {
  /** Output as JSON */
  json?: boolean | undefined;
  /** Database path override */
  db?: string | undefined;
  /** Skip database scanning */
  skipDb?: boolean | undefined;
  /** Explicit event log path(s) to scan */
  eventLog?: string[] | undefined;
  /** Events directory override */
  eventsDir?: string | undefined;
  /** Skip event-log scanning */
  skipEvents?: boolean | undefined;
  /** Redact mutable database fields in-place */
  redactDb?: boolean | undefined;
  /** Quarantine raw event logs and write sanitized active copies */
  quarantineEvents?: boolean | undefined;
  /** Event-log quarantine directory override */
  quarantineDir?: string | undefined;
  /** Write a redacted evidence report */
  report?: string | undefined;
}

export interface AuditSecretsCommandDeps {
  getDefaultDbPath?: (() => string) | undefined;
  databaseExists?: ((path: string) => boolean) | undefined;
  initializeDatabase?: ((config: {
    path: string;
    create: boolean;
    applySchema: boolean;
    walMode: boolean;
    quickCheck: boolean;
  }) => { db: Database }) | undefined;
  closeDatabase?: ((db: Database) => void) | undefined;
  getAllLogFiles?: ((eventsDir?: string) => string[]) | undefined;
  createService?: ((redactor: IRedactor) => Pick<SecretAuditService, "audit">) | undefined;
  redactor?: IRedactor | undefined;
  writeFile?: ((path: string, content: string) => void) | undefined;
  mkdir?: ((path: string) => void) | undefined;
}

interface AuditSecretsCommandReport {
  schemaVersion: 1;
  command: "audit-secrets";
  generatedAt: string;
  targets: {
    database: {
      requested: boolean;
      scanned: boolean;
      path?: string | undefined;
    };
    eventLogs: {
      requested: boolean;
      scanned: number;
      paths: string[];
    };
  };
  scan: SecretAuditReport;
  verification?: {
    requested: boolean;
    totalFindings: number;
    databaseFindings: number;
    eventLogFindings: number;
    findings: SecretAuditFinding[];
  } | undefined;
}

export function createAuditSecretsCommand(): Command {
  return new Command("audit-secrets")
    .description("Scan memory database and event logs for likely leaked secrets")
    .option("--json", "Output as JSON")
    .option("--db <path>", "Database path override")
    .option("--skip-db", "Skip database scanning")
    .option("--event-log <path...>", "Specific event log path(s) to scan")
    .option("--events-dir <path>", "Events directory to scan")
    .option("--skip-events", "Skip event-log scanning")
    .option("--redact-db", "Rewrite mutable database fields with redacted values")
    .option("--quarantine-events", "Move raw event logs to quarantine and write sanitized active copies")
    .option("--quarantine-dir <path>", "Quarantine directory for raw event logs")
    .option("--report <path>", "Write a redacted evidence report")
    .action(async (options: AuditSecretsOptions) => {
      const result = await executeAuditSecretsCommand(options);
      process.exitCode = result.exitCode;
    });
}

export async function executeAuditSecretsCommand(
  options: AuditSecretsOptions = {},
  deps: AuditSecretsCommandDeps = {},
): Promise<CommandResult> {
  const redactor = deps.redactor ?? new PatternRedactor();
  const service = deps.createService?.(redactor) ?? new SecretAuditService(redactor);
  const getDbPath = deps.getDefaultDbPath ?? getDefaultDbPath;
  const databaseExists = deps.databaseExists ?? existsSync;
  const initializeDb = deps.initializeDatabase ?? initializeDatabase;
  const closeDb = deps.closeDatabase ?? closeDatabase;
  const resolveEventLogs = deps.getAllLogFiles ?? getAllLogFiles;
  const writeReportFile = deps.writeFile ?? ((path: string, content: string) => writeFileSync(path, content, "utf-8"));
  const makeDir = deps.mkdir ?? ((path: string) => mkdirSync(path, { recursive: true }));

  let db: Database | undefined;

  try {
    const dbPath = options.db ?? getDbPath();
    const databaseRequested = options.skipDb !== true;
    const databaseScanned = databaseRequested && (dbPath === ":memory:" || databaseExists(dbPath));
    if (databaseScanned) {
      db = initializeDb({
        path: dbPath,
        create: false,
        applySchema: false,
        walMode: false,
        quickCheck: true,
      }).db;
    }

    const eventLogPaths = options.skipEvents === true
      ? []
      : normalizePaths(options.eventLog ?? resolveEventLogs(options.eventsDir));

    const scan = await service.audit({
      db,
      eventLogPaths,
      redactDatabase: options.redactDb === true,
      quarantineEvents: options.quarantineEvents === true,
      quarantineDir: options.quarantineDir,
    });

    const remediationRequested = options.redactDb === true || options.quarantineEvents === true;
    const verification = remediationRequested
      ? await service.audit({ db, eventLogPaths })
      : undefined;

    const reportInput: AuditSecretsCommandReport = {
      schemaVersion: 1,
      command: "audit-secrets",
      generatedAt: scan.generatedAt,
      targets: {
        database: {
          requested: databaseRequested,
          scanned: databaseScanned,
          path: databaseRequested ? dbPath : undefined,
        },
        eventLogs: {
          requested: options.skipEvents !== true,
          scanned: eventLogPaths.length,
          paths: eventLogPaths,
        },
      },
      scan,
      verification: verification
        ? {
            requested: true,
            totalFindings: verification.summary.totalFindings,
            databaseFindings: verification.summary.databaseFindings,
            eventLogFindings: verification.summary.eventLogFindings,
            findings: verification.findings,
          }
        : undefined,
    };
    const report = sanitizeReport(redactor, reportInput);

    if (options.report) {
      makeDir(dirname(options.report));
      writeReportFile(options.report, JSON.stringify(report, null, 2) + "\n");
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatAuditSecretsReport(report));
    }

    const remainingFindings = report.verification?.totalFindings ?? report.scan.summary.totalFindings;
    if (remainingFindings === 0) {
      return { exitCode: 0 };
    }
    return { exitCode: remediationRequested ? 2 : 1 };
  } catch (error) {
    const message = redactor.redactText(unknownErrorMessage(error)).text;
    if (options.json) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(`Error: ${message}`);
    }
    return { exitCode: 2 };
  } finally {
    if (db) {
      closeDb(db);
    }
  }
}

function formatAuditSecretsReport(report: AuditSecretsCommandReport): string {
  const lines: string[] = [];
  const summary = report.scan.summary;
  lines.push("Secret audit");
  lines.push(`  Database: ${formatDatabaseTarget(report)}`);
  lines.push(`  Event logs: ${report.targets.eventLogs.scanned} scanned`);
  lines.push(`  Findings: ${summary.totalFindings} total (${summary.databaseFindings} database, ${summary.eventLogFindings} event log)`);

  if (summary.totalFindings === 0) {
    lines.push("");
    lines.push("No suspected secrets found.");
  } else {
    lines.push("");
    lines.push("Findings:");
    for (const finding of report.scan.findings.slice(0, 20)) {
      lines.push(`  - ${formatFinding(finding)}`);
    }
    if (report.scan.findings.length > 20) {
      lines.push(`  - ... ${report.scan.findings.length - 20} more`);
    }
    lines.push("");
    lines.push("No raw secret values are printed. Use --redact-db and/or --quarantine-events to remediate.");
  }

  if (report.scan.remediation.database.requested || report.scan.remediation.eventLogs.requested) {
    lines.push("");
    lines.push("Remediation:");
    lines.push(`  Database fields updated: ${report.scan.remediation.database.updatedFields}`);
    lines.push(`  FTS indexes rebuilt: ${report.scan.remediation.database.rebuiltFtsIndexes.length}`);
    lines.push(`  Event logs sanitized: ${report.scan.remediation.eventLogs.sanitizedFiles.length}`);
    lines.push(`  Raw event logs quarantined: ${report.scan.remediation.eventLogs.quarantinedFiles.length}`);
    if (report.verification) {
      lines.push(`  Verification remaining findings: ${report.verification.totalFindings}`);
    }
  }

  return lines.join("\n");
}

function formatDatabaseTarget(report: AuditSecretsCommandReport): string {
  if (!report.targets.database.requested) return "skipped";
  if (!report.targets.database.scanned) return `not found (${report.targets.database.path ?? "unknown"})`;
  return `scanned (${report.targets.database.path ?? "unknown"})`;
}

function formatFinding(finding: SecretAuditFinding): string {
  if (finding.surface === "database") {
    return `database ${finding.table}.${finding.column} row ${finding.rowId}: ${finding.kind} ${finding.placeholder}`;
  }
  return `event log ${finding.filePath}:${finding.lineNumber}: ${finding.kind} ${finding.placeholder}`;
}

function normalizePaths(paths: string[]): string[] {
  return [...new Set(paths.filter((path) => path.trim() !== ""))];
}

function sanitizeReport<T>(redactor: IRedactor, value: T): T {
  return redactor.redactJson(value).value;
}
