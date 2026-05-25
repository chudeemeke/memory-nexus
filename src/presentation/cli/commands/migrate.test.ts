/**
 * Migrate Command Tests
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as dbModule from "../../../infrastructure/database/index.js";
import * as hooksModule from "../../../infrastructure/hooks/index.js";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createMigrateCommand,
  executeMigrateCommand,
} from "./migrate.js";
import { initializeDatabase, closeDatabase } from "../../../infrastructure/database/index.js";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import { Session } from "../../../domain/entities/session.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";

describe("migrate command", () => {
  let testDir: string;
  let testDbPath: string;
  let consoleOutput: string[];
  let consoleErrorOutput: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  function createTestSession(
    db: any,
    id: string,
    projectName: string,
    updatedAt: string
  ): void {
    const projectPath = ProjectPath.fromDecoded(`C:\\Users\\Test\\Projects\\${projectName}`);
    const session = Session.create({
      id,
      projectPath,
      startTime: new Date(updatedAt),
    });
    const repo = new SqliteSessionRepository(db);
    repo.save(session);
    db.run(`UPDATE sessions SET updated_at = '${updatedAt}' WHERE id = '${id}'`);
  }

  beforeEach(() => {
    testDir = join(tmpdir(), `migrate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    testDbPath = join(testDir, "memory.db");

    consoleOutput = [];
    consoleErrorOutput = [];
    originalLog = console.log;
    originalError = console.error;

    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      consoleErrorOutput.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;

    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("should create a command named 'migrate'", () => {
    const command = createMigrateCommand();
    expect(command.name()).toBe("migrate");
    expect(command.description()).toBe("Migrate database across platform environments");
  });

  it("should fail with exit code 1 if database does not exist", async () => {
    const result = await executeMigrateCommand(
      {},
      { dbPath: join(testDir, "nonexistent.db") }
    );
    expect(result.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("Database not found");
  });

  it("should fail with exit code 2 if integrity check is corrupted", async () => {
    // Write invalid file to trigger load/integrity failure
    writeFileSync(testDbPath, "corrupted database content");

    const result = await executeMigrateCommand(
      {},
      { dbPath: testDbPath }
    );
    expect(result.exitCode).toBe(2);
    expect(consoleErrorOutput.join("\n")).toContain("Error during migration");
  });

  it("should succeed with exit code 0 when database exists and passes checks", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    createTestSession(db, "session-1", "project-a", "2026-01-20T10:00:00Z");
    closeDatabase(db);

    const uninstallHooksSpy = () => {};
    const installHooksSpy = () => {};

    const result = await executeMigrateCommand(
      {},
      {
        dbPath: testDbPath,
        dataDir: testDir,
        uninstallHooks: uninstallHooksSpy,
        installHooks: installHooksSpy,
      }
    );

    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Database migration successful!");
    expect(out).toContain("Total sessions: 1");
    expect(out).toContain("project-a: 1 sessions");
  });

  it("should clean up stale lock files in the data directory", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const lockPath = join(testDir, "embedding.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 1234 }));

    const result = await executeMigrateCommand(
      {},
      {
        dbPath: testDbPath,
        dataDir: testDir,
        uninstallHooks: () => {},
        installHooks: () => {},
      }
    );

    expect(result.exitCode).toBe(0);
    expect(existsSync(lockPath)).toBe(false);
    expect(consoleOutput.join("\n")).toContain("Cleaned up stale embedding lock file");
  });

  it("should invoke uninstallHooks and installHooks sequentially during hook reinstallation", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const callOrder: string[] = [];
    const uninstallHooksSpy = () => {
      callOrder.push("uninstall");
    };
    const installHooksSpy = () => {
      callOrder.push("install");
    };

    const result = await executeMigrateCommand(
      {},
      {
        dbPath: testDbPath,
        dataDir: testDir,
        uninstallHooks: uninstallHooksSpy,
        installHooks: installHooksSpy,
      }
    );

    expect(result.exitCode).toBe(0);
    expect(callOrder).toEqual(["uninstall", "install"]);
    expect(consoleOutput.join("\n")).toContain("Successfully re-installed Git hooks natively");
  });

  it("should log a warning but not fail if hook reinstallation throws", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const uninstallHooksSpy = () => {
      throw new Error("Cannot write git hooks folder");
    };

    const result = await executeMigrateCommand(
      {},
      {
        dbPath: testDbPath,
        dataDir: testDir,
        uninstallHooks: uninstallHooksSpy,
        installHooks: () => {},
      }
    );

    expect(result.exitCode).toBe(0);
    expect(consoleOutput.join("\n")).toContain("Warning: Failed to re-install Git hooks");
  });

  it("should fail with exit code 2 if integrity check returns non-ok status", async () => {
    // Write dummy file to ensure existsSync(dbPath) is true
    writeFileSync(testDbPath, "");

    const mockDb = {
      prepare: (sql: string) => {
        if (sql === "PRAGMA integrity_check") {
          return {
            get: () => ({ integrity_check: "corrupt" })
          };
        }
        return {
          run: () => {}
        };
      },
      close: () => {}
    };

    const initSpy = spyOn(dbModule, "initializeDatabase").mockReturnValue({
      db: mockDb as any,
      isNew: false
    });

    try {
      const result = await executeMigrateCommand(
        {},
        { dbPath: testDbPath }
      );
      expect(result.exitCode).toBe(2);
      expect(consoleErrorOutput.join("\n")).toContain("Database integrity check failed: corrupt");
    } finally {
      initSpy.mockRestore();
    }
  });

  it("should fail with exit code 2 if integrity check returns null", async () => {
    // Write dummy file to ensure existsSync(dbPath) is true
    writeFileSync(testDbPath, "");

    const mockDb = {
      prepare: (sql: string) => {
        if (sql === "PRAGMA integrity_check") {
          return {
            get: () => null
          };
        }
        return {
          run: () => {}
        };
      },
      close: () => {}
    };

    const initSpy = spyOn(dbModule, "initializeDatabase").mockReturnValue({
      db: mockDb as any,
      isNew: false
    });

    try {
      const result = await executeMigrateCommand(
        {},
        { dbPath: testDbPath }
      );
      expect(result.exitCode).toBe(2);
      expect(consoleErrorOutput.join("\n")).toContain("Database integrity check failed: unknown");
    } finally {
      initSpy.mockRestore();
    }
  });

  it("should execute migrate command action handler when parsed via commander", async () => {
    const originalExitCode = process.exitCode;
    const pathSpy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(testDbPath);
    const uninstallSpy = spyOn(hooksModule, "uninstallHooks").mockImplementation(() => {});
    const installSpy = spyOn(hooksModule, "installHooks").mockImplementation(() => {});
    
    // Initialize standard valid DB so execution succeeds
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    try {
      const cmd = createMigrateCommand();
      await cmd.parseAsync(["node", "memory", "--from-windows"]);
      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = originalExitCode;
      pathSpy.mockRestore();
      uninstallSpy.mockRestore();
      installSpy.mockRestore();
    }
  });
});
