/**
 * Export/Import Service
 *
 * Serializes the legacy v1 session/message/fact table set. Additional memory
 * surfaces and governance/event logs are outside this format's current scope.
 */

import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import type { IRedactor } from "../../domain/ports/redactor.js";
import { unknownErrorMessage } from "../../domain/errors/unknown-error.js";

// ============================================================================
// Export Data Types
// ============================================================================

/**
 * Exported session data structure.
 */
export interface SessionExport {
  id: string;
  projectPathEncoded: string;
  projectPathDecoded: string;
  projectName: string;
  startTime: string;
  endTime: string | null;
  messageCount: number;
  summary: string | null;
}

/**
 * Exported message data structure.
 */
export interface MessageExport {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolUseIds: string | null;
}

/**
 * Exported tool use data structure.
 */
export interface ToolUseExport {
  id: string;
  sessionId: string;
  name: string;
  input: string;
  timestamp: string;
  status: string;
  result: string | null;
}

/**
 * Exported entity data structure.
 */
export interface EntityExport {
  id: number;
  type: string;
  name: string;
  metadata: string | null;
  confidence: number;
}

/**
 * Exported link data structure.
 */
export interface LinkExport {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationship: string;
  weight: number;
}

/**
 * Exported session-entity relationship.
 */
export interface SessionEntityExport {
  sessionId: string;
  entityId: number;
  frequency: number;
}

/**
 * Exported entity-entity relationship.
 */
export interface EntityLinkExport {
  sourceId: number;
  targetId: number;
  relationship: string;
  weight: number;
}

/**
 * Exported extraction state.
 */
export interface ExtractionStateExport {
  id: string;
  sessionPath: string;
  startedAt: string;
  status: string;
  completedAt: string | null;
  messagesExtracted: number;
  errorMessage: string | null;
  fileMtime: string | null;
  fileSize: number | null;
}

/**
 * Exported fact data structure.
 */
export interface FactExport {
  uuid: string;
  type: string;
  project: string;
  content: string;
  metadata: string | null;
  observedAt: string;
  supersededAt: string | null;
  supersededBy: string | null;
}

/**
 * Complete export data structure with version and statistics.
 */
export interface ExportData {
  version: string;
  exportedAt: string;
  stats: {
    sessions: number;
    messages: number;
    toolUses: number;
    entities: number;
    links: number;
    sessionEntities: number;
    entityLinks: number;
    extractionStates: number;
    facts?: number;
  };
  sessions: SessionExport[];
  messages: MessageExport[];
  toolUses: ToolUseExport[];
  entities: EntityExport[];
  links: LinkExport[];
  sessionEntities: SessionEntityExport[];
  entityLinks: EntityLinkExport[];
  extractionStates: ExtractionStateExport[];
  facts?: FactExport[];
}

/**
 * Export operation result statistics.
 */
export interface ExportStats {
  sessions: number;
  messages: number;
  toolUses: number;
  entities: number;
  links: number;
  bytes: number;
  facts?: number;
}

/**
 * Import operation result statistics.
 */
export interface ImportStats {
  sessions: number;
  messages: number;
  toolUses: number;
  entities: number;
  links: number;
  facts?: number;
}

/**
 * Validation result for export files.
 */
export interface ValidationResult {
  valid: boolean;
  version?: string;
  error?: string;
}

// ============================================================================
// Export/Import Options
// ============================================================================

/**
 * Options for import operations.
 */
export interface ImportOptions {
  /** Clear existing data before import. Default: false */
  clearExisting?: boolean | undefined;
}

/**
 * Options for export operations.
 */
export interface ExportToJsonOptions {
  /** Redactor to apply before writing exported content. */
  redactor?: IRedactor | undefined;
  /** Write raw sensitive values. Requires explicit opt-in at the CLI boundary. */
  includeSensitive?: boolean | undefined;
}

type TextRedactor = Pick<IRedactor, "redactText">;

const NOOP_REDACTOR: TextRedactor = {
  redactText: (input) => ({ text: input, findings: [] }),
};

function redactText(redactor: TextRedactor, value: string): string {
  return redactor.redactText(value).text;
}

function redactNullableText(redactor: TextRedactor, value: string | null): string | null {
  return value === null ? null : redactText(redactor, value);
}

// ============================================================================
// Export Function
// ============================================================================

/**
 * Export database contents to a JSON file.
 *
 * Writes the supported v1 tables to the specified path, including a format
 * version. This is not a complete backup of every memory surface.
 *
 * @param db - Database connection
 * @param outputPath - Path to write the JSON file
 * @returns Statistics about the exported data
 */
