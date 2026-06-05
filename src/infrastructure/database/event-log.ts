/**
 * Event-log SSOT manager.
 *
 * v2 JSONL records are canonical MemoryEventEnvelope entries. Legacy v1
 * fact-shaped records remain readable through the adapter below.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { existsSync, createReadStream } from "node:fs";
import * as readline from "node:readline";
import type { Database } from "bun:sqlite";
import { ProjectionRegistry, type ProjectionReplayResult } from "../../application/services/projection-registry.js";
import { Fact, type FactParams, type FactType } from "../../domain/entities/fact.js";
import {
  MemoryEventEnvelope,
  type MemoryEventKind,
  type MemoryEventPrivacy,
} from "../../domain/entities/memory-event.js";
import { getMachineLogPath, getAllLogFiles } from "../paths.js";
import { loadConfig } from "../hooks/config-manager.js";

export interface InvalidEventLogLine {
  filePath: string;
  lineNumber: number;
  line: string;
  reason: string;
}

export interface EventReadReport {
  events: MemoryEventEnvelope[];
  invalidEvents: InvalidEventLogLine[];
}

export interface ProjectionRebuildReport {
  invalidEvents: number;
  invalidEventLines: InvalidEventLogLine[];
  replay: ProjectionReplayResult;
}

interface ReadOptions {
  reportInvalidToConsole: boolean;
}

interface FactsProjectionContext {
  db: Database;
}

const FACT_EVENT_KINDS: readonly MemoryEventKind[] = [
  "decision",
  "learning",
  "preference",
  "friction",
  "observation",
  "supersedence",
];

/**
 * Append a Fact through the canonical v2 event envelope.
 */
export async function appendEvent(fact: Fact, logPath?: string): Promise<void> {
  await appendMemoryEvent(factToMemoryEvent(fact, resolveMachineId(logPath)), logPath);
}

/**
 * Append a canonical memory event envelope into the plain-text event log.
 */
export async function appendMemoryEvent(memoryEvent: MemoryEventEnvelope, logPath?: string): Promise<void> {
  const activeLogPath = resolveLogPath(logPath);
  await mkdir(dirname(activeLogPath), { recursive: true });
  await appendFile(activeLogPath, `${JSON.stringify(memoryEvent.toJSON())}\n`, "utf-8");
}

/**
 * Read canonical memory events from one explicit log file or all known event
 * logs. Invalid lines are skipped; use readMemoryEventsWithReport for evidence.
 */
export async function* readMemoryEvents(logPath?: string, eventsDir?: string): AsyncGenerator<MemoryEventEnvelope, void, unknown> {
  const report = await collectMemoryEvents(logPath, eventsDir, { reportInvalidToConsole: false });
  for (const event of report.events) {
    yield event;
  }
}

/**
 * Read canonical memory events with structured invalid-line reporting.
 */
export async function readMemoryEventsWithReport(logPath?: string, eventsDir?: string): Promise<EventReadReport> {
  return collectMemoryEvents(logPath, eventsDir, { reportInvalidToConsole: false });
}

/**
 * Compatibility API: read event log records as Fact entities.
 */
export async function* readEvents(logPath?: string, eventsDir?: string): AsyncGenerator<Fact, void, unknown> {
  const report = await collectMemoryEvents(logPath, eventsDir, { reportInvalidToConsole: true });
  for (const event of report.events) {
    try {
      yield memoryEventToFact(event);
    } catch (error) {
      console.error("Skipping malformed event log line:", error);
    }
  }
}

/**
 * Rebuild derived database projections from the canonical event log.
 */
export async function rebuildProjections(db: Database, logPath?: string, eventsDir?: string): Promise<void> {
  await rebuildProjectionsWithReport(db, logPath, eventsDir);
}

/**
 * Rebuild derived database projections and return replay evidence.
 */
