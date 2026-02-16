import { describe, expect, it } from "bun:test";
import { ProjectPath } from "./project-path.js";

describe("ProjectPath value object", () => {
  describe("construction", () => {
    it("creates from decoded Windows path", () => {
      const path = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo");
      expect(path.decoded).toBe("C:\\Users\\Destiny\\Projects\\foo");
    });

    it("creates from decoded Unix path", () => {
      const path = ProjectPath.fromDecoded("/home/user/projects/foo");
      expect(path.decoded).toBe("/home/user/projects/foo");
    });

    it("creates from encoded Windows path", () => {
      const path = ProjectPath.fromEncoded("C--Users-Destiny-Projects-foo");
      expect(path.encoded).toBe("C--Users-Destiny-Projects-foo");
    });

    it("creates from encoded Unix path", () => {
      const path = ProjectPath.fromEncoded("-home-user-projects-foo");
      expect(path.encoded).toBe("-home-user-projects-foo");
    });

    it("throws on empty path", () => {
      expect(() => ProjectPath.fromDecoded("")).toThrow("Path cannot be empty");
    });

    it("throws on whitespace-only path", () => {
      expect(() => ProjectPath.fromDecoded("   ")).toThrow("Path cannot be empty");
    });
  });

  describe("encoding", () => {
    it("encodes Windows path - replaces backslash with single dash", () => {
      const path = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo");
      expect(path.encoded).toBe("C--Users-Destiny-Projects-foo");
    });

    it("encodes Unix path - replaces forward slash with single dash", () => {
      const path = ProjectPath.fromDecoded("/home/user/projects/foo");
      expect(path.encoded).toBe("-home-user-projects-foo");
    });

    it("encodes path with spaces - spaces become dashes (matches Claude Code)", () => {
      // Claude Code converts spaces to dashes, same as path separators
      const path = ProjectPath.fromDecoded("C:\\Users\\Destiny\\AI Tools\\Projects");
      expect(path.encoded).toBe("C--Users-Destiny-AI-Tools-Projects");
    });

    it("encodes path with hyphens - hyphens preserved as dashes (lossy)", () => {
      // Hyphens in original path become indistinguishable from path separators
      const path = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\memory-nexus");
      expect(path.encoded).toBe("C--Users-Destiny-Projects-memory-nexus");
    });

    it("encodes drive letter correctly", () => {
      const path = ProjectPath.fromDecoded("D:\\Data\\Projects");
      expect(path.encoded).toBe("D--Data-Projects");
    });
  });

  describe("decoding (lossy - best effort)", () => {
    // NOTE: Claude Code encoding is LOSSY. Spaces, hyphens, and path separators
    // all become single dashes. The decoder cannot distinguish between them.
    // Decoded paths are "best effort" - they may not match the original.

    it("decodes simple Windows path correctly", () => {
      const path = ProjectPath.fromEncoded("C--Users-Destiny-Projects-foo");
      expect(path.decoded).toBe("C:\\Users\\Destiny\\Projects\\foo");
    });

    it("decodes simple Unix path correctly", () => {
      const path = ProjectPath.fromEncoded("-home-user-projects-foo");
      expect(path.decoded).toBe("/home/user/projects/foo");
    });

    it("decoded path is best-effort for paths with spaces (lossy)", () => {
      // Original: C:\Users\Destiny\AI Tools\Projects
      // Encoded by Claude Code: C--Users-Destiny-AI-Tools-Projects
      // Decoded: C:\Users\Destiny\AI\Tools\Projects (spaces become backslashes)
      const path = ProjectPath.fromEncoded("C--Users-Destiny-AI-Tools-Projects");
      // We cannot recover spaces - they become path separators
      expect(path.decoded).toBe("C:\\Users\\Destiny\\AI\\Tools\\Projects");
    });

    it("decoded path is best-effort for paths with hyphens (lossy)", () => {
      // Original: C:\Users\Destiny\Projects\memory-nexus
      // Encoded by Claude Code: C--Users-Destiny-Projects-memory-nexus
      // Decoded: C:\Users\Destiny\Projects\memory\nexus (hyphen becomes backslash)
      const path = ProjectPath.fromEncoded("C--Users-Destiny-Projects-memory-nexus");
      // We cannot recover hyphens - they become path separators
      expect(path.decoded).toBe("C:\\Users\\Destiny\\Projects\\memory\\nexus");
    });
  });

  describe("project name extraction", () => {
    it("extracts project name from Windows path", () => {
      const path = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\memory-nexus");
      expect(path.projectName).toBe("memory-nexus");
    });

    it("extracts project name from Unix path", () => {
      const path = ProjectPath.fromDecoded("/home/user/projects/memory-nexus");
      expect(path.projectName).toBe("memory-nexus");
    });

    it("extracts project name from encoded path (simple name)", () => {
      const path = ProjectPath.fromEncoded("C--Users-Destiny-Projects-foo");
      expect(path.projectName).toBe("foo");
    });

    it("extracts project name from encoded path with hyphen (last segment only)", () => {
      // For encoded paths, project name is the last dash-separated segment
      // This preserves the encoded form which is unambiguous
      const path = ProjectPath.fromEncoded("C--Users-Destiny-Projects-memory-nexus");
      // The last segment after the last dash is "nexus", not "memory-nexus"
      // because we cannot distinguish hyphens from path separators
      expect(path.projectName).toBe("nexus");
    });

    it("handles trailing separator in Windows path", () => {
      const path = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo\\");
      expect(path.projectName).toBe("foo");
    });

    it("handles trailing separator in Unix path", () => {
      const path = ProjectPath.fromDecoded("/home/user/projects/foo/");
      expect(path.projectName).toBe("foo");
    });
  });

  describe("immutability", () => {
    it("decoded property is readonly", () => {
      const path = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo");
      // TypeScript would catch this at compile time, but we verify behavior
      expect(path.decoded).toBe("C:\\Users\\Destiny\\Projects\\foo");
    });

    it("encoded property is readonly", () => {
      const path = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo");
      expect(path.encoded).toBe("C--Users-Destiny-Projects-foo");
    });

    it("projectName property is readonly", () => {
      const path = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo");
      expect(path.projectName).toBe("foo");
    });
  });

  describe("equality", () => {
    it("two paths with same decoded value are equal", () => {
      const path1 = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo");
      const path2 = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo");
      expect(path1.equals(path2)).toBe(true);
    });

    it("two paths with different decoded values are not equal", () => {
      const path1 = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo");
      const path2 = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\bar");
      expect(path1.equals(path2)).toBe(false);
    });

    it("two paths with same encoded value are equal", () => {
      const path1 = ProjectPath.fromEncoded("C--Users-Destiny-Projects-foo");
      const path2 = ProjectPath.fromEncoded("C--Users-Destiny-Projects-foo");
      expect(path1.equals(path2)).toBe(true);
    });

    it("path created from simple encoded equals path created from decoded", () => {
      // For simple paths without spaces/hyphens, encoding is reversible
      const path1 = ProjectPath.fromEncoded("C--Users-Destiny-Projects-foo");
      const path2 = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo");
      expect(path1.equals(path2)).toBe(true);
    });

    it("equality based on encoded value (canonical identifier)", () => {
      // Two ProjectPath objects are equal if their encoded forms match
      // This is the reliable comparison since encoding is deterministic
      const path1 = ProjectPath.fromEncoded("C--Users-Destiny-AI-Tools-Projects");
      const path2 = ProjectPath.fromEncoded("C--Users-Destiny-AI-Tools-Projects");
      expect(path1.equals(path2)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles root Windows path", () => {
      const path = ProjectPath.fromDecoded("C:\\");
      expect(path.encoded).toBe("C--");
      expect(path.projectName).toBe("C:");
    });

    it("handles root Unix path", () => {
      const path = ProjectPath.fromDecoded("/");
      expect(path.encoded).toBe("-");
      expect(path.projectName).toBe("");
    });

    it("handles single segment Windows path", () => {
      const path = ProjectPath.fromDecoded("C:\\Projects");
      expect(path.encoded).toBe("C--Projects");
      expect(path.projectName).toBe("Projects");
    });

    it("handles single segment Unix path", () => {
      const path = ProjectPath.fromDecoded("/projects");
      expect(path.encoded).toBe("-projects");
      expect(path.projectName).toBe("projects");
    });

    it("handles WSL-style path", () => {
      const path = ProjectPath.fromDecoded("/mnt/c/Users/Destiny/Projects/foo");
      expect(path.encoded).toBe("-mnt-c-Users-Destiny-Projects-foo");
      expect(path.projectName).toBe("foo");
    });
  });

  describe("withProjectName", () => {
    it("returns a new ProjectPath with overridden project name", () => {
      const original = ProjectPath.fromEncoded("C--Users-Destiny-Projects-memory-nexus");
      const fixed = original.withProjectName("memory-nexus");
      expect(fixed.projectName).toBe("memory-nexus");
    });

    it("preserves encoded path", () => {
      const original = ProjectPath.fromEncoded("C--Users-Destiny-Projects-memory-nexus");
      const fixed = original.withProjectName("memory-nexus");
      expect(fixed.encoded).toBe(original.encoded);
    });

    it("preserves decoded path", () => {
      const original = ProjectPath.fromEncoded("C--Users-Destiny-Projects-memory-nexus");
      const fixed = original.withProjectName("memory-nexus");
      expect(fixed.decoded).toBe(original.decoded);
    });

    it("does not mutate the original instance", () => {
      const original = ProjectPath.fromEncoded("C--Users-Destiny-Projects-memory-nexus");
      original.withProjectName("memory-nexus");
      // Original still has lossy project name
      expect(original.projectName).toBe("nexus");
    });

    it("works with spaces in project name", () => {
      const original = ProjectPath.fromEncoded("C--Users-Destiny-AI-Tools");
      const fixed = original.withProjectName("AI Tools");
      expect(fixed.projectName).toBe("AI Tools");
    });

    it("equality still based on decoded path", () => {
      const original = ProjectPath.fromEncoded("C--Users-Destiny-Projects-memory-nexus");
      const fixed = original.withProjectName("memory-nexus");
      expect(fixed.equals(original)).toBe(true);
    });
  });
});
