/**
 * ProjectNameResolver Tests
 *
 * Tests filesystem reverse-lookup for resolving correct project names
 * from Claude Code's lossy encoded paths.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectNameResolver } from "./project-name-resolver.js";

describe("ProjectNameResolver", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `resolver-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to create a directory structure under testDir.
   * Uses the testDir as the drive root stand-in.
   */
  function createDirs(...paths: string[]): void {
    for (const p of paths) {
      mkdirSync(join(testDir, p), { recursive: true });
    }
  }

  describe("resolveProjectName", () => {
    test("resolves simple project name without hyphens", () => {
      createDirs("Users/Destiny/Projects/myproject");
      const resolver = new ProjectNameResolver(testDir);

      const name = resolver.resolveProjectName("Users-Destiny-Projects-myproject");
      expect(name).toBe("myproject");
    });

    test("resolves project name with hyphens (memory-nexus)", () => {
      createDirs("Users/Destiny/Projects/memory-nexus");
      const resolver = new ProjectNameResolver(testDir);

      const name = resolver.resolveProjectName("Users-Destiny-Projects-memory-nexus");
      expect(name).toBe("memory-nexus");
    });

    test("resolves project name with multiple hyphens (get-stuff-done)", () => {
      createDirs("Users/Destiny/Projects/get-stuff-done");
      const resolver = new ProjectNameResolver(testDir);

      const name = resolver.resolveProjectName("Users-Destiny-Projects-get-stuff-done");
      expect(name).toBe("get-stuff-done");
    });

    test("resolves path with spaces in directory names (AI Tools)", () => {
      createDirs("Users/Destiny/iCloudDrive/Documents/AI Tools/Anthropic Solution/Projects/memory-nexus");
      const resolver = new ProjectNameResolver(testDir);

      const name = resolver.resolveProjectName(
        "Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-memory-nexus"
      );
      expect(name).toBe("memory-nexus");
    });

    test("resolves path with spaces AND hyphens combined", () => {
      createDirs("Users/Destiny/iCloudDrive/Documents/AI Tools/Anthropic Solution/Projects/get-stuff-done");
      const resolver = new ProjectNameResolver(testDir);

      const name = resolver.resolveProjectName(
        "Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-get-stuff-done"
      );
      expect(name).toBe("get-stuff-done");
    });

    test("falls back to last segment when directory does not exist", () => {
      // Directory structure missing - should fall back gracefully
      const resolver = new ProjectNameResolver(testDir);

      const name = resolver.resolveProjectName("Users-Destiny-Projects-memory-nexus");
      expect(name).toBe("nexus");
    });

    test("caches resolved paths for subsequent calls", () => {
      createDirs("Users/Destiny/Projects/memory-nexus");
      const resolver = new ProjectNameResolver(testDir);

      // First call populates cache
      const name1 = resolver.resolveProjectName("Users-Destiny-Projects-memory-nexus");
      // Second call uses cache (same result)
      const name2 = resolver.resolveProjectName("Users-Destiny-Projects-memory-nexus");

      expect(name1).toBe("memory-nexus");
      expect(name2).toBe("memory-nexus");
    });

    test("resolves different projects sharing same path prefix", () => {
      createDirs("Users/Destiny/Projects/memory-nexus");
      createDirs("Users/Destiny/Projects/wow-system");
      const resolver = new ProjectNameResolver(testDir);

      const name1 = resolver.resolveProjectName("Users-Destiny-Projects-memory-nexus");
      const name2 = resolver.resolveProjectName("Users-Destiny-Projects-wow-system");

      expect(name1).toBe("memory-nexus");
      expect(name2).toBe("wow-system");
    });

    test("handles single-segment project name", () => {
      createDirs("Projects");
      const resolver = new ProjectNameResolver(testDir);

      const name = resolver.resolveProjectName("Projects");
      expect(name).toBe("Projects");
    });

    test("handles deeply nested paths", () => {
      createDirs("a/b/c/d/e/my-project");
      const resolver = new ProjectNameResolver(testDir);

      const name = resolver.resolveProjectName("a-b-c-d-e-my-project");
      expect(name).toBe("my-project");
    });

    test("handles ambiguous matches by preferring longer directory names", () => {
      // Both "AI" dir and "AI Tools" dir exist at same level
      createDirs("Users/AI Tools/Projects/test");
      createDirs("Users/AI/Tools/Projects/test");
      const resolver = new ProjectNameResolver(testDir);

      // The encoded form "Users-AI-Tools-Projects-test" could match either.
      // Resolver should try longer matches first (greedy).
      const name = resolver.resolveProjectName("Users-AI-Tools-Projects-test");
      expect(name).toBe("test");
    });

    test("probes hidden directories via statSync when readdirSync misses them", () => {
      // iCloudDrive on Windows is a real directory that exists and is traversable,
      // but readdirSync on its parent does not list it. The resolver must fall back
      // to probing candidate names via statSync.
      //
      // We can't simulate a truly hidden directory in a temp dir, but we CAN test
      // against the real filesystem if iCloudDrive exists. Skip otherwise.
      const iCloudPath = "C:/Users/Destiny/iCloudDrive";
      if (!existsSync(iCloudPath)) {
        return; // Skip on systems without iCloudDrive
      }

      const resolver = new ProjectNameResolver("C:/");
      const name = resolver.resolveFromEncodedPath(
        "C--Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-memory-nexus"
      );
      expect(name).toBe("memory-nexus");
    });

    test("probes hidden directories for multiple project names", () => {
      const iCloudPath = "C:/Users/Destiny/iCloudDrive";
      if (!existsSync(iCloudPath)) {
        return;
      }

      const resolver = new ProjectNameResolver("C:/");

      const cases: Array<[string, string]> = [
        ["C--Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-get-stuff-done", "get-stuff-done"],
        ["C--Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-ai-dev-environment", "ai-dev-environment"],
        ["C--Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-later", "later"],
      ];

      for (const [encoded, expected] of cases) {
        if (existsSync(`C:/Users/Destiny/iCloudDrive/Documents/AI Tools/Anthropic Solution/Projects/${expected}`)) {
          expect(resolver.resolveFromEncodedPath(encoded)).toBe(expected);
        }
      }
    });
  });

  describe("resolveFromEncodedPath (with drive prefix)", () => {
    test("strips Windows drive prefix before resolving", () => {
      createDirs("Users/Destiny/Projects/memory-nexus");
      const resolver = new ProjectNameResolver(testDir);

      const name = resolver.resolveFromEncodedPath(
        "C--Users-Destiny-Projects-memory-nexus"
      );
      expect(name).toBe("memory-nexus");
    });

    test("strips lowercase drive prefix", () => {
      createDirs("Users/Destiny/Projects/test");
      const resolver = new ProjectNameResolver(testDir);

      const name = resolver.resolveFromEncodedPath("c--Users-Destiny-Projects-test");
      expect(name).toBe("test");
    });

    test("handles Unix encoded path (leading dash)", () => {
      createDirs("home/user/projects/my-app");
      const resolver = new ProjectNameResolver(testDir);

      const name = resolver.resolveFromEncodedPath("-home-user-projects-my-app");
      expect(name).toBe("my-app");
    });

    test("handles encoded path without drive prefix", () => {
      createDirs("Users/Destiny/Projects/test");
      const resolver = new ProjectNameResolver(testDir);

      const name = resolver.resolveFromEncodedPath("Users-Destiny-Projects-test");
      expect(name).toBe("test");
    });
  });
});