export async function rebuildProjectionsWithReport(db: Database, logPath?: string, eventsDir?: string): Promise<ProjectionRebuildReport> {
  const report = await collectMemoryEvents(logPath, eventsDir, { reportInvalidToConsole: false });
  const sortedEvents = sortMemoryEvents(report.events);
  const registry = new ProjectionRegistry<FactsProjectionContext>([createFactsProjection()]);
  const replay = await registry.replay(sortedEvents, { db });

  return {
    invalidEvents: report.invalidEvents.length,
    invalidEventLines: report.invalidEvents,
    replay,
  };
}

async function collectMemoryEvents(logPath: string | undefined, eventsDir: string | undefined, options: ReadOptions): Promise<EventReadReport> {
  const files = logPath ? [logPath] : getAllLogFiles(eventsDir);
  const events: MemoryEventEnvelope[] = [];
  const invalidEvents: InvalidEventLogLine[] = [];

  for (const filePath of files) {
    const fileReport = await readSingleLogFile(filePath, options);
    events.push(...fileReport.events);
    invalidEvents.push(...fileReport.invalidEvents);
  }

  return {
    events: logPath ? events : sortMemoryEvents(events),
    invalidEvents,
  };
}

async function readSingleLogFile(filePath: string, options: ReadOptions): Promise<EventReadReport> {
  const events: MemoryEventEnvelope[] = [];
  const invalidEvents: InvalidEventLogLine[] = [];
  if (!existsSync(filePath)) {
    return { events, invalidEvents };
  }

  const fileStream = createReadStream(filePath, "utf-8");
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as unknown;
      events.push(parseMemoryEventRecord(parsed, filePath, lineNumber));
    } catch (error) {
      const invalid = {
        filePath,
        lineNumber,
        line,
        reason: error instanceof Error ? error.message : String(error),
      };
      invalidEvents.push(invalid);
      if (options.reportInvalidToConsole) {
        console.error("Skipping malformed event log line:", error);
      }
    }
  }

  return { events, invalidEvents };
}

function parseMemoryEventRecord(record: unknown, filePath: string, lineNumber: number): MemoryEventEnvelope {
  if (isObject(record) && record.schemaVersion === 2) {
    return MemoryEventEnvelope.fromJSON(record);
  }
  return legacyFactRecordToMemoryEvent(record, filePath, lineNumber);
}

function factToMemoryEvent(fact: Fact, machineId: string): MemoryEventEnvelope {
  const privacy = privacyFromMetadata(fact.metadata);
  return MemoryEventEnvelope.create({
    eventId: fact.uuid,
    machineId,
    sequence: fact.id ?? sequenceFromDate(fact.observedAt),
    kind: fact.type,
    operation: fact.type === "supersedence" ? "supersede" : "add",
    occurredAt: fact.observedAt,
    observedAt: fact.observedAt,
    scope: { project: fact.project, visibility: "project" },
    provenance: {
      source: "memory-fact",
      actor: "memory",
      method: "appendEvent",
      sourceIds: [fact.uuid],
    },
    privacy,
    consent: { status: "not_required", scopes: [] },
    causality: causalityFromFact(fact),
    payload: { fact: factToPayload(fact) },
  });
}

function legacyFactRecordToMemoryEvent(record: unknown, filePath: string, lineNumber: number): MemoryEventEnvelope {
  if (!isObject(record)) {
    throw new Error("Legacy event record must be an object");
  }

  const fact = legacyRecordToFact(record);
  return MemoryEventEnvelope.create({
    eventId: fact.uuid,
    machineId: deriveMachineId(filePath),
    sequence: legacySequence(record, lineNumber),
    kind: fact.type,
    operation: fact.type === "supersedence" ? "supersede" : "add",
    occurredAt: fact.observedAt,
    observedAt: fact.observedAt,
    scope: { project: fact.project, visibility: "project" },
    provenance: {
      source: "legacy-event-log",
      actor: "memory",
      method: "v1-jsonl-adapter",
      sourceIds: [fact.uuid],
    },
    privacy: privacyFromMetadata(fact.metadata),
    consent: { status: "not_required", scopes: [] },
    causality: causalityFromFact(fact),
    payload: { fact: factToPayload(fact) },
  });
}