export async function exportToJson(
  db: Database,
  outputPath: string,
  options: ExportToJsonOptions = {}
): Promise<ExportStats> {
  const redactor = options.includeSensitive
    ? NOOP_REDACTOR
    : options.redactor ?? NOOP_REDACTOR;

  // Query all sessions
  using sessionsStatement = db.prepare<SessionExport, []>(`SELECT id, project_path_encoded as projectPathEncoded,
              project_path_decoded as projectPathDecoded,
              project_name as projectName,
              start_time as startTime, end_time as endTime,
              message_count as messageCount, summary
       FROM sessions`);
  const sessions = sessionsStatement.all()
    .map((session) => ({
      ...session,
      summary: redactNullableText(redactor, session.summary),
    }));

  // Query all messages
  using messagesStatement = db.prepare<MessageExport, []>(`SELECT id, session_id as sessionId, role, content, timestamp,
              tool_use_ids as toolUseIds
       FROM messages_meta`);
  const messages = messagesStatement.all()
    .map((message) => ({
      ...message,
      content: redactText(redactor, message.content),
    }));

  // Query all tool uses
  using toolUsesStatement = db.prepare<ToolUseExport, []>(`SELECT id, session_id as sessionId, name, input, timestamp, status, result
       FROM tool_uses`);
  const toolUses = toolUsesStatement.all()
    .map((toolUse) => ({
      ...toolUse,
      input: redactText(redactor, toolUse.input),
      result: redactNullableText(redactor, toolUse.result),
    }));

  // Query all entities
  using entitiesStatement = db.prepare<EntityExport, []>(`SELECT id, type, name, metadata, confidence
       FROM entities`);
  const entities = entitiesStatement.all()
    .map((entity) => ({
      ...entity,
      name: redactText(redactor, entity.name),
      metadata: redactNullableText(redactor, entity.metadata),
    }));

  // Query all links
  using linksStatement = db.prepare<LinkExport, []>(`SELECT source_type as sourceType, source_id as sourceId,
              target_type as targetType, target_id as targetId,
              relationship, weight
       FROM links`);
  const links = linksStatement.all();

  // Query session-entity relationships
  using sessionEntitiesStatement = db.prepare<SessionEntityExport, []>(`SELECT session_id as sessionId, entity_id as entityId, frequency
       FROM session_entities`);
  const sessionEntities = sessionEntitiesStatement.all();

  // Query entity-entity relationships
  using entityLinksStatement = db.prepare<EntityLinkExport, []>(`SELECT source_id as sourceId, target_id as targetId, relationship, weight
       FROM entity_links`);
  const entityLinks = entityLinksStatement.all();

  // Query extraction states
  using extractionStatesStatement = db.prepare<ExtractionStateExport, []>(`SELECT id, session_path as sessionPath, started_at as startedAt,
              status, completed_at as completedAt,
              messages_extracted as messagesExtracted,
              error_message as errorMessage,
              file_mtime as fileMtime, file_size as fileSize
       FROM extraction_state`);
  const extractionStates = extractionStatesStatement.all()
    .map((state) => ({
      ...state,
      sessionPath: redactText(redactor, state.sessionPath),
      errorMessage: redactNullableText(redactor, state.errorMessage),
    }));

  // Query all facts
  using factsStatement = db.prepare<FactExport, []>(`SELECT uuid, type, project, content, metadata,
              observed_at as observedAt, superseded_at as supersededAt,
              superseded_by as supersededBy
       FROM facts`);
  const facts = factsStatement.all()
    .map((fact) => ({
      ...fact,
      content: redactText(redactor, fact.content),
      metadata: redactNullableText(redactor, fact.metadata),
    }));

  // Build export data structure
  const exportData: ExportData = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    stats: {
      sessions: sessions.length,
      messages: messages.length,
      toolUses: toolUses.length,
      entities: entities.length,
      links: links.length,
      sessionEntities: sessionEntities.length,
      entityLinks: entityLinks.length,
      extractionStates: extractionStates.length,
      facts: facts.length,
    },
    sessions,
    messages,
    toolUses,
    entities,
    links,
    sessionEntities,
    entityLinks,
    extractionStates,
    facts,
  };

  // Write to file
  const jsonContent = JSON.stringify(exportData, null, 2);
  await Bun.write(outputPath, jsonContent);

  return {
    sessions: sessions.length,
    messages: messages.length,
    toolUses: toolUses.length,
    entities: entities.length,
    links: links.length,
    bytes: jsonContent.length,
    facts: facts.length,
  };
}

