/**
 * Doctor Portability Diagnostics Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  executeDoctorCommand,
  createDoctorCommand,
} from "./doctor.js";
import { initializeDatabase, closeDatabase } from "../../../infrastructure/database/index.js";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import { Session } from "../../../domain/entities/session.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";

describe("doctor portability diagnostics", () => {
  let testDir: string;
  let testDbPath: string;
  let consoleOutput: string[];
  let consoleErrorOutput: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  function createTestSession(
    db: any,
    id: string,
    decodedPath: string,
    updatedAt: string
  ): void {
    const projectPath = ProjectPath.fromDecoded(decodedPath);
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
    // Unique temp directory
    testDir = join(tmpdir(), `doctor-port-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    testDbPath = join(testDir, "memory.db");

    // Capture console output
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
    // Restore console
    console.log = originalLog;
    console.error = originalError;

    // Clean up
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should register --portability option on the doctor command builder", () => {
    const command = createDoctorCommand();
    const portOpt = command.options.find((o) => o.long === "--portability");
    expect(portOpt).toBeDefined();
  });

  it("should fail with exit code 1 if database does not exist", async () => {
    const result = await executeDoctorCommand(
      { portability: true },
      { healthOverrides: { dbPath: join(testDir, "nonexistent.db") } }
    );
    expect(result.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("Database does not exist");
  });

  it("should output JSON error if database does not exist in JSON mode", async () => {
    const result = await executeDoctorCommand(
      { portability: true, json: true },
      { healthOverrides: { dbPath: join(testDir, "nonexistent.db") } }
    );
    expect(result.exitCode).toBe(1);
    const output = JSON.parse(consoleOutput.join("\n"));
    expect(output.error).toContain("Database does not exist");
  });

  it("should succeed with exit code 0 when all portability checks pass", async () => {
    // Initialize empty DB
    const { db } = initializeDatabase({ path: testDbPath });
    // Seed standard path appropriate for host OS
    const isWin = process.platform === "win32";
    const pathOnDisk = isWin ? join(testDir, "my-proj") : join(testDir, "my-proj");
    mkdirSync(pathOnDisk, { recursive: true });

    createTestSession(db, "session-1", pathOnDisk, "2026-01-20T10:00:00Z");
    closeDatabase(db);

    const result = await executeDoctorCommand(
      { portability: true },
      { healthOverrides: { dbPath: testDbPath, sourceDir: testDir } }
    );

    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Path Dialects: No mixed path slashes");
    expect(out).toContain("Orphaned Workspaces: All session folders exist");
    expect(out).toContain("Active Locks: No stale sync/embedding lock files");
  });

  it("should fail and warn if mixed path dialects are present", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    // If Windows: seed Unix path. If Unix: seed Windows path.
    const isWin = process.platform === "win32";
    const mixedPath = isWin ? "/mnt/c/Users/Test/Projects/mixed" : "C:\\Users\\Test\\Projects\\mixed";

    // Simulate directory presence on disk to isolate the dialect scan from the orphan scan
    // (i.e. resolveExistingPath should resolve it correctly)
    const resolvedPath = isWin ? "C:\\Users\\Test\\Projects\\mixed" : "/mnt/c/Users/Test/Projects/mixed";
    // We cannot create physical paths for absolute drive roots easily on Unix, but let's mock it
    // Or let's just assert that it is detected as mixed!
    createTestSession(db, "session-1", mixedPath, "2026-01-20T10:00:00Z");
    closeDatabase(db);

    const result = await executeDoctorCommand(
      { portability: true },
      { healthOverrides: { dbPath: testDbPath, sourceDir: testDir } }
    );

    expect(result.exitCode).toBe(1);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Path Dialects: 1 mixed slash/drive formats detected");
    expect(out).toContain(mixedPath);
  });

  it("should fail and warn if orphaned workspaces are present and display the tip box", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    const deadPath = join(testDir, "nonexistent-workspace");
    createTestSession(db, "session-1", deadPath, "2026-01-20T10:00:00Z");
    closeDatabase(db);

    const result = await executeDoctorCommand(
      { portability: true },
      { healthOverrides: { dbPath: testDbPath, sourceDir: testDir } }
    );

    expect(result.exitCode).toBe(1);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Orphaned Workspaces: 1 project folder(s) not found");
    expect(out).toContain(deadPath);
    expect(out).toContain("💡 [TIP] Orphaned project paths detected");
  });

  it("should fail and warn if stale embedding locks are found", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    const livePath = join(testDir, "live-proj");
    mkdirSync(livePath, { recursive: true });
    createTestSession(db, "session-1", livePath, "2026-01-20T10:00:00Z");
    closeDatabase(db);

    // Write a stale lock file with invalid/dead process PID (999999 is dead)
    const lockPath = join(testDir, "embedding.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 999999, startedAt: new Date().toISOString() }));

    const result = await executeDoctorCommand(
      { portability: true },
      { healthOverrides: { dbPath: testDbPath, sourceDir: testDir } }
    );

    expect(result.exitCode).toBe(1);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Active Locks: 1 stale sync/embedding lock file(s) found");
    expect(out).toContain(lockPath);
    expect(existsSync(lockPath)).toBe(true); // check it was not deleted
  });

  it("should automatically clean up stale locks if --fix is provided", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    const livePath = join(testDir, "live-proj");
    mkdirSync(livePath, { recursive: true });
    createTestSession(db, "session-1", livePath, "2026-01-20T10:00:00Z");
    closeDatabase(db);

    // Write a stale lock file
    const lockPath = join(testDir, "embedding.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 999999 }));

    const result = await executeDoctorCommand(
      { portability: true, fix: true },
      { healthOverrides: { dbPath: testDbPath, sourceDir: testDir } }
    );

    // Exit code becomes 0 because the only failure was the stale lock and it was fixed!
    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Active Locks: Cleaned up 1 stale lock file(s)");
    expect(existsSync(lockPath)).toBe(false); // verified lock file is deleted!
  });

  it("should output valid structured JSON in JSON mode", async () => {
    const { db } = initializeDatabase({ path: testDbPath });
    const deadPath = join(testDir, "nonexistent-workspace");
    createTestSession(db, "session-1", deadPath, "2026-01-20T10:00:00Z");
    closeDatabase(db);

    const result = await executeDoctorCommand(
      { portability: true, json: true },
      { healthOverrides: { dbPath: testDbPath, sourceDir: testDir } }
    );

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(consoleOutput.join("\n"));
    expect(output.portability).toBeDefined();
    expect(output.portability.orphanedPaths).toEqual([deadPath]);
    expect(output.portability.mixedDialectPaths).toEqual([]);
    expect(output.portability.staleLocks).toEqual([]);
    expect(output.portability.sqliteVecAvailable).toBeDefined();
  });
});
