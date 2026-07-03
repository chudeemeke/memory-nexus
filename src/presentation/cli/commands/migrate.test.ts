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
    expect(command.options.some((option) => option.long === "--from-windows")).toBe(true);
    expect(command.options.some((option) => option.long === "--dry-run")).toBe(true);
    expect(command.options.some((option) => option.long === "--json")).toBe(true);
    expect(command.options.some((option) => option.long === "--confirm")).toBe(true);
  });

  it("should fail with exit code 1 if database does not exist", async () => {
    const result = await executeMigrateCommand(
      {},
      { dbPath: join(testDir, "nonexistent.db") }
    );
    expect(result.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("Database not found");
  });

  it("should report missing database as stable JSON", async () => {
    const result = await executeMigrateCommand(
      { json: true, fromWindows: true },
      { dbPath: join(testDir, "nonexistent.db"), dataDir: testDir }
    );

    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("error");
    expect(parsed.data.fromWindows).toBe(true);
    expect(parsed.errors[0]).toContain("Database not found");
  });

  it("should fail with exit code 2 if integrity check is corrupted", async () => {
    // Write invalid file to trigger load/integrity failure
    writeFileSync(testDbPath, "corrupted database content");

    const result = await executeMigrateCommand(
      { confirm: true },
      { dbPath: testDbPath }
    );
    expect(result.exitCode).toBe(2);
    expect(consoleErrorOutput.join("\n")).toContain("Error during migration");
  });

  it("should require --confirm before mutating an existing database", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const lockPath = join(testDir, "embedding.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 1234 }));

    const result = await executeMigrateCommand(
      {},
      {
        dbPath: testDbPath,
        dataDir: testDir,
        uninstallHooks: () => {
          throw new Error("should not reinstall hooks without confirmation");
        },
        installHooks: () => {
          throw new Error("should not reinstall hooks without confirmation");
        },
      }
    );

    expect(result.exitCode).toBe(2);
    expect(existsSync(lockPath)).toBe(true);
    expect(consoleErrorOutput.join("\n")).toContain("requires --confirm");
  });

  it("should report missing confirmation as stable JSON", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const result = await executeMigrateCommand(
      { json: true, fromWindows: true },
      { dbPath: testDbPath, dataDir: testDir }
    );

    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("not_ready");
    expect(parsed.data.requiredCommand).toContain("--from-windows");
    expect(parsed.errors[0]).toContain("requires --confirm");
  });

  it("should report current-platform missing confirmation as stable JSON", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const result = await executeMigrateCommand(
      { json: true },
      { dbPath: testDbPath, dataDir: testDir }
    );

    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("not_ready");
    expect(parsed.data.fromWindows).toBe(false);
    expect(parsed.data.requiredCommand).toBe("memory migrate --dry-run --json && memory migrate --confirm");
  });

  it("should dry-run migration readiness as stable JSON without mutating local state", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const lockPath = join(testDir, "embedding.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 1234 }));

    const result = await executeMigrateCommand(
      { fromWindows: true, dryRun: true, json: true },
      {
        dbPath: testDbPath,
        dataDir: testDir,
        uninstallHooks: () => {
          throw new Error("dry-run must not reinstall hooks");
        },
        installHooks: () => {
          throw new Error("dry-run must not reinstall hooks");
        },
      }
    );

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.command).toBe("migrate");
    expect(parsed.status).toBe("ok");
    expect(parsed.data.mode).toBe("dry-run");
    expect(parsed.data.fromWindows).toBe(true);
    expect(parsed.data.integrityCheck).toBe("ok");
    expect(parsed.data.wouldCheckpointWal).toBe(true);
    expect(parsed.data.wouldRemoveStaleEmbeddingLock).toBe(true);
    expect(parsed.data.requiredConfirmation).toBe("memory migrate --from-windows --confirm");
    expect(existsSync(lockPath)).toBe(true);
  });

  it("should print text dry-run readiness for current platform", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const result = await executeMigrateCommand(
      { dryRun: true },
      { dbPath: testDbPath, dataDir: testDir }
    );

    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Migration dry-run passed");
    expect(out).toContain("Mode: current platform");
    expect(out).toContain("Would remove stale embedding lock: no");
    expect(out).toContain("memory migrate --confirm");
  });

  it("should print from-Windows text dry-run readiness with stale lock removal preview", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);
    writeFileSync(join(testDir, "embedding.lock"), JSON.stringify({ pid: 1234 }));

    const result = await executeMigrateCommand(
      { dryRun: true, fromWindows: true },
      { dbPath: testDbPath, dataDir: testDir }
    );

    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Mode: from Windows host");
    expect(out).toContain("Would remove stale embedding lock: yes");
    expect(out).toContain("memory migrate --from-windows --confirm");
  });

  it("should report dry-run database open failures in JSON", async () => {
    writeFileSync(testDbPath, "not sqlite");

    const result = await executeMigrateCommand(
      { dryRun: true, json: true },
      { dbPath: testDbPath, dataDir: testDir }
    );

    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("error");
    expect(parsed.data.mode).toBe("dry-run");
    expect(parsed.errors[0]).toContain("Database integrity check failed");
  });

  it("should report dry-run database open failures in text mode", async () => {
    writeFileSync(testDbPath, "not sqlite");

    const result = await executeMigrateCommand(
      { dryRun: true },
      { dbPath: testDbPath, dataDir: testDir }
    );

    expect(result.exitCode).toBe(2);
    expect(consoleErrorOutput.join("\n")).toContain("Error during migration dry-run");
    expect(consoleErrorOutput.join("\n")).toContain("Database integrity check failed");
  });

  it("should report confirmed migration database failures in JSON", async () => {
    writeFileSync(testDbPath, "not sqlite");

    const result = await executeMigrateCommand(
      { confirm: true, json: true },
      { dbPath: testDbPath, dataDir: testDir }
    );

    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("error");
    expect(parsed.data.integrityCheck).toBe("unknown");
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it("should succeed with exit code 0 when database exists and passes checks", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    createTestSession(db, "session-1", "project-a", "2026-01-20T10:00:00Z");
    closeDatabase(db);

    const uninstallHooksSpy = () => {};
    const installHooksSpy = () => {};

    const result = await executeMigrateCommand(
      { confirm: true },
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

  it("should emit JSON success with warnings when hook reinstallation fails", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const result = await executeMigrateCommand(
      { confirm: true, json: true, fromWindows: true },
      {
        dbPath: testDbPath,
        dataDir: testDir,
        uninstallHooks: () => {
          throw new Error("hook folder locked");
        },
        installHooks: () => {},
      }
    );

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("ok");
    expect(parsed.data.fromWindows).toBe(true);
    expect(parsed.data.hooksReinstalled).toBe(false);
    expect(parsed.warnings[0]).toContain("hook folder locked");
  });

  it("should emit JSON success without warnings when hooks reinstall and no stale lock exists", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const result = await executeMigrateCommand(
      { confirm: true, json: true },
      {
        dbPath: testDbPath,
        dataDir: testDir,
        uninstallHooks: () => {},
        installHooks: () => {},
      }
    );

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("ok");
    expect(parsed.data.fromWindows).toBe(false);
    expect(parsed.data.removedStaleEmbeddingLock).toBe(false);
    expect(parsed.data.hooksReinstalled).toBe(true);
    expect(parsed.warnings).toEqual([]);
  });

  it("should emit confirmed JSON success with stale lock cleanup state", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const lockPath = join(testDir, "embedding.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 1234 }));

    const result = await executeMigrateCommand(
      { confirm: true, json: true },
      {
        dbPath: testDbPath,
        dataDir: testDir,
        uninstallHooks: () => {},
        installHooks: () => {},
      }
    );

    expect(result.exitCode).toBe(0);
    expect(existsSync(lockPath)).toBe(false);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("ok");
    expect(parsed.data.removedStaleEmbeddingLock).toBe(true);
    expect(consoleOutput.join("\n")).not.toContain("Cleaned up stale embedding lock file");
  });

  it("should print no-project stats text when migration succeeds on an empty database", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const result = await executeMigrateCommand(
      { confirm: true },
      {
        dbPath: testDbPath,
        dataDir: testDir,
        uninstallHooks: () => {},
        installHooks: () => {},
      }
    );

    expect(result.exitCode).toBe(0);
    expect(consoleOutput.join("\n")).toContain("No projects found.");
  });

  it("should clean up stale lock files in the data directory", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    const lockPath = join(testDir, "embedding.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 1234 }));

    const result = await executeMigrateCommand(
      { confirm: true },
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
      { confirm: true },
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
      { confirm: true },
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
        { confirm: true },
        { dbPath: testDbPath }
      );
      expect(result.exitCode).toBe(2);
      expect(consoleErrorOutput.join("\n")).toContain("Database integrity check failed: corrupt");
    } finally {
      initSpy.mockRestore();
    }
  });

  it("should report non-ok integrity failures as stable JSON", async () => {
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
        { confirm: true, json: true },
        { dbPath: testDbPath, dataDir: testDir }
      );
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(consoleOutput.join("\n"));
      expect(parsed.status).toBe("error");
      expect(parsed.data.integrityCheck).toBe("corrupt");
      expect(parsed.errors[0]).toContain("Database integrity check failed: corrupt");
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
        { confirm: true },
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
      await cmd.parseAsync(["node", "memory", "--from-windows", "--confirm"]);
      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = originalExitCode;
      pathSpy.mockRestore();
      uninstallSpy.mockRestore();
      installSpy.mockRestore();
    }
  });
});
