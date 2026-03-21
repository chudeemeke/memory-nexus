/**
 * Friction CLI Command Tests
 *
 * Tests for --tool flag, auto-ingest, seen/unseen indicators,
 * and markReviewed integration in friction CLI commands.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { FrictionEntry } from "../../../../src/domain/entities/friction-entry.js";
import type { FrictionStats, FrictionPattern } from "../../../../src/domain/ports/repositories.js";

// We test executeFrictionCommand which creates its own service internally.
// To test the wiring, we mock the infrastructure imports and intercept service calls.
// Alternative: test via the actual DB (integration-style).

import {
    initializeDatabase,
    closeDatabase,
    getDefaultDbPath,
    SqliteFrictionRepository,
} from "../../../../src/infrastructure/database/index.js";

import {
    executeFrictionCommand,
    type FrictionExecuteOptions,
} from "../../../../src/presentation/cli/commands/friction.js";

// Capture console output
let capturedStdout: string[] = [];
let capturedStderr: string[] = [];
const originalLog = console.log;
const originalError = console.error;
const originalStderrWrite = process.stderr.write.bind(process.stderr);

function setupCapture(): void {
    capturedStdout = [];
    capturedStderr = [];
    console.log = (...args: unknown[]) => {
        capturedStdout.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
        capturedStderr.push(args.map(String).join(" "));
    };
    process.stderr.write = (chunk: string | Uint8Array): boolean => {
        capturedStderr.push(chunk.toString());
        return true;
    };
}

function teardownCapture(): void {
    console.log = originalLog;
    console.error = originalError;
    process.stderr.write = originalStderrWrite;
}

function getStdout(): string {
    return capturedStdout.join("\n");
}

function getStderr(): string {
    return capturedStderr.join("\n");
}

// Integration tests using real database
describe("friction CLI commands", () => {
    let db: ReturnType<typeof initializeDatabase>["db"];
    let dbPath: string;

    beforeEach(() => {
        const tmp = require("node:os").tmpdir();
        const fs = require("node:fs");
        const path = require("node:path");
        dbPath = path.join(fs.mkdtempSync(path.join(tmp, "friction-cli-")), "test.db");
        const result = initializeDatabase({ path: dbPath });
        db = result.db;
        closeDatabase(db);
        setupCapture();
    });

    afterEach(() => {
        teardownCapture();
    });

    describe("log subcommand --tool flag", () => {
        it("passes tool to service when --tool provided", async () => {
            // We need to override getDefaultDbPath to use our test DB
            // Since executeFrictionCommand calls getDefaultDbPath internally,
            // we use spyOn to redirect it
            const dbModule = await import("../../../../src/infrastructure/database/index.js");
            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);

            const result = await executeFrictionCommand({
                action: "log",
                description: "test friction",
                severity: "high",
                category: "cli",
                tool: "aidev",
                json: true,
            });

            expect(result.exitCode).toBe(0);
            const output = JSON.parse(getStdout());
            expect(output.tool).toBe("aidev");

            spy.mockRestore();
        });
    });

    describe("list subcommand --tool flag", () => {
        it("filters by tool when --tool provided", async () => {
            const dbModule = await import("../../../../src/infrastructure/database/index.js");
            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);

            // Log entries with different tools
            await executeFrictionCommand({
                action: "log",
                description: "aidev friction",
                tool: "aidev",
                json: true,
            });
            capturedStdout = [];

            await executeFrictionCommand({
                action: "log",
                description: "memory friction",
                tool: "memory",
                json: true,
            });
            capturedStdout = [];

            // List filtered by tool
            const result = await executeFrictionCommand({
                action: "list",
                tool: "aidev",
                json: true,
            });

            expect(result.exitCode).toBe(0);
            const entries = JSON.parse(getStdout());
            expect(entries).toHaveLength(1);
            expect(entries[0].description).toBe("aidev friction");

            spy.mockRestore();
        });

        it("calls markReviewed when --tool provided", async () => {
            const dbModule = await import("../../../../src/infrastructure/database/index.js");
            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);

            // Log an entry
            await executeFrictionCommand({
                action: "log",
                description: "test",
                tool: "aidev",
            });
            capturedStdout = [];

            // List with tool -- should mark reviewed
            await executeFrictionCommand({
                action: "list",
                tool: "aidev",
            });

            // List again -- entries should no longer be "new"
            capturedStdout = [];
            await executeFrictionCommand({
                action: "list",
                tool: "aidev",
                json: true,
            });

            const entries = JSON.parse(getStdout());
            // After markReviewed, lastReviewedAt should be set
            expect(entries[0].lastReviewedAt).not.toBeNull();

            spy.mockRestore();
        });

        it("does NOT call markReviewed when --tool not provided", async () => {
            const dbModule = await import("../../../../src/infrastructure/database/index.js");
            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);

            await executeFrictionCommand({
                action: "log",
                description: "test",
                tool: "aidev",
            });
            capturedStdout = [];

            // List without tool
            await executeFrictionCommand({
                action: "list",
                json: true,
            });

            const entries = JSON.parse(getStdout());
            // Without --tool, markReviewed not called, lastReviewedAt stays null
            expect(entries[0].lastReviewedAt).toBeNull();

            spy.mockRestore();
        });
    });

    describe("list NEW indicator", () => {
        it("shows NEW for unreviewed entries in text output", async () => {
            const dbModule = await import("../../../../src/infrastructure/database/index.js");
            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);

            await executeFrictionCommand({
                action: "log",
                description: "new friction item",
                tool: "aidev",
            });
            capturedStdout = [];

            await executeFrictionCommand({
                action: "list",
                tool: "aidev",
            });

            const output = getStdout();
            expect(output).toContain("NEW");

            spy.mockRestore();
        });

        it("shows summary with new count", async () => {
            const dbModule = await import("../../../../src/infrastructure/database/index.js");
            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);

            // Log 3 entries
            await executeFrictionCommand({ action: "log", description: "item 1", tool: "aidev", severity: "high" });
            await executeFrictionCommand({ action: "log", description: "item 2", tool: "aidev", severity: "medium" });
            await executeFrictionCommand({ action: "log", description: "item 3", tool: "aidev", severity: "medium" });
            capturedStdout = [];

            await executeFrictionCommand({
                action: "list",
                tool: "aidev",
            });

            const output = getStdout();
            expect(output).toContain("3 open");
            expect(output).toContain("new since last review");

            spy.mockRestore();
        });
    });

    describe("dashboard --tool flag", () => {
        it("passes tool filter to dashboard", async () => {
            const dbModule = await import("../../../../src/infrastructure/database/index.js");
            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);

            await executeFrictionCommand({
                action: "log",
                description: "aidev item",
                tool: "aidev",
            });
            capturedStdout = [];

            const result = await executeFrictionCommand({
                action: "dashboard",
                tool: "aidev",
                json: true,
            });

            expect(result.exitCode).toBe(0);
            const data = JSON.parse(getStdout());
            expect(data.stats).toBeDefined();

            spy.mockRestore();
        });
    });

    describe("auto-ingest", () => {
        it("ingests friction.jsonl before command execution", async () => {
            const fs = require("node:fs");
            const path = require("node:path");
            const os = require("node:os");

            const dbModule = await import("../../../../src/infrastructure/database/index.js");
            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);

            // Create a friction.jsonl file
            const fallbackPath = path.join(os.homedir(), ".claude", "friction.jsonl");
            const fallbackDir = path.dirname(fallbackPath);
            // Save original file if exists
            let originalContent: string | null = null;
            if (fs.existsSync(fallbackPath)) {
                originalContent = fs.readFileSync(fallbackPath, "utf-8");
            }

            fs.mkdirSync(fallbackDir, { recursive: true });
            fs.writeFileSync(fallbackPath, '{"description":"from fallback","tool":"gsd","severity":"low","category":"cli"}\n');

            try {
                // Any friction command should trigger ingest
                await executeFrictionCommand({
                    action: "list",
                    json: true,
                });

                const entries = JSON.parse(getStdout());
                const fallbackEntry = entries.find((e: { description: string }) => e.description === "from fallback");
                expect(fallbackEntry).toBeDefined();

                // File should be deleted after ingest
                expect(fs.existsSync(fallbackPath)).toBe(false);
            } finally {
                // Restore original file if existed
                if (originalContent !== null) {
                    fs.writeFileSync(fallbackPath, originalContent);
                }
                spy.mockRestore();
            }
        });
    });
});
