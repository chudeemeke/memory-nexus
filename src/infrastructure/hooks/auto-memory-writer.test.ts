/**
 * AutoMemoryWriter Tests
 *
 * Tests for the AutoMemoryWriter infrastructure adapter that writes
 * context.md (complete overwrite) and updates MEMORY.md (marker-based merge).
 */

import { describe, expect, test, afterEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AutoMemoryWriter, mergeMemoryBlock } from "./auto-memory-writer.js";

const START_MARKER = "<!-- memory-cli:start -->";
const END_MARKER = "<!-- memory-cli:end -->";

describe("AutoMemoryWriter", () => {
    let testDir: string;
    let writer: AutoMemoryWriter;

    function createTestDir(): string {
        const dir = join(
            tmpdir(),
            `auto-memory-writer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        mkdirSync(dir, { recursive: true });
        return dir;
    }

    afterEach(() => {
        if (testDir && existsSync(testDir)) {
            try {
                rmSync(testDir, { recursive: true, force: true });
            } catch {
                // Best-effort cleanup on Windows
            }
        }
    });

    describe("writeContextFile", () => {
        test("writes content to context.md (complete overwrite)", async () => {
            testDir = createTestDir();
            writer = new AutoMemoryWriter();
            const content = "# Cross-Project Context\n\nRecent decisions and learnings.";

            await writer.writeContextFile(testDir, content);

            const result = readFileSync(join(testDir, "context.md"), "utf-8");
            expect(result).toBe(content);
        });

        test("creates directory recursively if it does not exist", async () => {
            testDir = createTestDir();
            writer = new AutoMemoryWriter();
            const nestedDir = join(testDir, "nested", "deep", "dir");
            const content = "test content";

            await writer.writeContextFile(nestedDir, content);

            expect(existsSync(join(nestedDir, "context.md"))).toBe(true);
            const result = readFileSync(join(nestedDir, "context.md"), "utf-8");
            expect(result).toBe(content);
        });

        test("overwrites existing context.md with new content", async () => {
            testDir = createTestDir();
            writer = new AutoMemoryWriter();
            writeFileSync(join(testDir, "context.md"), "old content", "utf-8");

            const newContent = "new content replacing old";
            await writer.writeContextFile(testDir, newContent);

            const result = readFileSync(join(testDir, "context.md"), "utf-8");
            expect(result).toBe(newContent);
        });
    });

    describe("updateMemoryBlock", () => {
        test("creates MEMORY.md with markers when file does not exist", async () => {
            testDir = createTestDir();
            writer = new AutoMemoryWriter();
            const blockContent = "## Summary\n\n3 decisions, 2 learnings";

            await writer.updateMemoryBlock(testDir, blockContent);

            const result = readFileSync(join(testDir, "MEMORY.md"), "utf-8");
            expect(result).toContain(START_MARKER);
            expect(result).toContain(END_MARKER);
            expect(result).toContain(blockContent);
        });

        test("appends block at end with markers when file has no markers", async () => {
            testDir = createTestDir();
            writer = new AutoMemoryWriter();
            const existingContent = "# My Notes\n\nSome user content.\n";
            writeFileSync(join(testDir, "MEMORY.md"), existingContent, "utf-8");

            const blockContent = "## CLI Summary\n\nAuto-generated.";
            await writer.updateMemoryBlock(testDir, blockContent);

            const result = readFileSync(join(testDir, "MEMORY.md"), "utf-8");
            // User content preserved
            expect(result).toContain("# My Notes");
            expect(result).toContain("Some user content.");
            // Block appended with markers
            expect(result).toContain(START_MARKER);
            expect(result).toContain(blockContent);
            expect(result).toContain(END_MARKER);
        });

        test("replaces content between markers preserving surrounding content", async () => {
            testDir = createTestDir();
            writer = new AutoMemoryWriter();
            const existingContent = [
                "# Project Notes",
                "",
                "Important context here.",
                "",
                START_MARKER,
                "old auto-generated content",
                END_MARKER,
                "",
                "## User Section",
                "",
                "User notes below markers.",
            ].join("\n");
            writeFileSync(join(testDir, "MEMORY.md"), existingContent, "utf-8");

            const newBlock = "new auto-generated content v2";
            await writer.updateMemoryBlock(testDir, newBlock);

            const result = readFileSync(join(testDir, "MEMORY.md"), "utf-8");
            // Content before markers preserved
            expect(result).toContain("# Project Notes");
            expect(result).toContain("Important context here.");
            // Content after markers preserved
            expect(result).toContain("## User Section");
            expect(result).toContain("User notes below markers.");
            // Old content replaced
            expect(result).not.toContain("old auto-generated content");
            // New content present
            expect(result).toContain(newBlock);
            // Markers present
            expect(result).toContain(START_MARKER);
            expect(result).toContain(END_MARKER);
        });

        test("content outside markers is untouched during merge", async () => {
            testDir = createTestDir();
            writer = new AutoMemoryWriter();
            const beforeMarkers = "# Header\n\nBefore content with special chars: @#$%\n\n";
            const afterMarkers = "\n\n## Footer\n\nAfter content: tables, lists, etc.\n";
            const existingContent = `${beforeMarkers}${START_MARKER}\nold block\n${END_MARKER}${afterMarkers}`;
            writeFileSync(join(testDir, "MEMORY.md"), existingContent, "utf-8");

            await writer.updateMemoryBlock(testDir, "replacement block");

            const result = readFileSync(join(testDir, "MEMORY.md"), "utf-8");
            expect(result).toContain(beforeMarkers);
            expect(result).toContain(afterMarkers);
            expect(result).not.toContain("old block");
            expect(result).toContain("replacement block");
        });

        test("handles empty file by appending block with markers", async () => {
            testDir = createTestDir();
            writer = new AutoMemoryWriter();
            writeFileSync(join(testDir, "MEMORY.md"), "", "utf-8");

            const blockContent = "## Auto Context";
            await writer.updateMemoryBlock(testDir, blockContent);

            const result = readFileSync(join(testDir, "MEMORY.md"), "utf-8");
            expect(result).toContain(START_MARKER);
            expect(result).toContain(blockContent);
            expect(result).toContain(END_MARKER);
        });

        test("adds separator before appending when file ends without trailing newline", async () => {
            testDir = createTestDir();
            writer = new AutoMemoryWriter();
            writeFileSync(join(testDir, "MEMORY.md"), "content without newline at end", "utf-8");

            await writer.updateMemoryBlock(testDir, "block content");

            const result = readFileSync(join(testDir, "MEMORY.md"), "utf-8");
            // Should have separator between existing content and markers
            const markerIndex = result.indexOf(START_MARKER);
            const beforeMarker = result.substring(0, markerIndex);
            expect(beforeMarker).toContain("content without newline at end");
            // Should have at least one newline before the marker
            expect(beforeMarker.endsWith("\n")).toBe(true);
        });

        test("creates directory recursively if it does not exist", async () => {
            testDir = createTestDir();
            writer = new AutoMemoryWriter();
            const nestedDir = join(testDir, "a", "b", "c");

            await writer.updateMemoryBlock(nestedDir, "block content");

            expect(existsSync(join(nestedDir, "MEMORY.md"))).toBe(true);
        });
    });
});

describe("mergeMemoryBlock (pure function)", () => {
    test("no markers in existing content: appends block at end", () => {
        const existing = "# Notes\n\nUser content.\n";
        const result = mergeMemoryBlock(existing, "auto content");

        expect(result).toContain("# Notes");
        expect(result).toContain("User content.");
        expect(result).toContain(START_MARKER);
        expect(result).toContain("auto content");
        expect(result).toContain(END_MARKER);
    });

    test("markers present: replaces content between them", () => {
        const existing = `before\n${START_MARKER}\nold\n${END_MARKER}\nafter\n`;
        const result = mergeMemoryBlock(existing, "new");

        expect(result).toContain("before");
        expect(result).toContain("after");
        expect(result).not.toContain("old");
        expect(result).toContain("new");
    });

    test("empty existing: creates block with markers", () => {
        const result = mergeMemoryBlock("", "content");

        expect(result).toBe(`${START_MARKER}\ncontent\n${END_MARKER}\n`);
    });

    test("preserves exact content before and after markers", () => {
        const before = "# Title\n\nParagraph one.\n\n";
        const after = "\n## Section Two\n\nParagraph two.\n";
        const existing = `${before}${START_MARKER}\nold block\n${END_MARKER}${after}`;

        const result = mergeMemoryBlock(existing, "new block");

        expect(result.startsWith(before)).toBe(true);
        expect(result).toContain(`${START_MARKER}\nnew block\n${END_MARKER}`);
        expect(result.endsWith(after)).toBe(true);
    });

    test("handles content with no trailing newline", () => {
        const existing = "content without newline";
        const result = mergeMemoryBlock(existing, "block");

        const markerIndex = result.indexOf(START_MARKER);
        const beforeMarker = result.substring(0, markerIndex);
        expect(beforeMarker.endsWith("\n")).toBe(true);
    });

    test("handles multiline block content", () => {
        const blockContent = "## Decisions\n\n- Decision 1\n- Decision 2\n\n## Learnings\n\n- Learning 1";
        const result = mergeMemoryBlock("", blockContent);

        expect(result).toContain(blockContent);
        expect(result).toContain(START_MARKER);
        expect(result).toContain(END_MARKER);
    });
});