// ============================================================================
// Validation Function
// ============================================================================

/**
 * Validate an export file before importing.
 *
 * Checks that the file exists, contains valid JSON, and has the required
 * fields and version information.
 *
 * @param path - Path to the export file
 * @returns Validation result with version if valid
 */
export async function validateExportFile(
  path: string
): Promise<ValidationResult> {
  // Check file exists
  if (!existsSync(path)) {
    return { valid: false, error: "File does not exist" };
  }

  try {
    // Read and parse file
    const file = Bun.file(path);
    const content = await file.text();
    const data = JSON.parse(content) as Partial<ExportData>;

    // Check version field
    if (!data.version || typeof data.version !== "string") {
      return { valid: false, error: "Missing or invalid version field" };
    }

    // Check required arrays
    const requiredArrays = [
      "sessions",
      "messages",
      "toolUses",
      "entities",
      "links",
    ];
    for (const field of requiredArrays) {
      if (!Array.isArray(data[field as keyof ExportData])) {
        return { valid: false, error: `Missing or invalid ${field} array` };
      }
    }

    // Check stats object
    if (!data.stats || typeof data.stats !== "object") {
      return { valid: false, error: "Missing or invalid stats object" };
    }

    return { valid: true, version: data.version };
  } catch (error) {
    const message = unknownErrorMessage(error);
    return { valid: false, error: `Failed to parse file: ${message}` };
  }
}

// ============================================================================
// Import Function
// ============================================================================

/**
 * Import data from a JSON export file.
 *
 * Validates the file, optionally clears existing data, and inserts all
 * records from the export. Uses batched inserts within transactions for
 * performance.
 *
 * @param db - Database connection
 * @param inputPath - Path to the export file
 * @param options - Import options (clearExisting)
 * @returns Statistics about the imported data
 * @throws Error if validation fails
 */
