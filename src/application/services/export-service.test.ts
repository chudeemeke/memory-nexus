/**
 * Export/Import Service Tests
 *
 * Tests for database backup and restore functionality including
 * round-trip integrity verification.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSchema } from "../../infrastructure/database/schema.js";
import {
  exportToJson,
  validateExportFile,
  importFromJson,
  hasExistingData,
  type ExportData,
} from "./export-service.js";

// Test directory for file operations
const TEST_DIR = join(tmpdir(), "memory-nexus-export-test");

describe("Export Service", () => {
  let db: Database;
  let exportPath: string;

  beforeEach(() => {
    // Create fresh test directory
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    exportPath = join(TEST_DIR, "export.json");

    // Create in-memory database with schema
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
  });

  afterEach(() => {
    db.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // ==========================================================================
  // Export Tests
  // ==========================================================================

  describe("exportToJson", () => {
    test("creates valid JSON file", async () => {
      // Seed minimal data
      seedTestData(db);

      // Export
      const stats = await exportToJson(db, exportPath);

      // Verify file exists
      expect(existsSync(exportPath)).toBe(true);

      // Verify JSON is valid
      const content = await Bun.file(exportPath).text();
      const data = JSON.parse(content) as ExportData;
      expect(data).toBeDefined();
      expect(data.version).toBe("1.0");
    });

    test("includes all data types", async () => {
      // Seed complete data
      seedCompleteTestData(db);

      // Export
      await exportToJson(db, exportPath);

      // Parse and verify
      const content = await Bun.file(exportPath).text();
      const data = JSON.parse(content) as ExportData;

      expect(data.sessions.length).toBeGreaterThan(0);
      expect(data.messages.length).toBeGreaterThan(0);
      expect(data.toolUses.length).toBeGreaterThan(0);
      expect(data.entities.length).toBeGreaterThan(0);
      expect(data.links.length).toBeGreaterThan(0);
    });

    test("includes version field", async () => {
      seedTestData(db);
      await exportToJson(db, exportPath);

      const content = await Bun.file(exportPath).text();
      const data = JSON.parse(content) as ExportData;

      expect(data.version).toBe("1.0");
      expect(typeof data.version).toBe("string");
    });

    test("includes exportedAt timestamp", async () => {
      seedTestData(db);
      const beforeExport = new Date();
      await exportToJson(db, exportPath);
      const afterExport = new Date();

      const content = await Bun.file(exportPath).text();
      const data = JSON.parse(content) as ExportData;

      const exportedAt = new Date(data.exportedAt);
      expect(exportedAt.getTime()).toBeGreaterThanOrEqual(beforeExport.getTime());
      expect(exportedAt.getTime()).toBeLessThanOrEqual(afterExport.getTime());
    });

    test("includes accurate stats", async () => {
      seedCompleteTestData(db);
      await exportToJson(db, exportPath);

      const content = await Bun.file(exportPath).text();
      const data = JSON.parse(content) as ExportData;

      expect(data.stats.sessions).toBe(data.sessions.length);
      expect(data.stats.messages).toBe(data.messages.length);
      expect(data.stats.toolUses).toBe(data.toolUses.length);
      expect(data.stats.entities).toBe(data.entities.length);
      expect(data.stats.links).toBe(data.links.length);
    });

    test("returns correct byte count", async () => {
      seedTestData(db);
      const stats = await exportToJson(db, exportPath);

      const file = Bun.file(exportPath);
      const actualSize = file.size;

      expect(stats.bytes).toBe(actualSize);
    });

    test("handles empty database", async () => {
      const stats = await exportToJson(db, exportPath);

      expect(stats.sessions).toBe(0);
      expect(stats.messages).toBe(0);
      expect(stats.toolUses).toBe(0);
      expect(stats.entities).toBe(0);
      expect(stats.links).toBe(0);

      // File should still be valid JSON
      const content = await Bun.file(exportPath).text();
      const data = JSON.parse(content) as ExportData;
      expect(data.version).toBe("1.0");
    });
  });

  // ==========================================================================
  // Validation Tests
  // ==========================================================================

  describe("validateExportFile", () => {
    test("validates valid export file", async () => {
      seedTestData(db);
      await exportToJson(db, exportPath);

      const result = await validateExportFile(exportPath);

      expect(result.valid).toBe(true);
      expect(result.version).toBe("1.0");
      expect(result.error).toBeUndefined();
    });

    test("rejects missing file", async () => {
      const result = await validateExportFile("/nonexistent/path.json");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("File does not exist");
    });

    test("rejects invalid JSON", async () => {
      await Bun.write(exportPath, "not valid json {");

      const result = await validateExportFile(exportPath);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Failed to parse file/);
    });

    test("rejects missing version field", async () => {
      const invalidData = {
        sessions: [],
        messages: [],
        toolUses: [],
        entities: [],
        links: [],
        stats: {},
      };
      await Bun.write(exportPath, JSON.stringify(invalidData));

      const result = await validateExportFile(exportPath);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing or invalid version field");
    });

    test("rejects missing sessions array", async () => {
      const invalidData = {
        version: "1.0",
        messages: [],
        toolUses: [],
        entities: [],
        links: [],
        stats: {},
      };
      await Bun.write(exportPath, JSON.stringify(invalidData));

      const result = await validateExportFile(exportPath);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing or invalid sessions array");
    });

    test("rejects missing stats object", async () => {
      const invalidData = {
        version: "1.0",
        sessions: [],
        messages: [],
        toolUses: [],
        entities: [],
        links: [],
      };
      await Bun.write(exportPath, JSON.stringify(invalidData));

      const result = await validateExportFile(exportPath);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing or invalid stats object");
    });
  });

  // ==========================================================================
  // Import Tests
  // ==========================================================================

  describe("importFromJson", () => {
    test("restores data correctly", async () => {
      // Seed and export
      seedTestData(db);
      await exportToJson(db, exportPath);

      // Create new database
      const newDb = new Database(":memory:");
      newDb.exec("PRAGMA foreign_keys = ON;");
      createSchema(newDb);

      // Import
      const stats = await importFromJson(newDb, exportPath);

      expect(stats.sessions).toBe(1);
      expect(stats.messages).toBe(2);

      // Verify data
      const sessions = newDb.query("SELECT * FROM sessions").all();
      expect(sessions.length).toBe(1);

      const messages = newDb.query("SELECT * FROM messages_meta").all();
      expect(messages.length).toBe(2);

      newDb.close();
    });

    test("throws on invalid file", async () => {
      await Bun.write(exportPath, "invalid json");

      await expect(importFromJson(db, exportPath)).rejects.toThrow(
        /Invalid export file/
      );
    });

    test("clearExisting option removes existing data", async () => {
      // Seed original data
      seedTestData(db);
      const originalCount = db
        .query<{ count: number }, []>("SELECT COUNT(*) as count FROM sessions")
        .get()?.count;
      expect(originalCount).toBe(1);

      // Create export with different data
      const newDb = new Database(":memory:");
      newDb.exec("PRAGMA foreign_keys = ON;");
      createSchema(newDb);
      seedDifferentTestData(newDb);
      await exportToJson(newDb, exportPath);
      newDb.close();

      // Import with clearExisting
      await importFromJson(db, exportPath, { clearExisting: true });

      // Should have new data only
      const sessions = db
        .query<{ id: string }, []>("SELECT id FROM sessions")
        .all();
      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe("different-session-1");
    });

    test("preserves existing data without clearExisting", async () => {
      // Seed original data
      seedTestData(db);

      // Create export with different data
      const newDb = new Database(":memory:");
      newDb.exec("PRAGMA foreign_keys = ON;");
      createSchema(newDb);
      seedDifferentTestData(newDb);
      await exportToJson(newDb, exportPath);
      newDb.close();

      // Import without clearExisting
      await importFromJson(db, exportPath);

      // Should have both
      const sessions = db
        .query<{ count: number }, []>("SELECT COUNT(*) as count FROM sessions")
        .get();
      expect(sessions?.count).toBe(2);
    });

    test("handles version gracefully", async () => {
      // Create export with different version
      const exportData: ExportData = {
        version: "2.0",
        exportedAt: new Date().toISOString(),
        stats: {
          sessions: 0,
          messages: 0,
          toolUses: 0,
          entities: 0,
          links: 0,
          sessionEntities: 0,
          entityLinks: 0,
          extractionStates: 0,
        },
        sessions: [],
        messages: [],
        toolUses: [],
        entities: [],
        links: [],
        sessionEntities: [],
        entityLinks: [],
        extractionStates: [],
      };
      await Bun.write(exportPath, JSON.stringify(exportData));

      // Should still import (version is informational for now)
      const stats = await importFromJson(db, exportPath);
      expect(stats.sessions).toBe(0);
    });
  });

  // ==========================================================================
  // Round-Trip Tests (CRITICAL)
  // ==========================================================================

  describe("round-trip integrity", () => {
    test("export then import produces identical data", async () => {
      // Seed comprehensive test data
      seedCompleteTestData(db);

      // Capture original data
      const originalSessions = db
        .query<Record<string, unknown>, []>(
          `SELECT id, project_path_encoded, project_path_decoded, project_name,
                  start_time, end_time, message_count, summary
           FROM sessions ORDER BY id`
        )
        .all();
      const originalMessages = db
        .query<Record<string, unknown>, []>(
          `SELECT id, session_id, role, content, timestamp, tool_use_ids
           FROM messages_meta ORDER BY id`
        )
        .all();
      const originalToolUses = db
        .query<Record<string, unknown>, []>(
          `SELECT id, session_id, name, input, timestamp, status, result
           FROM tool_uses ORDER BY id`
        )
        .all();
      const originalEntities = db
        .query<Record<string, unknown>, []>(
          `SELECT id, type, name, metadata, confidence
           FROM entities ORDER BY id`
        )
        .all();
      const originalLinks = db
        .query<Record<string, unknown>, []>(
          `SELECT source_type, source_id, target_type, target_id, relationship, weight
           FROM links ORDER BY source_type, source_id, target_type, target_id`
        )
        .all();

      // Export
      await exportToJson(db, exportPath);

      // Create new database and import
      const newDb = new Database(":memory:");
      newDb.exec("PRAGMA foreign_keys = ON;");
      createSchema(newDb);
      await importFromJson(newDb, exportPath);

      // Capture imported data
      const importedSessions = newDb
        .query<Record<string, unknown>, []>(
          `SELECT id, project_path_encoded, project_path_decoded, project_name,
                  start_time, end_time, message_count, summary
           FROM sessions ORDER BY id`
        )
        .all();
      const importedMessages = newDb
        .query<Record<string, unknown>, []>(
          `SELECT id, session_id, role, content, timestamp, tool_use_ids
           FROM messages_meta ORDER BY id`
        )
        .all();
      const importedToolUses = newDb
        .query<Record<string, unknown>, []>(
          `SELECT id, session_id, name, input, timestamp, status, result
           FROM tool_uses ORDER BY id`
        )
        .all();
      const importedEntities = newDb
        .query<Record<string, unknown>, []>(
          `SELECT id, type, name, metadata, confidence
           FROM entities ORDER BY id`
        )
        .all();
      const importedLinks = newDb
        .query<Record<string, unknown>, []>(
          `SELECT source_type, source_id, target_type, target_id, relationship, weight
           FROM links ORDER BY source_type, source_id, target_type, target_id`
        )
        .all();

      // Compare counts
      expect(importedSessions.length).toBe(originalSessions.length);
      expect(importedMessages.length).toBe(originalMessages.length);
      expect(importedToolUses.length).toBe(originalToolUses.length);
      expect(importedEntities.length).toBe(originalEntities.length);
      expect(importedLinks.length).toBe(originalLinks.length);

      // Compare content (deep equality)
      expect(importedSessions).toEqual(originalSessions);
      expect(importedMessages).toEqual(originalMessages);
      expect(importedToolUses).toEqual(originalToolUses);
      expect(importedEntities).toEqual(originalEntities);
      expect(importedLinks).toEqual(originalLinks);

      newDb.close();
    });

    test("round-trip preserves session-entity relationships", async () => {
      seedCompleteTestData(db);

      // Capture original
      const original = db
        .query<Record<string, unknown>, []>(
          `SELECT session_id, entity_id, frequency
           FROM session_entities ORDER BY session_id, entity_id`
        )
        .all();

      // Export and import
      await exportToJson(db, exportPath);
      const newDb = new Database(":memory:");
      newDb.exec("PRAGMA foreign_keys = ON;");
      createSchema(newDb);
      await importFromJson(newDb, exportPath);

      // Compare
      const imported = newDb
        .query<Record<string, unknown>, []>(
          `SELECT session_id, entity_id, frequency
           FROM session_entities ORDER BY session_id, entity_id`
        )
        .all();

      expect(imported).toEqual(original);
      newDb.close();
    });

    test("round-trip preserves entity-entity links", async () => {
      seedCompleteTestData(db);

      // Capture original
      const original = db
        .query<Record<string, unknown>, []>(
          `SELECT source_id, target_id, relationship, weight
           FROM entity_links ORDER BY source_id, target_id`
        )
        .all();

      // Export and import
      await exportToJson(db, exportPath);
      const newDb = new Database(":memory:");
      newDb.exec("PRAGMA foreign_keys = ON;");
      createSchema(newDb);
      await importFromJson(newDb, exportPath);

      // Compare
      const imported = newDb
        .query<Record<string, unknown>, []>(
          `SELECT source_id, target_id, relationship, weight
           FROM entity_links ORDER BY source_id, target_id`
        )
        .all();

      expect(imported).toEqual(original);
      newDb.close();
    });

    test("round-trip preserves extraction states", async () => {
      seedCompleteTestData(db);

      // Capture original
      const original = db
        .query<Record<string, unknown>, []>(
          `SELECT id, session_path, started_at, status, completed_at,
                  messages_extracted, error_message, file_mtime, file_size
           FROM extraction_state ORDER BY id`
        )
        .all();

      // Export and import
      await exportToJson(db, exportPath);
      const newDb = new Database(":memory:");
      newDb.exec("PRAGMA foreign_keys = ON;");
      createSchema(newDb);
      await importFromJson(newDb, exportPath);

      // Compare
      const imported = newDb
        .query<Record<string, unknown>, []>(
          `SELECT id, session_path, started_at, status, completed_at,
                  messages_extracted, error_message, file_mtime, file_size
           FROM extraction_state ORDER BY id`
        )
        .all();

      expect(imported).toEqual(original);
      newDb.close();
    });
  });

  // ==========================================================================
  // Utility Function Tests
  // ==========================================================================

  describe("hasExistingData", () => {
    test("returns false for empty database", () => {
      expect(hasExistingData(db)).toBe(false);
    });

    test("returns true when sessions exist", () => {
      db.exec(`
        INSERT INTO sessions (id, project_path_encoded, project_path_decoded,
          project_name, start_time, message_count)
        VALUES ('s1', 'enc', 'dec', 'proj', '2024-01-01T00:00:00Z', 0)
      `);

      expect(hasExistingData(db)).toBe(true);
    });

    test("returns true when messages exist", () => {
      // Need session first due to FK
      db.exec(`
        INSERT INTO sessions (id, project_path_encoded, project_path_decoded,
          project_name, start_time, message_count)
        VALUES ('s1', 'enc', 'dec', 'proj', '2024-01-01T00:00:00Z', 0)
      `);
      db.exec(`
        INSERT INTO messages_meta (id, session_id, role, content, timestamp)
        VALUES ('m1', 's1', 'user', 'test', '2024-01-01T00:00:00Z')
      `);

      expect(hasExistingData(db)).toBe(true);
    });
  });
});

// ==========================================================================
// Test Data Helpers
// ==========================================================================

/**
 * Seed minimal test data (1 session, 2 messages).
 */
