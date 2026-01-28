/**
 * FileSystemSessionSource Tests
 *
 * Tests for Claude Code session file discovery and retrieval.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileSystemSessionSource } from "./session-source.js";

describe("FileSystemSessionSource", () => {
    let testDir: string;
    let projectsDir: string;

    beforeEach(() => {
        // Create unique temp directory for each test
        testDir = join(tmpdir(), `session-source-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        projectsDir = join(testDir, "projects");
        mkdirSync(projectsDir, { recursive: true });
    });

    afterEach(() => {
        // Clean up test directory
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe("constructor", () => {
        test("uses default path when no options provided", () => {
            const source = new FileSystemSessionSource();
            // We can't easily test the private path, but we can verify it doesn't throw
            expect(source).toBeDefined();
        });

        test("uses custom path when provided", () => {
            const customDir = join(testDir, "custom-claude");
            mkdirSync(customDir, { recursive: true });
            const source = new FileSystemSessionSource({ claudeDir: customDir });
            expect(source).toBeDefined();
        });
    });

    describe("discoverSessions", () => {
        test("returns empty array when directory does not exist", async () => {
            const nonExistentDir = join(testDir, "non-existent", "projects");
            const source = new FileSystemSessionSource({ claudeDir: nonExistentDir });
            const sessions = await source.discoverSessions();
            expect(sessions).toEqual([]);
        });

        test("returns empty array when projects directory is empty", async () => {
            const source = new FileSystemSessionSource({ claudeDir: projectsDir });
            const sessions = await source.discoverSessions();
            expect(sessions).toEqual([]);
        });

        test("finds single session file", async () => {
            // Create encoded project directory and session file
            const encodedPath = "C--Users-Destiny-Projects-test-project";
            const projectDir = join(projectsDir, encodedPath);
            mkdirSync(projectDir, { recursive: true });

            const sessionId = "550e8400-e29b-41d4-a716-446655440000";
            const sessionFile = join(projectDir, `${sessionId}.jsonl`);
            writeFileSync(sessionFile, '{"type":"test"}\n');

            const source = new FileSystemSessionSource({ claudeDir: projectsDir });
            const sessions = await source.discoverSessions();

            expect(sessions).toHaveLength(1);
            expect(sessions[0]?.id).toBe(sessionId);
            expect(sessions[0]?.path).toBe(sessionFile);
        });

        test("finds multiple session files across projects", async () => {
            // Create first project
            const project1 = join(projectsDir, "C--Users-Destiny-Projects-project1");
            mkdirSync(project1, { recursive: true });
            const session1 = "11111111-1111-1111-1111-111111111111";
            writeFileSync(join(project1, `${session1}.jsonl`), '{"type":"test"}\n');

            // Create second project
            const project2 = join(projectsDir, "C--Users-Destiny-Projects-project2");
            mkdirSync(project2, { recursive: true });
            const session2 = "22222222-2222-2222-2222-222222222222";
            const session3 = "33333333-3333-3333-3333-333333333333";
            writeFileSync(join(project2, `${session2}.jsonl`), '{"type":"test"}\n');
            writeFileSync(join(project2, `${session3}.jsonl`), '{"type":"test"}\n');

            const source = new FileSystemSessionSource({ claudeDir: projectsDir });
            const sessions = await source.discoverSessions();

            expect(sessions).toHaveLength(3);
            const sessionIds = sessions.map((s) => s.id).sort();
            expect(sessionIds).toEqual([session1, session2, session3].sort());
        });

        test("includes subagent session files", async () => {
            // Create project directory
            const project = join(projectsDir, "C--Users-Destiny-Projects-myproject");
            mkdirSync(project, { recursive: true });

            // Create main session
            const mainSession = "main-main-main-main-mainmainmain";
            const mainSessionFile = join(project, `${mainSession}.jsonl`);
            writeFileSync(mainSessionFile, '{"type":"test"}\n');

            // Create session directory with subagents
            const sessionDir = join(project, mainSession);
            const subagentsDir = join(sessionDir, "subagents");
            mkdirSync(subagentsDir, { recursive: true });

            const subagentSession = "sub1-sub1-sub1-sub1-sub1sub1sub1";
            writeFileSync(join(subagentsDir, `${subagentSession}.jsonl`), '{"type":"subagent"}\n');

            const source = new FileSystemSessionSource({ claudeDir: projectsDir });
            const sessions = await source.discoverSessions();

            expect(sessions.length).toBeGreaterThanOrEqual(2);
            const sessionIds = sessions.map((s) => s.id);
            expect(sessionIds).toContain(mainSession);
            expect(sessionIds).toContain(subagentSession);
        });

        test("populates all SessionFileInfo fields correctly", async () => {
            // Note: Project names with dashes are lossy when decoded
            // (dashes become path separators). Use a name without dashes.
            const encodedPath = "C--Users-Destiny-Projects-myproject";
            const projectDir = join(projectsDir, encodedPath);
            mkdirSync(projectDir, { recursive: true });

            const sessionId = "abc12345-e29b-41d4-a716-446655440000";
            const sessionFile = join(projectDir, `${sessionId}.jsonl`);
            const content = '{"type":"system"}\n{"type":"user"}\n';
            writeFileSync(sessionFile, content);

            const source = new FileSystemSessionSource({ claudeDir: projectsDir });
            const sessions = await source.discoverSessions();

            expect(sessions).toHaveLength(1);
            const session = sessions[0];
            expect(session).toBeDefined();

            // Check all fields
            expect(session!.id).toBe(sessionId);
            expect(session!.path).toBe(sessionFile);
            expect(session!.projectPath.encoded).toBe(encodedPath);
            expect(session!.projectPath.decoded).toBe("C:\\Users\\Destiny\\Projects\\myproject");
            expect(session!.modifiedTime).toBeInstanceOf(Date);
            expect(session!.size).toBe(Buffer.byteLength(content));
        });

        test("handles directory read errors gracefully", async () => {
            // Create a file where a directory is expected
            const fakeDirPath = join(projectsDir, "not-a-directory");
            writeFileSync(fakeDirPath, "this is a file, not a directory");

            const source = new FileSystemSessionSource({ claudeDir: projectsDir });
            // Should not throw, just skip problematic entries
            const sessions = await source.discoverSessions();
            expect(Array.isArray(sessions)).toBe(true);
        });

        test("ignores non-jsonl files", async () => {
            const project = join(projectsDir, "C--Users-Destiny-Projects-test");
            mkdirSync(project, { recursive: true });

            // Create JSONL file
            const sessionId = "valid-valid-valid-valid-validvalid";
            writeFileSync(join(project, `${sessionId}.jsonl`), '{"type":"test"}\n');

            // Create non-JSONL files
            writeFileSync(join(project, "readme.txt"), "readme");
            writeFileSync(join(project, "config.json"), "{}");
            writeFileSync(join(project, ".hidden"), "hidden");

            const source = new FileSystemSessionSource({ claudeDir: projectsDir });
            const sessions = await source.discoverSessions();

            expect(sessions).toHaveLength(1);
            expect(sessions[0]?.id).toBe(sessionId);
        });
    });

    describe("getSessionFile", () => {
        test("returns null for non-existent session", async () => {
            const source = new FileSystemSessionSource({ claudeDir: projectsDir });
            const result = await source.getSessionFile("non-existent-session-id");
            expect(result).toBeNull();
        });

        test("returns path for existing session", async () => {
            const project = join(projectsDir, "C--Users-Destiny-Projects-myproj");
            mkdirSync(project, { recursive: true });

            const sessionId = "found-uuid-test-test-testtesttest";
            const sessionFile = join(project, `${sessionId}.jsonl`);
            writeFileSync(sessionFile, '{"type":"test"}\n');

            const source = new FileSystemSessionSource({ claudeDir: projectsDir });
            const result = await source.getSessionFile(sessionId);

            expect(result).toBe(sessionFile);
        });

        test("works with subagent sessions", async () => {
            const project = join(projectsDir, "C--Users-Destiny-Projects-agent");
            mkdirSync(project, { recursive: true });

            // Create main session directory with subagents
            const mainSession = "main-sess-main-main-mainmainmain";
            const sessionDir = join(project, mainSession);
            const subagentsDir = join(sessionDir, "subagents");
            mkdirSync(subagentsDir, { recursive: true });

            const subagentId = "sub-agent-sub1-sub1-sub1sub1sub1";
            const subagentFile = join(subagentsDir, `${subagentId}.jsonl`);
            writeFileSync(subagentFile, '{"type":"subagent"}\n');

            const source = new FileSystemSessionSource({ claudeDir: projectsDir });
            const result = await source.getSessionFile(subagentId);

            expect(result).toBe(subagentFile);
        });

        test("returns first match when session exists in multiple projects", async () => {
            // Edge case: same session ID in different projects (unlikely but handle it)
            const project1 = join(projectsDir, "C--Users-Destiny-Projects-proj1");
            const project2 = join(projectsDir, "C--Users-Destiny-Projects-proj2");
            mkdirSync(project1, { recursive: true });
            mkdirSync(project2, { recursive: true });

            const sessionId = "dupe-dupe-dupe-dupe-dupedupedupe";
            writeFileSync(join(project1, `${sessionId}.jsonl`), '{"type":"proj1"}\n');
            writeFileSync(join(project2, `${sessionId}.jsonl`), '{"type":"proj2"}\n');

            const source = new FileSystemSessionSource({ claudeDir: projectsDir });
            const result = await source.getSessionFile(sessionId);

            // Should return a valid path (either project)
            expect(result).not.toBeNull();
            expect(result).toMatch(new RegExp(`${sessionId}\\.jsonl$`));
        });
    });
});