export async function importFromJson(
  db: Database,
  inputPath: string,
  options: ImportOptions = {}
): Promise<ImportStats> {
  // Validate file first
  const validation = await validateExportFile(inputPath);
  if (!validation.valid) {
    throw new Error(`Invalid export file: ${validation.error}`);
  }

  // Read and parse file
  const file = Bun.file(inputPath);
  const content = await file.text();
  const data = JSON.parse(content) as ExportData;

  // Import in transaction for atomicity
  const importData = db.transaction(() => {
    // Replacement and inserts share one rollback boundary.
    if (options.clearExisting) clearAllTables(db);
    const stats = { sessions: 0, messages: 0, toolUses: 0, entities: 0, links: 0, facts: 0 };
    // Import sessions first (referenced by messages, tool_uses)
    using insertSession = db.prepare(`
      INSERT INTO sessions
        (id, project_path_encoded, project_path_decoded, project_name,
         start_time, end_time, message_count, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING RETURNING 1 AS inserted
    `);

    for (const s of data.sessions) {
      stats.sessions += insertSession.get(
        s.id,
        s.projectPathEncoded,
        s.projectPathDecoded,
        s.projectName,
        s.startTime,
        s.endTime,
        s.messageCount,
        s.summary
      ) ? 1 : 0;
    }

    // Import messages (triggers will update FTS5)
    using insertMessage = db.prepare(`
      INSERT INTO messages_meta
        (id, session_id, role, content, timestamp, tool_use_ids)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING RETURNING 1 AS inserted
    `);

    for (const m of data.messages) {
      stats.messages += insertMessage.get(
        m.id,
        m.sessionId,
        m.role,
        m.content,
        m.timestamp,
        m.toolUseIds
      ) ? 1 : 0;
    }

    // Import tool uses
    using insertToolUse = db.prepare(`
      INSERT INTO tool_uses
        (id, session_id, name, input, timestamp, status, result)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING RETURNING 1 AS inserted
    `);

    for (const t of data.toolUses) {
      stats.toolUses += insertToolUse.get(
        t.id,
        t.sessionId,
        t.name,
        t.input,
        t.timestamp,
        t.status,
        t.result
      ) ? 1 : 0;
    }

    // Import entities
    using insertEntity = db.prepare(`
      INSERT INTO entities
        (id, type, name, metadata, confidence)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING RETURNING 1 AS inserted
    `);

    for (const e of data.entities) {
      stats.entities += insertEntity.get(e.id, e.type, e.name, e.metadata, e.confidence) ? 1 : 0;
    }

    // Import links
    using insertLink = db.prepare(`
      INSERT INTO links
        (source_type, source_id, target_type, target_id, relationship, weight)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING RETURNING 1 AS inserted
    `);

    for (const l of data.links) {
      stats.links += insertLink.get(
        l.sourceType,
        l.sourceId,
        l.targetType,
        l.targetId,
        l.relationship,
        l.weight
      ) ? 1 : 0;
    }

    // Import session-entity relationships (if present)
    if (data.sessionEntities && data.sessionEntities.length > 0) {
      using insertSessionEntity = db.prepare(`
        INSERT INTO session_entities
          (session_id, entity_id, frequency)
        VALUES (?, ?, ?)
      ON CONFLICT DO NOTHING
    `);

      for (const se of data.sessionEntities) {
        insertSessionEntity.run(se.sessionId, se.entityId, se.frequency);
      }
    }

    // Import entity-entity relationships (if present)
    if (data.entityLinks && data.entityLinks.length > 0) {
      using insertEntityLink = db.prepare(`
        INSERT INTO entity_links
          (source_id, target_id, relationship, weight)
        VALUES (?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `);

      for (const el of data.entityLinks) {
        insertEntityLink.run(
          el.sourceId,
          el.targetId,
          el.relationship,
          el.weight
        );
      }
    }

    // Import extraction states (if present)
    if (data.extractionStates && data.extractionStates.length > 0) {
      using insertState = db.prepare(`
        INSERT INTO extraction_state
          (id, session_path, started_at, status, completed_at,
           messages_extracted, error_message, file_mtime, file_size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `);

      for (const es of data.extractionStates) {
        insertState.run(
          es.id,
          es.sessionPath,
          es.startedAt,
          es.status,
          es.completedAt,
          es.messagesExtracted,
          es.errorMessage,
          es.fileMtime,
          es.fileSize
        );
      }
    }

    // Import facts (if present)
    if (data.facts && data.facts.length > 0) {
      using insertFact = db.prepare(`
        INSERT INTO facts
          (uuid, type, project, content, metadata, observed_at, superseded_at, superseded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING RETURNING 1 AS inserted
    `);

      for (const f of data.facts) {
        stats.facts += insertFact.get(
          f.uuid,
          f.type,
          f.project,
          f.content,
          f.metadata,
          f.observedAt,
          f.supersededAt,
          f.supersededBy
        ) ? 1 : 0;
      }
    }

    return stats;
  });

  return importData.immediate();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clear the legacy import targets and obsolete message embedding state.
 *
 * For FTS5 external content tables, we delete from the content table first
 * which triggers the FTS5 delete via triggers. The sessions_fts table is
 * standalone and can be cleared directly.
 *
 * Order matters due to foreign key constraints.
 */
function clearAllTables(db: Database): void {
  // Child-first deletion preserves the caller foreign-key policy.
  // Imported source rows cannot reuse vectors or skip decisions from old rows.
  // These derived tables may be absent in older exports' destination schemas.
  using tableExists = db.prepare<{ name: string }, [string]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
  );
  for (const table of ["message_embeddings", "embedding_state", "embedding_skips"]) {
    if (tableExists.get(table)) db.exec(`DELETE FROM ${table}`);
  }

  // Clear relationship tables first
  db.exec("DELETE FROM session_entities;");
  db.exec("DELETE FROM entity_links;");
  db.exec("DELETE FROM links;");

  // Clear messages_meta - triggers will handle messages_fts cleanup
  db.exec("DELETE FROM messages_meta;");

  // Clear sessions_fts (standalone FTS5 table, not external content)
  db.exec("DELETE FROM sessions_fts;");

  // Clear remaining main tables
  db.exec("DELETE FROM facts;");
  db.exec("DELETE FROM tool_uses;");
  db.exec("DELETE FROM sessions;");
  db.exec("DELETE FROM entities;");
  db.exec("DELETE FROM extraction_state;");
  db.exec("DELETE FROM topics;");
}

/**
 * Check if database has existing data.
 *
 * @param db - Database connection
 * @returns true if any tables have data
 */
export function hasExistingData(db: Database): boolean {
  using statement = db.prepare<{ count: number }, []>(`SELECT (SELECT COUNT(*) FROM sessions) +
              (SELECT COUNT(*) FROM messages_meta) as count`);
  const result = statement.get();

  // Both COUNT subqueries always produce one non-null aggregate row, even empty.
  return result!.count > 0;
}