function legacyRecordToFact(record: Record<string, unknown>): Fact {
  const uuid = stringField(record, "uuid");
  const type = stringField(record, "type") as FactType;
  const project = stringField(record, "project");
  const content = stringField(record, "content");
  const observedAt = dateField(record, "observedAt");
  const supersededAt = optionalDateField(record, "supersededAt");
  const supersededBy = typeof record.supersededBy === "string" ? record.supersededBy : null;
  const metadata = isObject(record.metadata) ? cloneObject(record.metadata) : undefined;

  if (!uuid.trim()) {
    throw new Error("Legacy event uuid is required");
  }

  return Fact.create({
    uuid,
    type,
    project,
    content,
    metadata,
    observedAt,
    supersededAt,
    supersededBy,
  });
}

function memoryEventToFact(event: MemoryEventEnvelope): Fact {
  const payload = event.payload.fact;
  if (!isObject(payload)) {
    throw new Error(`Memory event ${event.eventId} does not contain a fact payload`);
  }

  const params: FactParams = {
    uuid: stringField(payload, "uuid"),
    type: (typeof payload.type === "string" ? payload.type : event.kind) as FactType,
    project: typeof payload.project === "string" ? payload.project : event.scope.project ?? "",
    content: stringField(payload, "content"),
    metadata: isObject(payload.metadata) ? cloneObject(payload.metadata) : undefined,
    observedAt: typeof payload.observedAt === "string" ? new Date(payload.observedAt) : event.observedAt,
    supersededAt: typeof payload.supersededAt === "string" ? new Date(payload.supersededAt) : null,
    supersededBy: typeof payload.supersededBy === "string" ? payload.supersededBy : null,
  };

  const fact = Fact.create(params);
  return typeof payload.id === "number" ? fact.withId(payload.id) : fact;
}

function createFactsProjection() {
  const insertFact = (db: Database, fact: Fact) => {
    db.prepare(`
      INSERT INTO facts (
        uuid, type, project, content, metadata, observed_at, superseded_at, superseded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uuid) DO UPDATE SET
        type = excluded.type,
        project = excluded.project,
        content = excluded.content,
        metadata = excluded.metadata,
        observed_at = excluded.observed_at,
        superseded_at = excluded.superseded_at,
        superseded_by = excluded.superseded_by,
        updated_at = datetime('now')
    `).run(
      fact.uuid,
      fact.type,
      fact.project,
      fact.content,
      fact.metadata ? JSON.stringify(fact.metadata) : null,
      fact.observedAt.toISOString(),
      fact.supersededAt ? fact.supersededAt.toISOString() : null,
      fact.supersededBy
    );
  };

  return {
    name: "facts",
    consumedKinds: FACT_EVENT_KINDS,
    reset: (context: FactsProjectionContext) => {
      context.db.run("DELETE FROM facts;");
    },
    apply: (event: MemoryEventEnvelope, context: FactsProjectionContext) => {
      const fact = memoryEventToFact(event);
      insertFact(context.db, fact);

      if (fact.type === "supersedence") {
        const supersededUuid = fact.metadata?.superseded_uuid;
        const supersededByUuid = fact.metadata?.superseded_by_uuid;
        if (typeof supersededUuid === "string" && typeof supersededByUuid === "string") {
          context.db.prepare(`
            UPDATE facts
            SET superseded_at = ?, superseded_by = ?, updated_at = datetime('now')
            WHERE uuid = ?
          `).run(fact.observedAt.toISOString(), supersededByUuid, supersededUuid);
        }
      }
    },
  };
}

function resolveLogPath(logPath?: string): string {
  if (logPath) {
    return logPath;
  }
  const config = loadConfig();
  return getMachineLogPath(config.machineId);
}

