/**
 * MemoryFileScanner Tests
 *
 * Tests file discovery, type classification, project extraction,
 * content hashing, and graceful handling of missing directories.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { installEnvOverrides, type EnvOverrides } from "../../../tests/helpers/env-overrides.js";
import { MemoryFileScanner } from "./memory-file-scanner.js";
import type { IMemoryFileScanner } from "../../domain/ports/sources.js";

describe("MemoryFileScanner", () => {
    let tempDir: string;
    let scanner: MemoryFileScanner;
    let env: EnvOverrides;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "memory-scanner-test-"));
        env = installEnvOverrides();
        env.set("MEMORY_HOME", tempDir);
        scanner = new MemoryFileScanner();
    });

    afterEach(async () => {
        env.cleanup();
        await rm(tempDir, { recursive: true, force: true });
    });

    it("should implement IMemoryFileScanner interface", () => {
        const _typeCheck: IMemoryFileScanner = scanner;
        expect(_typeCheck).toBeDefined();
    });

    describe("discoverFiles() with complete directory structure", () => {
        it("should discover all recognized .md files", async () => {
            // Create directory structure
            await mkdir(join(tempDir, "daily"), { recursive: true });
            await mkdir(join(tempDir, "projects", "C--Users-Destiny-Projects-kanbanflow"), { recursive: true });

            // Create files
            await writeFile(join(tempDir, "daily", "2026-03-07.md"), "Daily log content");
            await writeFile(join(tempDir, "DECISIONS.md"), "Global decisions");
            await writeFile(join(tempDir, "LEARNINGS.md"), "Global learnings");
            await writeFile(join(tempDir, "USER-PREFS.md"), "User preferences");
            await writeFile(
                join(tempDir, "projects", "C--Users-Destiny-Projects-kanbanflow", "DECISIONS.md"),
                "Project decisions"
            );

            const files = await scanner.discoverFiles();
            expect(files.length).toBe(5);
        });
    });

    describe("file type classification", () => {
        beforeEach(async () => {
            await mkdir(join(tempDir, "daily"), { recursive: true });
            await mkdir(join(tempDir, "projects", "C--encoded"), { recursive: true });
        });

        it("should classify daily/*.md as daily_log", async () => {
            await writeFile(join(tempDir, "daily", "2026-03-07.md"), "log");

            const files = await scanner.discoverFiles();
            const daily = files.find((f) => f.filePath === "daily/2026-03-07.md");
            expect(daily).toBeDefined();
            expect(daily!.fileType).toBe("daily_log");
        });

        it("should classify DECISIONS.md as decisions", async () => {
            await writeFile(join(tempDir, "DECISIONS.md"), "decisions");

            const files = await scanner.discoverFiles();
            const decisions = files.find((f) => f.filePath === "DECISIONS.md");
            expect(decisions).toBeDefined();
            expect(decisions!.fileType).toBe("decisions");
        });

        it("should classify LEARNINGS.md as learnings", async () => {
            await writeFile(join(tempDir, "LEARNINGS.md"), "learnings");

            const files = await scanner.discoverFiles();
            const learnings = files.find((f) => f.filePath === "LEARNINGS.md");
            expect(learnings).toBeDefined();
            expect(learnings!.fileType).toBe("learnings");
        });

        it("should classify USER-PREFS.md as user_prefs", async () => {
            await writeFile(join(tempDir, "USER-PREFS.md"), "prefs");

            const files = await scanner.discoverFiles();
            const prefs = files.find((f) => f.filePath === "USER-PREFS.md");
            expect(prefs).toBeDefined();
            expect(prefs!.fileType).toBe("user_prefs");
        });

        it("should classify projects/*/DECISIONS.md as decisions", async () => {
            await writeFile(join(tempDir, "projects", "C--encoded", "DECISIONS.md"), "proj decisions");

            const files = await scanner.discoverFiles();
            const projDecisions = files.find((f) => f.filePath === "projects/C--encoded/DECISIONS.md");
            expect(projDecisions).toBeDefined();
            expect(projDecisions!.fileType).toBe("decisions");
        });

        it("should classify projects/*/LEARNINGS.md as learnings", async () => {
            await writeFile(join(tempDir, "projects", "C--encoded", "LEARNINGS.md"), "proj learnings");

            const files = await scanner.discoverFiles();
            const projLearnings = files.find((f) => f.filePath === "projects/C--encoded/LEARNINGS.md");
            expect(projLearnings).toBeDefined();
            expect(projLearnings!.fileType).toBe("learnings");
        });
    });

    describe("project encoded extraction", () => {
        it("should extract projectEncoded from projects/ path", async () => {
            await mkdir(join(tempDir, "projects", "C--Users-Destiny-Projects-foo"), { recursive: true });
            await writeFile(
                join(tempDir, "projects", "C--Users-Destiny-Projects-foo", "DECISIONS.md"),
                "content"
            );

            const files = await scanner.discoverFiles();
            const projFile = files.find((f) =>
                f.filePath === "projects/C--Users-Destiny-Projects-foo/DECISIONS.md"
            );
            expect(projFile).toBeDefined();
            expect(projFile!.projectEncoded).toBe("C--Users-Destiny-Projects-foo");
        });

        it("should return undefined projectEncoded for root files", async () => {
            await writeFile(join(tempDir, "DECISIONS.md"), "content");

            const files = await scanner.discoverFiles();
            const rootFile = files.find((f) => f.filePath === "DECISIONS.md");
            expect(rootFile).toBeDefined();
            expect(rootFile!.projectEncoded).toBeUndefined();
        });

        it("should return undefined projectEncoded for daily logs", async () => {
            await mkdir(join(tempDir, "daily"), { recursive: true });
            await writeFile(join(tempDir, "daily", "2026-03-07.md"), "log");

            const files = await scanner.discoverFiles();
            const daily = files.find((f) => f.filePath === "daily/2026-03-07.md");
            expect(daily).toBeDefined();
            expect(daily!.projectEncoded).toBeUndefined();
        });
    });

    describe("content hash", () => {
        it("should compute correct SHA-256 hash", async () => {
            const content = "Known content for hashing test";
            await writeFile(join(tempDir, "DECISIONS.md"), content);

            const expectedHash = createHash("sha256").update(content, "utf8").digest("hex");

            const files = await scanner.discoverFiles();
            const file = files.find((f) => f.filePath === "DECISIONS.md");
            expect(file).toBeDefined();
            expect(file!.contentHash).toBe(expectedHash);
        });
    });

    describe("relative path", () => {
        it("should return paths relative to memory dir", async () => {
            await mkdir(join(tempDir, "daily"), { recursive: true });
            await writeFile(join(tempDir, "daily", "2026-03-07.md"), "log");
            await writeFile(join(tempDir, "DECISIONS.md"), "decisions");

            const files = await scanner.discoverFiles();
            const paths = files.map((f) => f.filePath);

            expect(paths).toContain("daily/2026-03-07.md");
            expect(paths).toContain("DECISIONS.md");

            // No absolute paths
            for (const p of paths) {
                expect(p.startsWith("/")).toBe(false);
                expect(p.startsWith("C:")).toBe(false);
            }
        });
    });

    describe("empty directory", () => {
        it("should return empty array for empty directory", async () => {
            const files = await scanner.discoverFiles();
            expect(files).toEqual([]);
        });
    });

    describe("nonexistent directory", () => {
        it("should return empty array without error", async () => {
            env.set("MEMORY_HOME", join(tempDir, "nonexistent"));
            const files = await scanner.discoverFiles();
            expect(files).toEqual([]);
        });
    });

    describe("non-md files", () => {
        it("should ignore non-.md files", async () => {
            await writeFile(join(tempDir, "DECISIONS.md"), "decisions");
            await writeFile(join(tempDir, "config.json"), '{"key": "value"}');
            await writeFile(join(tempDir, "notes.txt"), "some notes");

            const files = await scanner.discoverFiles();
            expect(files.length).toBe(1);
            expect(files[0]!.filePath).toBe("DECISIONS.md");
        });
    });

    describe("nested daily logs", () => {
        it("should classify all daily/*.md as daily_log", async () => {
            await mkdir(join(tempDir, "daily"), { recursive: true });
            await writeFile(join(tempDir, "daily", "2026-03-07.md"), "day 1");
            await writeFile(join(tempDir, "daily", "2026-03-08.md"), "day 2");

            const files = await scanner.discoverFiles();
            const dailyFiles = files.filter((f) => f.fileType === "daily_log");
            expect(dailyFiles.length).toBe(2);
        });
    });

    describe("unrecognized .md files", () => {
        it("should skip unrecognized .md files at root", async () => {
            await writeFile(join(tempDir, "PATTERNS.md"), "patterns");
            await writeFile(join(tempDir, "DECISIONS.md"), "decisions");

            const files = await scanner.discoverFiles();
            expect(files.length).toBe(1);
            expect(files[0]!.filePath).toBe("DECISIONS.md");
        });
    });

    describe("absolutePath", () => {
        it("should provide absolute path for reading", async () => {
            await writeFile(join(tempDir, "DECISIONS.md"), "content");

            const files = await scanner.discoverFiles();
            expect(files[0]!.absolutePath).toBe(join(tempDir, "DECISIONS.md"));
        });
    });

    describe("content", () => {
        it("should include full file content", async () => {
            const content = "Full file content with multiple words";
            await writeFile(join(tempDir, "DECISIONS.md"), content);

            const files = await scanner.discoverFiles();
            expect(files[0]!.content).toBe(content);
        });
    });
});
