/**
 * Session Discovery Integration Tests
 *
 * End-to-end tests for FileSystemSessionSource with mock filesystem.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { FileSystemSessionSource } from "./session-source.js";

// Test directory for mock filesystem
const TEST_DIR = join(process.cwd(), "tests", ".scratchpad-sources");

// Mock Claude projects directory structure
const MOCK_CLAUDE_DIR = join(TEST_DIR, ".claude", "projects");

describe("FileSystemSessionSource Integration", () => {
  beforeAll(() => {
    // Create mock filesystem structure
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    // Create standard directory structure:
    // .claude/projects/
    //   C--Users-Test-project1/
    //     session-1.jsonl
    //     session-2.jsonl
    //   C--Users-Test-project2/
    //     session-3.jsonl
    //     session-3/
    //       subagents/
    //         subagent-1.jsonl

    const project1Dir = join(MOCK_CLAUDE_DIR, "C--Users-Test-project1");
    const project2Dir = join(MOCK_CLAUDE_DIR, "C--Users-Test-project2");
    const subagentsDir = join(project2Dir, "session-3", "subagents");

    mkdirSync(project1Dir, { recursive: true });
    mkdirSync(project2Dir, { recursive: true });
    mkdirSync(subagentsDir, { recursive: true });

    // Create session files with minimal content
    const sessionContent = '{"type":"user","uuid":"1","timestamp":"2026-01-28T00:00:00Z","message":{"content":"test"}}';

    writeFileSync(join(project1Dir, "session-1.jsonl"), sessionContent);
    writeFileSync(join(project1Dir, "session-2.jsonl"), sessionContent);
    writeFileSync(join(project2Dir, "session-3.jsonl"), sessionContent);
    writeFileSync(join(subagentsDir, "subagent-1.jsonl"), sessionContent);
  });

  afterAll(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("with mock filesystem", () => {
    test("discovers sessions in standard directory structure", async () => {
      const source = new FileSystemSessionSource({
        claudeDir: MOCK_CLAUDE_DIR,
      });

      const sessions = await source.discoverSessions();

      // Should find at least the main session files
      expect(sessions.length).toBeGreaterThanOrEqual(3);

      const sessionIds = sessions.map((s) => s.id);
      expect(sessionIds).toContain("session-1");
      expect(sessionIds).toContain("session-2");
      expect(sessionIds).toContain("session-3");
    });

    test("handles nested subagent directories", async () => {
      const source = new FileSystemSessionSource({
        claudeDir: MOCK_CLAUDE_DIR,
      });

      const sessions = await source.discoverSessions();

      // Should find the subagent session
      const subagentSession = sessions.find((s) => s.id === "subagent-1");
      expect(subagentSession).toBeDefined();
      expect(subagentSession!.path).toContain("subagents");
    });

    test("returns accurate file metadata", async () => {
      const source = new FileSystemSessionSource({
        claudeDir: MOCK_CLAUDE_DIR,
      });

      const sessions = await source.discoverSessions();
      const session1 = sessions.find((s) => s.id === "session-1");

      expect(session1).toBeDefined();
      expect(session1!.path).toContain("session-1.jsonl");
      expect(session1!.size).toBeGreaterThan(0);
      expect(session1!.modifiedTime).toBeInstanceOf(Date);
    });

    test("associates sessions with correct project paths", async () => {
      const source = new FileSystemSessionSource({
        claudeDir: MOCK_CLAUDE_DIR,
      });

      const sessions = await source.discoverSessions();

      // Sessions from project1 (Windows-style decoded path)
      const project1Sessions = sessions.filter(
        (s) => s.projectPath.decoded === "C:\\Users\\Test\\project1"
      );
      expect(project1Sessions.length).toBe(2);

      // Sessions from project2 (Windows-style decoded path)
      const project2Sessions = sessions.filter(
        (s) => s.projectPath.decoded === "C:\\Users\\Test\\project2"
      );
      expect(project2Sessions.length).toBeGreaterThanOrEqual(1);
    });

    test("handles missing directories gracefully", async () => {
      const source = new FileSystemSessionSource({
        claudeDir: join(TEST_DIR, "nonexistent"),
      });

      const sessions = await source.discoverSessions();
      expect(sessions).toEqual([]);
    });

    test("getSessionFile returns correct path for existing session", async () => {
      const source = new FileSystemSessionSource({
        claudeDir: MOCK_CLAUDE_DIR,
      });

      const path = await source.getSessionFile("session-1");
      expect(path).not.toBeNull();
      expect(path).toContain("session-1.jsonl");
    });

    test("getSessionFile returns null for non-existent session", async () => {
      const source = new FileSystemSessionSource({
        claudeDir: MOCK_CLAUDE_DIR,
      });

      const path = await source.getSessionFile("nonexistent-session");
      expect(path).toBeNull();
    });

    test("handles empty project directory", async () => {
      // Create an empty project directory
      const emptyProjectDir = join(MOCK_CLAUDE_DIR, "C--Users-Test-empty");
      mkdirSync(emptyProjectDir, { recursive: true });

      const source = new FileSystemSessionSource({
        claudeDir: MOCK_CLAUDE_DIR,
      });

      const sessions = await source.discoverSessions();

      // Should not include sessions from empty directory (Windows-style decoded path)
      const emptySessions = sessions.filter(
        (s) => s.projectPath.decoded === "C:\\Users\\Test\\empty"
      );
      expect(emptySessions).toHaveLength(0);

      // Clean up
      rmSync(emptyProjectDir, { recursive: true });
    });
  });

  describe("with real filesystem (if available)", () => {
    test("discovers sessions from default location if available", async () => {
      const source = new FileSystemSessionSource();
      const sessions = await source.discoverSessions();

      // This test may find sessions or not, depending on environment
      // Just verify it doesn't throw
      expect(Array.isArray(sessions)).toBe(true);
    });
  });
});
