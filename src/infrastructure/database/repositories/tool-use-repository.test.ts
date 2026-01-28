/**
 * Tests for SqliteToolUseRepository
 *
 * Covers:
 * - CRUD operations (save, findById, findBySession)
 * - INSERT OR IGNORE duplicate handling
 * - JSON serialization of input objects
 * - Status constraint enforcement
 * - Batch insert with progress callback
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteToolUseRepository } from "./tool-use-repository.js";
import { ToolUse } from "../../../domain/entities/tool-use.js";
import { createSchema } from "../schema.js";

describe("SqliteToolUseRepository", () => {
    let db: Database;
    let repository: SqliteToolUseRepository;
    const testSessionId = "session-001";

    beforeEach(() => {
        db = new Database(":memory:");
        db.exec("PRAGMA foreign_keys = OFF;"); // Disable for isolated testing
        createSchema(db);
        repository = new SqliteToolUseRepository(db);
    });

    afterEach(() => {
        db.close();
    });

    /**
     * Helper to create a ToolUse entity for testing
     */
    function createToolUse(overrides?: Partial<{
        id: string;
        name: string;
        input: Record<string, unknown>;
        timestamp: Date;
        status: "pending" | "success" | "error";
        result: string;
    }>): ToolUse {
        return ToolUse.create({
            id: overrides?.id ?? "tool-001",
            name: overrides?.name ?? "Read",
            input: overrides?.input ?? { file_path: "/test/file.ts" },
            timestamp: overrides?.timestamp ?? new Date("2026-01-15T10:30:00Z"),
            status: overrides?.status ?? "success",
            result: overrides?.result,
        });
    }

    describe("save and findById", () => {
        it("should save and retrieve a tool use by ID", async () => {
            const toolUse = createToolUse({
                id: "tool-123",
                name: "Bash",
                input: { command: "ls -la" },
                status: "success",
                result: "file1.ts\nfile2.ts",
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-123");

            expect(found).not.toBeNull();
            expect(found!.id).toBe("tool-123");
            expect(found!.name).toBe("Bash");
            expect(found!.input).toEqual({ command: "ls -la" });
            expect(found!.status).toBe("success");
            expect(found!.result).toBe("file1.ts\nfile2.ts");
        });

        it("should return null for non-existent ID", async () => {
            const found = await repository.findById("non-existent");
            expect(found).toBeNull();
        });

        it("should preserve timestamp precision", async () => {
            const timestamp = new Date("2026-01-15T10:30:45.123Z");
            const toolUse = createToolUse({ id: "tool-time", timestamp });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-time");

            expect(found!.timestamp.toISOString()).toBe(timestamp.toISOString());
        });

        it("should handle pending status", async () => {
            const toolUse = createToolUse({
                id: "tool-pending",
                status: "pending",
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-pending");

            expect(found!.status).toBe("pending");
            expect(found!.result).toBeUndefined();
        });

        it("should handle error status with error message", async () => {
            const toolUse = createToolUse({
                id: "tool-error",
                status: "error",
                result: "File not found",
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-error");

            expect(found!.status).toBe("error");
            expect(found!.result).toBe("File not found");
        });
    });

    describe("JSON serialization of input", () => {
        it("should serialize complex nested input objects", async () => {
            const complexInput = {
                file_path: "/test/path.ts",
                options: {
                    recursive: true,
                    ignore: ["node_modules", "dist"],
                },
                metadata: {
                    author: "test",
                    tags: ["a", "b", "c"],
                },
            };
            const toolUse = createToolUse({
                id: "tool-complex",
                input: complexInput,
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-complex");

            expect(found!.input).toEqual(complexInput);
        });

        it("should handle empty input object", async () => {
            const toolUse = createToolUse({
                id: "tool-empty",
                input: {},
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-empty");

            expect(found!.input).toEqual({});
        });

        it("should preserve number types in input", async () => {
            const toolUse = createToolUse({
                id: "tool-numbers",
                input: { count: 42, ratio: 3.14, negative: -100 },
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-numbers");

            expect(found!.input).toEqual({ count: 42, ratio: 3.14, negative: -100 });
        });

        it("should preserve boolean types in input", async () => {
            const toolUse = createToolUse({
                id: "tool-booleans",
                input: { enabled: true, disabled: false },
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-booleans");

            expect(found!.input).toEqual({ enabled: true, disabled: false });
        });

        it("should handle null values in input", async () => {
            const toolUse = createToolUse({
                id: "tool-nulls",
                input: { value: null, other: "defined" } as Record<string, unknown>,
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-nulls");

            expect(found!.input).toEqual({ value: null, other: "defined" });
        });
    });

    describe("findBySession", () => {
        it("should return tool uses for a session in timestamp order", async () => {
            const toolUses = [
                createToolUse({
                    id: "tool-3",
                    name: "Write",
                    timestamp: new Date("2026-01-15T10:32:00Z"),
                }),
                createToolUse({
                    id: "tool-1",
                    name: "Read",
                    timestamp: new Date("2026-01-15T10:30:00Z"),
                }),
                createToolUse({
                    id: "tool-2",
                    name: "Bash",
                    timestamp: new Date("2026-01-15T10:31:00Z"),
                }),
            ];

            for (const toolUse of toolUses) {
                await repository.save(toolUse, testSessionId);
            }

            const found = await repository.findBySession(testSessionId);

            expect(found).toHaveLength(3);
            expect(found[0].id).toBe("tool-1"); // Earliest
            expect(found[1].id).toBe("tool-2");
            expect(found[2].id).toBe("tool-3"); // Latest
        });

        it("should return empty array for session with no tool uses", async () => {
            const found = await repository.findBySession("empty-session");
            expect(found).toEqual([]);
        });

        it("should only return tool uses for the specified session", async () => {
            await repository.save(createToolUse({ id: "tool-a" }), "session-a");
            await repository.save(createToolUse({ id: "tool-b" }), "session-b");
            await repository.save(createToolUse({ id: "tool-c" }), "session-a");

            const sessionA = await repository.findBySession("session-a");
            const sessionB = await repository.findBySession("session-b");

            expect(sessionA).toHaveLength(2);
            expect(sessionB).toHaveLength(1);
            expect(sessionA.map((t) => t.id).sort()).toEqual(["tool-a", "tool-c"]);
            expect(sessionB[0].id).toBe("tool-b");
        });
    });

    describe("INSERT OR IGNORE duplicate handling", () => {
        it("should ignore duplicate inserts without error", async () => {
            const toolUse = createToolUse({ id: "tool-dup" });

            await repository.save(toolUse, testSessionId);
            await repository.save(toolUse, testSessionId); // Should not throw

            const found = await repository.findBySession(testSessionId);
            expect(found).toHaveLength(1);
        });

        it("should preserve original data on duplicate insert", async () => {
            const original = createToolUse({
                id: "tool-orig",
                name: "Original",
                status: "success",
            });
            const duplicate = createToolUse({
                id: "tool-orig",
                name: "Duplicate",
                status: "error",
            });

            await repository.save(original, testSessionId);
            await repository.save(duplicate, testSessionId);

            const found = await repository.findById("tool-orig");
            expect(found!.name).toBe("Original"); // Original preserved
            expect(found!.status).toBe("success");
        });
    });

    describe("status constraint enforcement", () => {
        it("should allow valid status values", async () => {
            const statuses: Array<"pending" | "success" | "error"> = [
                "pending",
                "success",
                "error",
            ];

            for (const [index, status] of statuses.entries()) {
                const toolUse = createToolUse({
                    id: `tool-status-${index}`,
                    status,
                });
                await repository.save(toolUse, testSessionId);
                const found = await repository.findById(`tool-status-${index}`);
                expect(found!.status).toBe(status);
            }
        });

        it("should reject invalid status via entity creation", () => {
            expect(() =>
                ToolUse.create({
                    id: "tool-bad",
                    name: "Test",
                    input: {},
                    timestamp: new Date(),
                    status: "invalid" as "pending",
                })
            ).toThrow("Invalid tool use status");
        });
    });

    describe("saveMany batch insert", () => {
        it("should insert multiple tool uses in a single batch", async () => {
            const toolUses = Array.from({ length: 10 }, (_, i) =>
                createToolUse({
                    id: `tool-batch-${i}`,
                    timestamp: new Date(Date.now() + i * 1000),
                })
            );

            const result = await repository.saveMany(
                toolUses.map((toolUse) => ({ toolUse, sessionId: testSessionId }))
            );

            expect(result.inserted).toBe(10);
            expect(result.skipped).toBe(0);
            expect(result.errors).toHaveLength(0);

            const found = await repository.findBySession(testSessionId);
            expect(found).toHaveLength(10);
        });

        it("should process 50+ tool uses across multiple batches", async () => {
            const toolUses = Array.from({ length: 150 }, (_, i) =>
                createToolUse({
                    id: `tool-multi-${i}`,
                    timestamp: new Date(Date.now() + i * 100),
                })
            );

            const result = await repository.saveMany(
                toolUses.map((toolUse) => ({ toolUse, sessionId: testSessionId }))
            );

            expect(result.inserted).toBe(150);
            expect(result.skipped).toBe(0);

            const found = await repository.findBySession(testSessionId);
            expect(found).toHaveLength(150);
        });

        it("should call progress callback after each batch", async () => {
            const toolUses = Array.from({ length: 250 }, (_, i) =>
                createToolUse({
                    id: `tool-progress-${i}`,
                    timestamp: new Date(Date.now() + i * 100),
                })
            );

            const progressCalls: Array<{ inserted: number; total: number }> = [];

            await repository.saveMany(
                toolUses.map((toolUse) => ({ toolUse, sessionId: testSessionId })),
                {
                    onProgress: (progress) => {
                        progressCalls.push({ ...progress });
                    },
                }
            );

            // Should have 3 batches: 100, 100, 50
            expect(progressCalls).toHaveLength(3);
            expect(progressCalls[0].total).toBe(250);
            expect(progressCalls[1].total).toBe(250);
            expect(progressCalls[2].total).toBe(250);
            expect(progressCalls[2].inserted).toBe(250);
        });

        it("should handle duplicates in batch and report skipped count", async () => {
            // Pre-insert some tool uses
            const existing = Array.from({ length: 5 }, (_, i) =>
                createToolUse({
                    id: `tool-existing-${i}`,
                    timestamp: new Date(Date.now() + i * 1000),
                })
            );
            for (const toolUse of existing) {
                await repository.save(toolUse, testSessionId);
            }

            // Try to insert overlapping set
            const batch = [
                ...existing, // 5 duplicates
                ...Array.from({ length: 5 }, (_, i) =>
                    createToolUse({
                        id: `tool-new-${i}`,
                        timestamp: new Date(Date.now() + (i + 10) * 1000),
                    })
                ), // 5 new
            ];

            const result = await repository.saveMany(
                batch.map((toolUse) => ({ toolUse, sessionId: testSessionId }))
            );

            expect(result.inserted).toBe(5);
            expect(result.skipped).toBe(5);
            expect(result.errors).toHaveLength(0);
        });

        it("should complete 50+ tool uses efficiently", async () => {
            const toolUses = Array.from({ length: 100 }, (_, i) =>
                createToolUse({
                    id: `tool-perf-${i}`,
                    name: "TestTool",
                    input: { index: i, data: "x".repeat(100) },
                    timestamp: new Date(Date.now() + i * 10),
                })
            );

            const startTime = performance.now();
            const result = await repository.saveMany(
                toolUses.map((toolUse) => ({ toolUse, sessionId: testSessionId }))
            );
            const elapsed = performance.now() - startTime;

            expect(result.inserted).toBe(100);
            expect(elapsed).toBeLessThan(1000); // Should be well under 1 second
        });

        it("should handle empty array gracefully", async () => {
            const result = await repository.saveMany([]);

            expect(result.inserted).toBe(0);
            expect(result.skipped).toBe(0);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("tool use types", () => {
        it("should handle Read tool use correctly", async () => {
            const toolUse = createToolUse({
                id: "tool-read",
                name: "Read",
                input: { file_path: "/src/index.ts" },
                status: "success",
                result: "const x = 1;",
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-read");

            expect(found!.name).toBe("Read");
            expect(found!.input).toEqual({ file_path: "/src/index.ts" });
        });

        it("should handle Bash tool use correctly", async () => {
            const toolUse = createToolUse({
                id: "tool-bash",
                name: "Bash",
                input: { command: "npm test", timeout: 60000 },
                status: "success",
                result: "All tests passed",
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-bash");

            expect(found!.name).toBe("Bash");
            expect(found!.input).toEqual({ command: "npm test", timeout: 60000 });
        });

        it("should handle Edit tool use correctly", async () => {
            const toolUse = createToolUse({
                id: "tool-edit",
                name: "Edit",
                input: {
                    file_path: "/src/file.ts",
                    old_string: "const x = 1;",
                    new_string: "const x = 2;",
                },
                status: "success",
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-edit");

            expect(found!.name).toBe("Edit");
            expect(found!.input).toEqual({
                file_path: "/src/file.ts",
                old_string: "const x = 1;",
                new_string: "const x = 2;",
            });
        });

        it("should handle Write tool use correctly", async () => {
            const toolUse = createToolUse({
                id: "tool-write",
                name: "Write",
                input: {
                    file_path: "/src/new-file.ts",
                    content: "export const greeting = 'Hello';",
                },
                status: "success",
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-write");

            expect(found!.name).toBe("Write");
            expect(found!.input.content).toBe("export const greeting = 'Hello';");
        });
    });

    describe("edge cases", () => {
        it("should handle very long result strings", async () => {
            const longResult = "x".repeat(100000);
            const toolUse = createToolUse({
                id: "tool-long",
                status: "success",
                result: longResult,
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-long");

            expect(found!.result).toBe(longResult);
        });

        it("should handle special characters in input", async () => {
            const toolUse = createToolUse({
                id: "tool-special",
                input: {
                    path: "/path/with spaces/and'quotes",
                    query: 'SELECT * FROM "table"',
                    unicode: "Hello ",
                },
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-special");

            expect(found!.input.path).toBe("/path/with spaces/and'quotes");
            expect(found!.input.query).toBe('SELECT * FROM "table"');
            expect(found!.input.unicode).toBe("Hello ");
        });

        it("should handle array values in input", async () => {
            const toolUse = createToolUse({
                id: "tool-array",
                input: {
                    files: ["a.ts", "b.ts", "c.ts"],
                    numbers: [1, 2, 3],
                },
            });

            await repository.save(toolUse, testSessionId);
            const found = await repository.findById("tool-array");

            expect(found!.input.files).toEqual(["a.ts", "b.ts", "c.ts"]);
            expect(found!.input.numbers).toEqual([1, 2, 3]);
        });
    });
});