function resolveMachineId(logPath?: string): string {
  if (logPath) {
    const derived = deriveMachineId(logPath);
    return derived === "legacy" ? "local" : derived;
  }
  try {
    const config = loadConfig();
    if (config.machineId && config.machineId.trim()) {
      return config.machineId;
    }
  } catch {
    // Explicit log-path tests and isolated consumers may not have config yet.
  }
  return "local";
}

function deriveMachineId(filePath: string): string {
  const fileName = basename(filePath);
  const match = /^events-(.+)\.jsonl$/.exec(fileName);
  return match?.[1] && match[1].trim() ? match[1] : "legacy";
}

function sortMemoryEvents(events: MemoryEventEnvelope[]): MemoryEventEnvelope[] {
  return [...events].sort((a, b) => {
    const timeDiff = a.observedAt.getTime() - b.observedAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    const sequenceDiff = a.sequence - b.sequence;
    if (sequenceDiff !== 0) return sequenceDiff;
    const eventIdDiff = a.eventId.localeCompare(b.eventId);
    if (eventIdDiff !== 0) return eventIdDiff;
    return a.machineId.localeCompare(b.machineId);
  });
}

function factToPayload(fact: Fact): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    uuid: fact.uuid,
    type: fact.type,
    project: fact.project,
    content: fact.content,
    observedAt: fact.observedAt.toISOString(),
    supersededAt: fact.supersededAt ? fact.supersededAt.toISOString() : null,
    supersededBy: fact.supersededBy,
  };
  if (fact.id !== undefined) {
    payload.id = fact.id;
  }
  if (fact.metadata !== undefined) {
    payload.metadata = fact.metadata;
  }
  return payload;
}

function causalityFromFact(fact: Fact) {
  const metadata = fact.metadata;
  const supersededUuid = metadata?.superseded_uuid;
  const supersededByUuid = metadata?.superseded_by_uuid;
  return {
    parentEventIds: [] as string[],
    supersedesEventIds: typeof supersededUuid === "string" ? [supersededUuid] : [],
    relatedEventIds: typeof supersededByUuid === "string" ? [supersededByUuid] : [],
  };
}

function privacyFromMetadata(metadata: Record<string, unknown> | undefined): MemoryEventPrivacy {
  const redaction = isObject(metadata?.redaction) ? metadata.redaction : undefined;
  const privacy = isObject(metadata?.privacy) ? metadata.privacy : undefined;
  const state = metadata?.redactionState ?? redaction?.state ?? privacy?.redactionState ?? "none";
  const fields = metadata?.redactedFields ?? redaction?.fields ?? privacy?.redactedFields;
  return {
    redactionState: normalizeRedactionState(state),
    containsSensitiveContent: Boolean(metadata?.containsSensitiveContent ?? privacy?.containsSensitiveContent ?? false),
    policy: typeof redaction?.policy === "string" ? redaction.policy : undefined,
    redactedFields: Array.isArray(fields) ? fields.map((field) => String(field)) : undefined,
  };
}

function normalizeRedactionState(value: unknown): "none" | "redacted" | "quarantined" {
  if (value === "redacted" || value === "quarantined") {
    return value;
  }
  return "none";
}

function legacySequence(record: Record<string, unknown>, lineNumber: number): number {
  if (typeof record.sequence === "number" && Number.isSafeInteger(record.sequence) && record.sequence > 0) {
    return record.sequence;
  }
  return lineNumber;
}

function sequenceFromDate(date: Date): number {
  return Math.max(1, Math.floor(date.getTime()));
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  return value;
}

function dateField(record: Record<string, unknown>, field: string): Date {
  const value = stringField(record, field);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }
  return date;
}

function optionalDateField(record: Record<string, unknown>, field: string): Date | null {
  const value = record[field];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string or null`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }
  return date;
}

function cloneObject(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
