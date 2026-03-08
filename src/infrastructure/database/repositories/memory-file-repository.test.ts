/**
 * SqliteMemoryFileRepository Tests
 *
 * Tests CRUD operations, upsert behavior, and FTS5 search
 * for memory files stored in the memory_files table.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createSchema } from "../schema.js";
import { SqliteMemoryFileRepository } from "./memory-file-repository.js";
import { MemoryFile } from "../../../domain/entities/memory-file.js";
import type { IMemoryFileRepository } from "../../../domain/ports/repositories.js";

function makeMemoryFile(overrides: Partial<{
    id: number;
    filePath: string;
    fileType: "daily_log" | "decisions" | "learnings" | "user_prefs";
    projectEncoded: string;
    content: string;
    contentHash: string;
    lastIndexedAt: Date;
    createdAt: Date;
}> = {}): MemoryFile {
    return MemoryFile.create({
        filePath: overrides.filePath ?? "DECISIONS.md",
        fileType: overrides.fileType ?? "decisions",
        projectEncoded: overrides.projectEncoded,
        content: overrides.content ?? "Some decision content",
        contentHash: overrides.contentHash ?? "a".repeat(64),
        lastIndexedAt: overrides.lastIndexedAt ?? new Date("2026-03-08T10:00:00Z"),
        createdAt: overrides.createdAt,
        id: overrides.id,
    });
}

describe("SqliteMemoryFileRepository", () => {
    let db: Database;
    let repo: SqliteMemoryFileRepository;

    beforeEach(() => {
        db = new Database(":memory:");
        db.exec("PRAGMA foreign_keys = ON;");
        createSchema(db);
        repo = new SqliteMemoryFileRepository(db);
    });

    afterEach(() => {
        db.close();
    });

    it("should implement IMemoryFileRepository", () => {
        const _typeCheck: IMemoryFileRepository = repo;
        expect(_typeCheck).toBeDefined();
    });

    describe("save()", () => {
        it("should insert a MemoryFile", async () => {
            const file = makeMemoryFile({ filePath: "DECISIONS.md" });
            await repo.save(file);

            const row = db.prepare("SELECT * FROM memory_files WHERE file_path = ?").get("DECISIONS.md") as any;
            expect(row).toBeDefined();
            expect(row.file_path).toBe("DECISIONS.md");
            expect(row.file_type).toBe("decisions");
            expect(row.content).toBe("Some decision content");
        });

        it("should upsert on duplicate file_path", async () => {
            const file1 = makeMemoryFile({
                filePath: "LEARNINGS.md",
                fileType: "learnings",
                content: "original content",
                contentHash: "b".repeat(64),
            });
            await repo.save(file1);

            const file2 = makeMemoryFile({
                filePath: "LEARNINGS.md",
                fileType: "learnings",
                content: "updated content",
                contentHash: "c".repeat(64),
            });
            await repo.save(file2);

            const rows = db.prepare("SELECT * FROM memory_files WHERE file_path = ?").all("LEARNINGS.md") as any[];
            expect(rows.length).toBe(1);
            expect(rows[0].content).toBe("updated content");
            expect(rows[0].content_hash).toBe("c".repeat(64));
        });
    });

    describe("saveMany()", () => {
        it("should insert multiple MemoryFiles in batch", async () => {
            const files = [
                makeMemoryFile({ filePath: "DECISIONS.md", fileType: "decisions" }),
                makeMemoryFile({ filePath: "LEARNINGS.md", fileType: "learnings", contentHash: "b".repeat(64) }),
                makeMemoryFile({ filePath: "daily/2026-03-07.md", fileType: "daily_log", contentHash: "c".repeat(64) }),
            ];
            await repo.saveMany(files);

            const count = db.prepare("SELECT COUNT(*) as count FROM memory_files").get() as any;
            expect(count.count).toBe(3);
        });
    });

    describe("findByPath()", () => {
        it("should find a file by path with all fields matching", async () => {
            const file = makeMemoryFile({
                filePath: "projects/C--encoded/DECISIONS.md",
                fileType: "decisions",
                projectEncoded: "C--encoded",
                content: "project decisions",
                contentHash: "d".repeat(64),
            });
            await repo.save(file);

            const found = await repo.findByPath("projects/C--encoded/DECISIONS.md");
            expect(found).not.toBeNull();
            expect(found!.filePath).toBe("projects/C--encoded/DECISIONS.md");
            expect(found!.fileType).toBe("decisions");
            expect(found!.projectEncoded).toBe("C--encoded");
            expect(found!.content).toBe("project decisions");
            expect(found!.contentHash).toBe("d".repeat(64));
            expect(found!.lastIndexedAt).toBeInstanceOf(Date);
            expect(found!.createdAt).toBeInstanceOf(Date);
        });

        it("should return null for nonexistent path", async () => {
            const found = await repo.findByPath("nonexistent.md");
            expect(found).toBeNull();
        });
    });

    describe("findByType()", () => {
        it("should find files by type", async () => {
            await repo.saveMany([
                makeMemoryFile({ filePath: "daily/2026-03-07.md", fileType: "daily_log", contentHash: "a".repeat(64) }),
                makeMemoryFile({ filePath: "daily/2026-03-08.md", fileType: "daily_log", contentHash: "b".repeat(64) }),
                makeMemoryFile({ filePath: "DECISIONS.md", fileType: "decisions", contentHash: "c".repeat(64) }),
            ]);

            const dailyLogs = await repo.findByType("daily_log");
            expect(dailyLogs.length).toBe(2);
            for (const f of dailyLogs) {
                expect(f.fileType).toBe("daily_log");
            }
        });
    });

    describe("findByProject()", () => {
        it("should find only project-scoped files", async () => {
            await repo.saveMany([
                makeMemoryFile({
                    filePath: "projects/C--foo/DECISIONS.md",
                    fileType: "decisions",
                    projectEncoded: "C--foo",
                    contentHash: "a".repeat(64),
                }),
                makeMemoryFile({
                    filePath: "projects/C--foo/LEARNINGS.md",
                    fileType: "learnings",
                    projectEncoded: "C--foo",
                    contentHash: "b".repeat(64),
                }),
                makeMemoryFile({
                    filePath: "DECISIONS.md",
                    fileType: "decisions",
                    contentHash: "c".repeat(64),
                }),
            ]);

            const results = await repo.findByProject("C--foo");
            expect(results.length).toBe(2);
            for (const f of results) {
                expect(f.projectEncoded).toBe("C--foo");
            }
        });
    });

    describe("searchContent()", () => {
        it("should find files matching FTS5 query", async () => {
            await repo.saveMany([
                makeMemoryFile({
                    filePath: "DECISIONS.md",
                    fileType: "decisions",
                    content: "Use JWT authentication for all API endpoints",
                    contentHash: "a".repeat(64),
                }),
                makeMemoryFile({
                    filePath: "LEARNINGS.md",
                    fileType: "learnings",
                    content: "SQLite FTS5 supports porter stemming",
                    contentHash: "b".repeat(64),
                }),
                makeMemoryFile({
                    filePath: "daily/2026-03-07.md",
                    fileType: "daily_log",
                    content: "Worked on database migrations today",
                    contentHash: "c".repeat(64),
                }),
            ]);

            const results = await repo.searchContent("authentication");
            expect(results.length).toBe(1);
            expect(results[0]!.filePath).toBe("DECISIONS.md");
        });

        it("should respect limit parameter", async () => {
            await repo.saveMany([
                makeMemoryFile({
                    filePath: "file1.md",
                    fileType: "decisions",
                    content: "authentication patterns for microservices",
                    contentHash: "a".repeat(64),
                }),
                makeMemoryFile({
                    filePath: "file2.md",
                    fileType: "learnings",
                    content: "authentication best practices learned",
                    contentHash: "b".repeat(64),
                }),
                makeMemoryFile({
                    filePath: "file3.md",
                    fileType: "daily_log",
                    content: "worked on authentication module",
                    contentHash: "c".repeat(64),
                }),
            ]);

            const results = await repo.searchContent("authentication", 2);
            expect(results.length).toBe(2);
        });

        it("should handle FTS5-hostile queries via sanitization", async () => {
            await repo.saveMany([
                makeMemoryFile({
                    filePath: "DECISIONS.md",
                    fileType: "decisions",
                    content: "SYNC-09 issue resolved with retry logic",
                    contentHash: "a".repeat(64),
                }),
            ]);

            // SYNC-09 contains a hyphen which is an FTS5 operator
            // sanitizeFtsQuery should strip it, allowing the query to succeed
            expect(() => repo.searchContent("SYNC-09")).not.toThrow();
        });

        it("should return empty array for empty sanitized query", async () => {
            const results = await repo.searchContent("---");
            expect(results).toEqual([]);
        });
    });
});
