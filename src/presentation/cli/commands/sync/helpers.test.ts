/**
 * Sync Helpers Tests
 *
 * Tests for executeDryRun, handleError, reportResults, createDriveResolver,
 * and lazy loader functions.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDriveResolver,
  loadFactory,
  loadConfig,
  loadRepository,
  handleError,
  reportResults,
  executeDryRun,
} from "./helpers.js";
import { FileSystemSessionSource } from "../../../../infrastructure/sources/index.js";
import {
  saveCheckpoint,
  clearCheckpoint,
} from "../../../../infrastructure/signals/checkpoint-manager.js";

describe("helpers", () => {
  let tempDir: string;
  let oldXdgConfig: string | undefined;
  let oldXdgData: string | undefined;
  let oldMemoryHome: string | undefined;
  let oldUserProfile: string | undefined;
  let oldHome: string | undefined;

  // Mock sessions to return from FileSystemSessionSource
  const mockSessions = [
    {
      id: "session-1",
      projectPath: { decoded: "C:\\Projects\\test-project" },
      size: 100,
      modifiedTime: new Date("2026-05-20T12:00:00Z"),
    },
    {
      id: "session-2",
      projectPath: { decoded: "C:\\Projects\\other-project" },
      size: 200,
      modifiedTime: new Date("2026-05-21T12:00:00Z"),
    },
  ];

  // Backup original FileSystemSessionSource.prototype.discoverSessions
  const originalDiscover = FileSystemSessionSource.prototype.discoverSessions;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "memory-helpers-test-"));

    // Save old env vars
    oldXdgConfig = process.env.XDG_CONFIG_HOME;
    oldXdgData = process.env.XDG_DATA_HOME;
    oldMemoryHome = process.env.MEMORY_HOME;
    oldUserProfile = process.env.USERPROFILE;
    oldHome = process.env.HOME;

    // Set sandboxed env vars
    process.env.XDG_CONFIG_HOME = join(tempDir, "config");
    process.env.XDG_DATA_HOME = join(tempDir, "data");
    process.env.MEMORY_HOME = join(tempDir, "memory");
    process.env.USERPROFILE = tempDir;
    process.env.HOME = tempDir;

    // Mock discoverSessions
    FileSystemSessionSource.prototype.discoverSessions = async () => {
      return mockSessions as any;
    };
  });

  afterAll(() => {
    // Restore original prototype
    FileSystemSessionSource.prototype.discoverSessions = originalDiscover;

    // Restore env vars
    process.env.XDG_CONFIG_HOME = oldXdgConfig;
    process.env.XDG_DATA_HOME = oldXdgData;
    process.env.MEMORY_HOME = oldMemoryHome;
    process.env.USERPROFILE = oldUserProfile;
    process.env.HOME = oldHome;

    // Cleanup temp dir
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures
    }
  });

  describe("createDriveResolver", () => {
    it("returns a ProjectNameResolver instance", () => {
      const resolver = createDriveResolver();
      expect(resolver).toBeDefined();
    });
  });

  describe("lazy loaders", () => {
    it("loads factory dynamically", async () => {
      const factory = await loadFactory();
      expect(factory).toBeDefined();
    });

    it("loads config dynamically", async () => {
      const config = await loadConfig();
      expect(config).toBeDefined();
    });

    it("loads repository dynamically", async () => {
      const { initializeDatabase } = await import("../../../../infrastructure/database/index.js");
      const { db } = initializeDatabase({ path: ":memory:" });
      const repo = await loadRepository(db);
      expect(repo).toBeDefined();
      db.close();
    });
  });

  describe("handleError", () => {
    it("logs regular error to console.error when json is false", () => {
      const originalError = console.error;
      let errorOutput = "";
      console.error = (...args) => {
        errorOutput += args.join(" ") + "\n";
      };
      try {
        handleError(new Error("test error"), { json: false });
        expect(errorOutput).toContain("Error: test error");
      } finally {
        console.error = originalError;
      }
    });

    it("logs JSON error to console.error when json is true", () => {
      const originalError = console.error;
      let errorOutput = "";
      console.error = (...args) => {
        errorOutput += args.join(" ") + "\n";
      };
      try {
        handleError(new Error("test error"), { json: true });
        const parsed = JSON.parse(errorOutput.trim());
        expect(parsed.error.code).toBe("UNKNOWN");
        expect(parsed.error.message).toBe("test error");
      } finally {
        console.error = originalError;
      }
    });

    it("handles non-Error objects gracefully", () => {
      const originalError = console.error;
      let errorOutput = "";
      console.error = (...args) => {
        errorOutput += args.join(" ") + "\n";
      };
      try {
        handleError("string error", { json: false });
        expect(errorOutput).toContain("Error: string error");
      } finally {
        console.error = originalError;
      }
    });
  });

  describe("reportResults", () => {
    it("outputs JSON when json is true", () => {
      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args) => {
        logOutput += args.join(" ") + "\n";
      };
      try {
        const mockResult = {
          success: true,
          aborted: false,
          sessionsDiscovered: 5,
          sessionsProcessed: 3,
          sessionsSkipped: 2,
          messagesInserted: 10,
          toolUsesInserted: 20,
          recoveredFromCheckpoint: 1,
          errors: [{ sessionPath: "path", error: "err" }],
        };
        reportResults(mockResult, Date.now() - 1000, { json: true });
        expect(logOutput).toContain('"success": true');
        expect(logOutput).toContain('"discovered": 5');
        expect(logOutput).toContain('"errors"');
      } finally {
        console.log = originalLog;
      }
    });

    it("suppresses output when quiet is true", () => {
      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args) => {
        logOutput += args.join(" ") + "\n";
      };
      try {
        const mockResult = {
          success: true,
          aborted: false,
          sessionsDiscovered: 5,
          sessionsProcessed: 3,
          sessionsSkipped: 2,
          messagesInserted: 10,
          toolUsesInserted: 20,
          recoveredFromCheckpoint: 1,
          errors: [],
        };
        reportResults(mockResult, Date.now() - 1000, { quiet: true });
        expect(logOutput).toBe("");
      } finally {
        console.log = originalLog;
      }
    });

    it("logs text results when json/quiet are false", () => {
      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args) => {
        logOutput += args.join(" ") + "\n";
      };
      try {
        const mockResult = {
          success: true,
          aborted: false,
          sessionsDiscovered: 5,
          sessionsProcessed: 3,
          sessionsSkipped: 2,
          messagesInserted: 10,
          toolUsesInserted: 20,
          recoveredFromCheckpoint: 1,
          errors: [{ sessionPath: "path", error: "err" }],
        };
        reportResults(mockResult, Date.now() - 1000, { json: false, quiet: false });
        expect(logOutput).toContain("Sync complete in");
        expect(logOutput).toContain("Discovered: 5");
        expect(logOutput).toContain("Errors (1):");
      } finally {
        console.log = originalLog;
      }
    });

    it("logs aborted result properly", () => {
      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args) => {
        logOutput += args.join(" ") + "\n";
      };
      try {
        const mockResult = {
          success: false,
          aborted: true,
          sessionsDiscovered: 5,
          sessionsProcessed: 3,
          sessionsSkipped: 2,
          messagesInserted: 10,
          toolUsesInserted: 20,
          recoveredFromCheckpoint: 1,
          errors: [],
        };
        reportResults(mockResult, Date.now() - 1000, { json: false, quiet: false });
        expect(logOutput).toContain("Sync aborted (progress saved)");
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe("executeDryRun", () => {
    it("runs dry-run and logs text by default", async () => {
      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args) => {
        logOutput += args.join(" ") + "\n";
      };
      try {
        const res = await executeDryRun({ json: false });
        expect(res.exitCode).toBe(0);
        expect(logOutput).toContain("Dry run - no changes will be made");
        expect(logOutput).toContain("Discovered:  2 sessions");
        expect(logOutput).toContain("To process:  2 sessions");
      } finally {
        console.log = originalLog;
      }
    });

    it("runs dry-run and logs JSON when json: true", async () => {
      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args) => {
        logOutput += args.join(" ") + "\n";
      };
      try {
        const res = await executeDryRun({ json: true });
        expect(res.exitCode).toBe(0);
        expect(logOutput).toContain('"dryRun": true');
        expect(logOutput).toContain('"discovered": 2');
        expect(logOutput).toContain('"toProcess": 2');
      } finally {
        console.log = originalLog;
      }
    });

    it("filters sessions by project", async () => {
      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args) => {
        logOutput += args.join(" ") + "\n";
      };
      try {
        const res = await executeDryRun({ json: false, project: "other" });
        expect(res.exitCode).toBe(0);
        expect(logOutput).toContain("After filter: 1 sessions");
        expect(logOutput).toContain("To process:  1 sessions");
      } finally {
        console.log = originalLog;
      }
    });

    it("filters sessions by session id", async () => {
      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args) => {
        logOutput += args.join(" ") + "\n";
      };
      try {
        const res = await executeDryRun({ json: false, session: "session-1" });
        expect(res.exitCode).toBe(0);
        expect(logOutput).toContain("After filter: 1 sessions");
        expect(logOutput).toContain("To process:  1 sessions");
      } finally {
        console.log = originalLog;
      }
    });

    it("handles checkpoint filtering correctly", async () => {
      saveCheckpoint({
        startedAt: new Date().toISOString(),
        totalSessions: 2,
        completedSessions: 1,
        completedSessionIds: ["session-1"],
        lastCompletedAt: new Date().toISOString(),
      });

      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args) => {
        logOutput += args.join(" ") + "\n";
      };
      try {
        const res = await executeDryRun({ json: false });
        expect(res.exitCode).toBe(0);
        expect(logOutput).toContain("Checkpoint:  1 already done");
        expect(logOutput).toContain("To process:  1 sessions");
      } finally {
        console.log = originalLog;
        clearCheckpoint();
      }
    });

    it("handles errors and exit with 1", async () => {
      // Temporarily corrupt discoverSessions to throw an error
      FileSystemSessionSource.prototype.discoverSessions = async () => {
        throw new Error("mock error");
      };

      const originalError = console.error;
      let errorOutput = "";
      console.error = (...args) => {
        errorOutput += args.join(" ") + "\n";
      };
      try {
        const res = await executeDryRun({ json: false });
        expect(res.exitCode).toBe(1);
        expect(errorOutput).toContain("Error: mock error");
      } finally {
        console.error = originalError;
        // Restore discovery mock
        FileSystemSessionSource.prototype.discoverSessions = async () => {
          return mockSessions as any;
        };
      }
    });
  });
});
