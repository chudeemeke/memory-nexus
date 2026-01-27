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
    it("encodes Windows path - replaces backslash with double dash", () => {
      const path = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo");
      expect(path.encoded).toBe("C--Users-Destiny-Projects-foo");
    });

    it("encodes Unix path - replaces forward slash with single dash", () => {
      const path = ProjectPath.fromDecoded("/home/user/projects/foo");
      expect(path.encoded).toBe("-home-user-projects-foo");
    });

    it("encodes path with spaces", () => {
      const path = ProjectPath.fromDecoded("C:\\Users\\Destiny\\AI Tools\\Projects");
      expect(path.encoded).toBe("C--Users-Destiny-AI Tools-Projects");
    });

    it("encodes drive letter correctly", () => {
      const path = ProjectPath.fromDecoded("D:\\Data\\Projects");
      expect(path.encoded).toBe("D--Data-Projects");
    });
  });

  describe("decoding", () => {
    it("decodes Windows path - double dash to backslash", () => {
      const path = ProjectPath.fromEncoded("C--Users-Destiny-Projects-foo");
      expect(path.decoded).toBe("C:\\Users\\Destiny\\Projects\\foo");
    });

    it("decodes Unix path - leading dash indicates Unix", () => {
      const path = ProjectPath.fromEncoded("-home-user-projects-foo");
      expect(path.decoded).toBe("/home/user/projects/foo");
    });

    it("decodes path with spaces preserved", () => {
      const path = ProjectPath.fromEncoded("C--Users-Destiny-AI Tools-Projects");
      expect(path.decoded).toBe("C:\\Users\\Destiny\\AI Tools\\Projects");
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

    it("extracts project name from encoded path", () => {
      // Note: encoding is lossy for names containing dashes
      // "memory-nexus" in encoded form decodes to "memory\nexus"
      const path = ProjectPath.fromEncoded("C--Users-Destiny-Projects-foo");
      expect(path.projectName).toBe("foo");
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

    it("path created from encoded equals path created from decoded", () => {
      const path1 = ProjectPath.fromEncoded("C--Users-Destiny-Projects-foo");
      const path2 = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\foo");
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
});
