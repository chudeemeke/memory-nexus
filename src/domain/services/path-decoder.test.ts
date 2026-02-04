import { describe, expect, it } from "bun:test";
import { PathDecoder } from "./path-decoder.js";
import { ProjectPath } from "../value-objects/index.js";

describe("PathDecoder domain service", () => {
  describe("decodeProjectDirectory", () => {
    it("decodes Windows path from Claude Code encoding", () => {
      const encoded = "C--Users-Destiny-Projects-foo";
      const result = PathDecoder.decodeProjectDirectory(encoded);

      expect(result.decoded).toBe("C:\\Users\\Destiny\\Projects\\foo");
    });

    it("decodes Unix path from Claude Code encoding", () => {
      const encoded = "-home-user-projects-bar";
      const result = PathDecoder.decodeProjectDirectory(encoded);

      expect(result.decoded).toBe("/home/user/projects/bar");
    });

    it("returns ProjectPath value object", () => {
      const encoded = "C--Users-Test";
      const result = PathDecoder.decodeProjectDirectory(encoded);

      expect(result).toBeInstanceOf(ProjectPath);
    });
  });

  describe("isEncodedPath", () => {
    it("recognizes Windows drive encoding", () => {
      expect(PathDecoder.isEncodedPath("C--Users-Foo")).toBe(true);
      expect(PathDecoder.isEncodedPath("D--Projects")).toBe(true);
    });

    it("recognizes Unix root encoding", () => {
      expect(PathDecoder.isEncodedPath("-home-user")).toBe(true);
      expect(PathDecoder.isEncodedPath("-var-log")).toBe(true);
    });

    it("rejects unencoded Windows paths", () => {
      expect(PathDecoder.isEncodedPath("C:\\Users\\Foo")).toBe(false);
    });

    it("rejects unencoded Unix paths", () => {
      expect(PathDecoder.isEncodedPath("/home/user")).toBe(false);
    });

    it("rejects empty strings", () => {
      expect(PathDecoder.isEncodedPath("")).toBe(false);
    });

    it("rejects random strings without path patterns", () => {
      expect(PathDecoder.isEncodedPath("hello-world")).toBe(false);
      expect(PathDecoder.isEncodedPath("foo")).toBe(false);
    });
  });

  describe("extractProjectName", () => {
    it("extracts project name from encoded Windows path", () => {
      // Use non-hyphenated name to avoid lossy encoding ambiguity
      const encoded = "C--Users-Destiny-Projects-myproject";
      const name = PathDecoder.extractProjectName(encoded);

      expect(name).toBe("myproject");
    });

    it("extracts project name from encoded Unix path", () => {
      // Use non-hyphenated name to avoid lossy encoding ambiguity
      const encoded = "-home-user-projects-webapp";
      const name = PathDecoder.extractProjectName(encoded);

      expect(name).toBe("webapp");
    });

    it("handles single segment paths", () => {
      const encoded = "C--foo";
      const name = PathDecoder.extractProjectName(encoded);

      expect(name).toBe("foo");
    });

    it("extracts last segment for hyphenated project names (lossy)", () => {
      // Claude Code encoding is lossy: "memory-nexus" becomes indistinguishable
      // from "memory\nexus" or "memory nexus" in the encoded form.
      // The extracted project name is just the last dash-separated segment.
      const encoded = "C--Users-Destiny-Projects-memory-nexus";
      const name = PathDecoder.extractProjectName(encoded);

      // Returns "nexus" not "memory-nexus" because decoder cannot distinguish
      expect(name).toBe("nexus");
    });
  });

  describe("listSessionPaths", () => {
    it("returns array of encoded paths from directory listing", () => {
      const directoryContents = [
        "C--Users-Destiny-Projects-foo",
        "C--Users-Destiny-Projects-bar",
        "not-a-path",
        "readme.txt",
      ];

      const paths = PathDecoder.filterEncodedPaths(directoryContents);

      expect(paths).toHaveLength(2);
      expect(paths[0]).toBe("C--Users-Destiny-Projects-foo");
      expect(paths[1]).toBe("C--Users-Destiny-Projects-bar");
    });

    it("returns empty array when no valid paths", () => {
      const directoryContents = ["readme.txt", "config.json"];
      const paths = PathDecoder.filterEncodedPaths(directoryContents);

      expect(paths).toHaveLength(0);
    });

    it("handles Unix paths in directory listing", () => {
      const directoryContents = ["-home-user-project1", "-var-www-project2"];
      const paths = PathDecoder.filterEncodedPaths(directoryContents);

      expect(paths).toHaveLength(2);
    });
  });
});
