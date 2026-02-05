/**
 * Export/Import Service
 *
 * Provides database backup and restore functionality through JSON serialization.
 * Supports full database export, validation, and import with round-trip integrity.
 */

import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

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
  };
  sessions: SessionExport[];
  messages: MessageExport[];
  toolUses: ToolUseExport[];
  entities: EntityExport[];
  links: LinkExport[];
  sessionEntities: SessionEntityExport[];
  entityLinks: EntityLinkExport[];
  extractionStates: ExtractionStateExport[];
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
  clearExisting?: boolean;
}

// ============================================================================
// Export Function
// ============================================================================

/**
 * Export database contents to a JSON file.
 *
 * Queries all data tables and writes a complete backup to the specified path.
 * The export includes a version field for future compatibility checks.
 *
 * @param db - Database connection
 * @param outputPath - Path to write the JSON file
 * @returns Statistics about the exported data
 */
export async function exportToJson(
  db: Database,
  outputPath: string
): Promise<ExportStats> {
  // Query all sessions
  const sessions = db
    .query<SessionExport, []>(
      `SELECT id, project_path_encoded as projectPathEncoded,
              project_path_decoded as projectPathDecoded,
              project_name as projectName,
              start_time as startTime, end_time as endTime,
              message_count as messageCount, summary
       FROM sessions`
    )
    .all();

  // Query all messages
  const messages = db
    .query<MessageExport, []>(
      `SELECT id, session_id as sessionId, role, content, timestamp,
              tool_use_ids as toolUseIds
       FROM messages_meta`
    )
    .all();

  // Query all tool uses
  const toolUses = db
    .query<ToolUseExport, []>(
      `SELECT id, session_id as sessionId, name, input, timestamp, status, result
       FROM tool_uses`
    )
    .all();

  // Query all entities
  const entities = db
    .query<EntityExport, []>(
      `SELECT id, type, name, metadata, confidence
       FROM entities`
    )
    .all();

  // Query all links
  const links = db
    .query<LinkExport, []>(
      `SELECT source_type as sourceType, source_id as sourceId,
              target_type as targetType, target_id as targetId,
              relationship, weight
       FROM links`
    )
    .all();

  // Query session-entity relationships
  const sessionEntities = db
    .query<SessionEntityExport, []>(
      `SELECT session_id as sessionId, entity_id as entityId, frequency
       FROM session_entities`
    )
    .all();

  // Query entity-entity relationships
  const entityLinks = db
    .query<EntityLinkExport, []>(
      `SELECT source_id as sourceId, target_id as targetId, relationship, weight
       FROM entity_links`
    )
    .all();

  // Query extraction states
  const extractionStates = db
    .query<ExtractionStateExport, []>(
      `SELECT id, session_path as sessionPath, started_at as startedAt,
              status, completed_at as completedAt,
              messages_extracted as messagesExtracted,
              error_message as errorMessage,
              file_mtime as fileMtime, file_size as fileSize
       FROM extraction_state`
    )
    .all();

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
    },
    sessions,
    messages,
    toolUses,
    entities,
    links,
    sessionEntities,
    entityLinks,
    extractionStates,
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
    const message = error instanceof Error ? error.message : String(error);
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

  // Clear existing data if requested
  if (options.clearExisting) {
    clearAllTables(db);
  }

  // Import in transaction for atomicity
  const importData = db.transaction(() => {
    // Import sessions first (referenced by messages, tool_uses)
    const insertSession = db.prepare(`
      INSERT OR IGNORE INTO sessions
        (id, project_path_encoded, project_path_decoded, project_name,
         start_time, end_time, message_count, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of data.sessions) {
      insertSession.run(
        s.id,
        s.projectPathEncoded,
        s.projectPathDecoded,
        s.projectName,
        s.startTime,
        s.endTime,
        s.messageCount,
        s.summary
      );
    }

    // Import messages (triggers will update FTS5)
    const insertMessage = db.prepare(`
      INSERT OR IGNORE INTO messages_meta
        (id, session_id, role, content, timestamp, tool_use_ids)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const m of data.messages) {
      insertMessage.run(
        m.id,
        m.sessionId,
        m.role,
        m.content,
        m.timestamp,
        m.toolUseIds
      );
    }

    // Import tool uses
    const insertToolUse = db.prepare(`
      INSERT OR IGNORE INTO tool_uses
        (id, session_id, name, input, timestamp, status, result)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of data.toolUses) {
      insertToolUse.run(
        t.id,
        t.sessionId,
        t.name,
        t.input,
        t.timestamp,
        t.status,
        t.result
      );
    }

    // Import entities
    const insertEntity = db.prepare(`
      INSERT OR IGNORE INTO entities
        (id, type, name, metadata, confidence)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const e of data.entities) {
      insertEntity.run(e.id, e.type, e.name, e.metadata, e.confidence);
    }

    // Import links
    const insertLink = db.prepare(`
      INSERT OR IGNORE INTO links
        (source_type, source_id, target_type, target_id, relationship, weight)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const l of data.links) {
      insertLink.run(
        l.sourceType,
        l.sourceId,
        l.targetType,
        l.targetId,
        l.relationship,
        l.weight
      );
    }

    // Import session-entity relationships (if present)
    if (data.sessionEntities && data.sessionEntities.length > 0) {
      const insertSessionEntity = db.prepare(`
        INSERT OR IGNORE INTO session_entities
          (session_id, entity_id, frequency)
        VALUES (?, ?, ?)
      `);

      for (const se of data.sessionEntities) {
        insertSessionEntity.run(se.sessionId, se.entityId, se.frequency);
      }
    }

    // Import entity-entity relationships (if present)
    if (data.entityLinks && data.entityLinks.length > 0) {
      const insertEntityLink = db.prepare(`
        INSERT OR IGNORE INTO entity_links
          (source_id, target_id, relationship, weight)
        VALUES (?, ?, ?, ?)
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
      const insertState = db.prepare(`
        INSERT OR IGNORE INTO extraction_state
          (id, session_path, started_at, status, completed_at,
           messages_extracted, error_message, file_mtime, file_size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    return {
      sessions: data.sessions.length,
      messages: data.messages.length,
      toolUses: data.toolUses.length,
      entities: data.entities.length,
      links: data.links.length,
    };
  });

  return importData.immediate();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clear all data tables in the database.
 *
 * For FTS5 external content tables, we delete from the content table first
 * which triggers the FTS5 delete via triggers. The sessions_fts table is
 * standalone and can be cleared directly.
 *
 * Order matters due to foreign key constraints.
 */
function clearAllTables(db: Database): void {
  // Disable foreign keys temporarily for truncation
  db.exec("PRAGMA foreign_keys = OFF;");

  try {
    // Clear relationship tables first
    db.exec("DELETE FROM session_entities;");
    db.exec("DELETE FROM entity_links;");
    db.exec("DELETE FROM links;");

    // Clear messages_meta - triggers will handle messages_fts cleanup
    db.exec("DELETE FROM messages_meta;");

    // Clear sessions_fts (standalone FTS5 table, not external content)
    db.exec("DELETE FROM sessions_fts;");

    // Clear remaining main tables
    db.exec("DELETE FROM tool_uses;");
    db.exec("DELETE FROM sessions;");
    db.exec("DELETE FROM entities;");
    db.exec("DELETE FROM extraction_state;");
    db.exec("DELETE FROM topics;");
  } finally {
    // Re-enable foreign keys
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

/**
 * Check if database has existing data.
 *
 * @param db - Database connection
 * @returns true if any tables have data
 */
export function hasExistingData(db: Database): boolean {
  const result = db
    .query<{ count: number }, []>(
      `SELECT (SELECT COUNT(*) FROM sessions) +
              (SELECT COUNT(*) FROM messages_meta) as count`
    )
    .get();

  return (result?.count ?? 0) > 0;
}
