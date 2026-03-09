/**
 * SQLite Memory File Repository
 *
 * Implements IMemoryFileRepository using bun:sqlite prepared statements.
 * Uses INSERT ... ON CONFLICT for idempotent upsert by file_path.
 * FTS5 search delegates to sanitizeFtsQuery for safe query handling.
 */

import type { Database } from "bun:sqlite";
import type { IMemoryFileRepository } from "../../../domain/ports/repositories.js";
import { MemoryFile, type MemoryFileType } from "../../../domain/entities/memory-file.js";
import { sanitizeFtsQuery } from "../../../application/services/fts-sanitizer.js";

/**
 * Row shape from memory_files table
 */
interface MemoryFileRow {
    id: number;
    file_path: string;
    file_type: MemoryFileType;
    project_encoded: string | null;
    content: string;
    content_hash: string;
    last_indexed_at: string;
    created_at: string;
}

/**
 * Upsert SQL for memory files.
 * Shared between save() and saveMany() to avoid duplication.
 */
const UPSERT_SQL = `
    INSERT INTO memory_files (file_path, file_type, project_encoded, content, content_hash, last_indexed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
        file_type = excluded.file_type,
        project_encoded = excluded.project_encoded,
        content = excluded.content,
        content_hash = excluded.content_hash,
        last_indexed_at = excluded.last_indexed_at
`;

/**
 * SQLite implementation of IMemoryFileRepository.
 *
 * Persists MemoryFile entities in the memory_files table with
 * FTS5 search support via the memory_files_fts virtual table.
 */
export class SqliteMemoryFileRepository implements IMemoryFileRepository {
    private readonly db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    async findByPath(filePath: string): Promise<MemoryFile | null> {
        const row = this.db
            .prepare<MemoryFileRow, [string]>(
                "SELECT * FROM memory_files WHERE file_path = ?"
            )
            .get(filePath);
        return row ? this.toEntity(row) : null;
    }

    async findByType(fileType: MemoryFileType): Promise<MemoryFile[]> {
        const rows = this.db
            .prepare<MemoryFileRow, [string]>(
                "SELECT * FROM memory_files WHERE file_type = ? ORDER BY last_indexed_at DESC"
            )
            .all(fileType);
        return rows.map((r) => this.toEntity(r));
    }

    async findByProject(projectEncoded: string): Promise<MemoryFile[]> {
        const rows = this.db
            .prepare<MemoryFileRow, [string]>(
                "SELECT * FROM memory_files WHERE project_encoded = ? ORDER BY file_path"
            )
            .all(projectEncoded);
        return rows.map((r) => this.toEntity(r));
    }

    async save(file: MemoryFile): Promise<void> {
        this.db.prepare(UPSERT_SQL).run(
            file.filePath,
            file.fileType,
            file.projectEncoded ?? null,
            file.content,
            file.contentHash,
            file.lastIndexedAt.toISOString()
        );
    }

    async saveMany(files: MemoryFile[]): Promise<void> {
        const stmt = this.db.prepare(UPSERT_SQL);
        const transaction = this.db.transaction(() => {
            for (const file of files) {
                stmt.run(
                    file.filePath,
                    file.fileType,
                    file.projectEncoded ?? null,
                    file.content,
                    file.contentHash,
                    file.lastIndexedAt.toISOString()
                );
            }
        });
        transaction();
    }

    async searchContent(query: string, limit: number = 20): Promise<MemoryFile[]> {
        const sanitized = sanitizeFtsQuery(query);
        if (!sanitized) return [];

        const rows = this.db
            .prepare<MemoryFileRow, [string, number]>(`
                SELECT m.* FROM memory_files m
                JOIN memory_files_fts f ON f.rowid = m.id
                WHERE memory_files_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            `)
            .all(sanitized, limit);
        return rows.map((r) => this.toEntity(r));
    }

    async findCrossProjectLearnings(
        excludeProject?: string,
        limit: number = 20
    ): Promise<MemoryFile[]> {
        if (excludeProject) {
            const rows = this.db
                .prepare<MemoryFileRow, [string, number]>(
                    `SELECT * FROM memory_files
                     WHERE file_type = 'learnings'
                       AND content LIKE '%Applies to: cross-project%'
                       AND (project_encoded IS NULL OR project_encoded != ?)
                     ORDER BY last_indexed_at DESC
                     LIMIT ?`
                )
                .all(excludeProject, limit);
            return rows.map((r) => this.toEntity(r));
        }

        const rows = this.db
            .prepare<MemoryFileRow, [number]>(
                `SELECT * FROM memory_files
                 WHERE file_type = 'learnings'
                   AND content LIKE '%Applies to: cross-project%'
                 ORDER BY last_indexed_at DESC
                 LIMIT ?`
            )
            .all(limit);
        return rows.map((r) => this.toEntity(r));
    }

    private toEntity(row: MemoryFileRow): MemoryFile {
        return MemoryFile.create({
            id: row.id,
            filePath: row.file_path,
            fileType: row.file_type,
            projectEncoded: row.project_encoded ?? undefined,
            content: row.content,
            contentHash: row.content_hash,
            lastIndexedAt: new Date(row.last_indexed_at),
            createdAt: new Date(row.created_at),
        });
    }
}