function seedTestData(db: Database): void {
  db.exec(`
    INSERT INTO sessions (id, project_path_encoded, project_path_decoded,
      project_name, start_time, end_time, message_count, summary)
    VALUES ('session-1', 'test-project', '/test/project', 'project',
      '2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z', 2, 'Test summary')
  `);

  db.exec(`
    INSERT INTO messages_meta (id, session_id, role, content, timestamp)
    VALUES
      ('msg-1', 'session-1', 'user', 'Hello', '2024-01-01T00:00:00Z'),
      ('msg-2', 'session-1', 'assistant', 'Hi there', '2024-01-01T00:01:00Z')
  `);
}

/**
 * Seed different test data (for merge/replace testing).
 */
function seedDifferentTestData(db: Database): void {
  db.exec(`
    INSERT INTO sessions (id, project_path_encoded, project_path_decoded,
      project_name, start_time, message_count)
    VALUES ('different-session-1', 'other-project', '/other/project', 'other',
      '2024-02-01T00:00:00Z', 0)
  `);
}

/**
 * Seed complete test data with all entity types and relationships.
 */
function seedCompleteTestData(db: Database): void {
  // Sessions
  db.exec(`
    INSERT INTO sessions (id, project_path_encoded, project_path_decoded,
      project_name, start_time, end_time, message_count, summary)
    VALUES
      ('session-1', 'proj-1', '/home/user/proj1', 'proj1',
        '2024-01-01T00:00:00Z', '2024-01-01T02:00:00Z', 3, 'First session'),
      ('session-2', 'proj-2', '/home/user/proj2', 'proj2',
        '2024-01-02T00:00:00Z', NULL, 2, NULL)
  `);

  // Messages
  db.exec(`
    INSERT INTO messages_meta (id, session_id, role, content, timestamp, tool_use_ids)
    VALUES
      ('msg-1', 'session-1', 'user', 'Create a function', '2024-01-01T00:00:00Z', NULL),
      ('msg-2', 'session-1', 'assistant', 'Here is the function', '2024-01-01T00:01:00Z', '["tool-1"]'),
      ('msg-3', 'session-1', 'user', 'Thanks', '2024-01-01T00:02:00Z', NULL),
      ('msg-4', 'session-2', 'user', 'Fix bug', '2024-01-02T00:00:00Z', NULL),
      ('msg-5', 'session-2', 'assistant', 'Bug fixed', '2024-01-02T00:01:00Z', '["tool-2"]')
  `);

  // Tool uses
  db.exec(`
    INSERT INTO tool_uses (id, session_id, name, input, timestamp, status, result)
    VALUES
      ('tool-1', 'session-1', 'Write', '{"path": "test.ts"}', '2024-01-01T00:01:00Z', 'success', 'File created'),
      ('tool-2', 'session-2', 'Edit', '{"path": "bug.ts"}', '2024-01-02T00:01:00Z', 'success', 'File edited')
  `);

  // Entities
  db.exec(`
    INSERT INTO entities (id, type, name, metadata, confidence)
    VALUES
      (1, 'concept', 'TypeScript', '{"category": "language"}', 0.9),
      (2, 'file', 'test.ts', '{"operation": "write"}', 0.95),
      (3, 'decision', 'Use SQLite', '{"subject": "Database", "decision": "SQLite", "rejected": [], "rationale": "Embedded"}', 0.85)
  `);

  // Links
  db.exec(`
    INSERT INTO links (source_type, source_id, target_type, target_id, relationship, weight)
    VALUES
      ('session', 'session-1', 'session', 'session-2', 'related_to', 0.8),
      ('session', 'session-1', 'topic', 'testing', 'mentions', 0.9)
  `);

  // Session-entity relationships
  db.exec(`
    INSERT INTO session_entities (session_id, entity_id, frequency)
    VALUES
      ('session-1', 1, 3),
      ('session-1', 2, 1),
      ('session-2', 1, 2)
  `);

  // Entity-entity relationships
  db.exec(`
    INSERT INTO entity_links (source_id, target_id, relationship, weight)
    VALUES
      (1, 2, 'related', 0.7)
  `);

  // Extraction states
  db.exec(`
    INSERT INTO extraction_state (id, session_path, started_at, status,
      completed_at, messages_extracted, error_message, file_mtime, file_size)
    VALUES
      ('state-1', '/path/to/session-1.jsonl', '2024-01-01T00:00:00Z', 'complete',
        '2024-01-01T00:00:01Z', 3, NULL, '2024-01-01T00:00:00Z', 1024),
      ('state-2', '/path/to/session-2.jsonl', '2024-01-02T00:00:00Z', 'complete',
        '2024-01-02T00:00:01Z', 2, NULL, '2024-01-02T00:00:00Z', 512)
  `);
}
