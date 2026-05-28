/**
 * Facts CLI Command Tests
 *
 * [TDD-RED]
 * Verifies commander options parsing, active facts displaying, timeline lineage
 * reconstruction, and JSON/Text outputs for the facts CLI command.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as connectionModule from "../../../infrastructure/database/connection.js";
import { Command } from "commander";
import { Database } from "bun:sqlite";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createSchema } from "../../../infrastructure/database/schema.js";
import { Fact } from "../../../domain/entities/fact.js";
import { SqliteFactRepository } from "../../../infrastructure/database/repositories/fact-repository.js";
import { createFactsCommand, executeFactsCommand } from "./facts.js";

describe("Facts CLI Command", () => {
  let db: Database;
  let factRepo: SqliteFactRepository;
  let testDbPath: string;
  let testLogPath: string;

  beforeEach(() => {
    testDbPath = join(tmpdir(), `memory-nexus-cli-facts-db-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(testDbPath);
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);

    factRepo = new SqliteFactRepository(db);
  });

  afterEach(() => {
    db.close();
    try {
      if (existsSync(testDbPath)) unlinkSync(testDbPath);
    } catch {}
  });

  test("createFactsCommand registers commander properties correctly", () => {
    const cmd = createFactsCommand();
    expect(cmd.name()).toBe("facts");
    expect(cmd.description()).toContain("View active facts for a project");

    // Verify option registration
    expect(cmd.options.some(o => o.long === "--superseded")).toBe(true);
    expect(cmd.options.some(o => o.long === "--json")).toBe(true);
  });

  test("executeFactsCommand displays active facts in groups (text mode)", async () => {
    // 1. Save an active learning fact
    const fact1 = Fact.create({
      type: "learning",
      project: "nexus",
      content: "Active learning fact",
      observedAt: new Date("2026-05-23T08:00:00Z")
    });
    await factRepo.save(fact1);

    // 2. Save a superseded decision fact
    const fact2 = Fact.create({
      uuid: "old-uuid",
      type: "decision",
      project: "nexus",
      content: "Superseded decision fact",
      observedAt: new Date("2026-05-23T07:00:00Z"),
      supersededAt: new Date("2026-05-23T09:00:00Z"),
      supersededBy: "new-uuid"
    });
    await factRepo.save(fact2);

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    try {
      const result = await executeFactsCommand({
        project: "nexus"
      }, {
        dbPath: testDbPath
      });

      expect(result.exitCode).toBe(0);
      expect(consoleLogs.some(l => l.includes("Active Facts for Project: nexus"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("LEARNING"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("Active learning fact"))).toBe(true);
      // Superseded fact should NOT be visible!
      expect(consoleLogs.some(l => l.includes("Superseded decision fact"))).toBe(false);
    } finally {
      console.log = originalLog;
    }
  });

  test("executeFactsCommand displays superseded facts and timeline lineage when requested", async () => {
    const fact1 = Fact.create({
      uuid: "old-uuid",
      type: "learning",
      project: "nexus",
      content: "Old learning content",
      observedAt: new Date("2026-05-23T08:00:00Z"),
      supersededAt: new Date("2026-05-23T09:00:00Z"),
      supersededBy: "new-uuid"
    });
    await factRepo.save(fact1);

    const fact2 = Fact.create({
      uuid: "new-uuid",
      type: "learning",
      project: "nexus",
      content: "New replacement content",
      observedAt: new Date("2026-05-23T09:00:00Z")
    });
    await factRepo.save(fact2);

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    try {
      const result = await executeFactsCommand({
        project: "nexus",
        superseded: true
      }, {
        dbPath: testDbPath
      });

      expect(result.exitCode).toBe(0);
      expect(consoleLogs.some(l => l.includes("Old learning content"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("New replacement content"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("replaced by new-uuid"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test("executeFactsCommand outputs JSON with --json option", async () => {
    const fact = Fact.create({
      type: "preference",
      project: "nexus",
      content: "A preference",
      observedAt: new Date()
    });
    await factRepo.save(fact);

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    try {
      const result = await executeFactsCommand({
        project: "nexus",
        json: true
      }, {
        dbPath: testDbPath
      });

      expect(result.exitCode).toBe(0);
      const lastLog = consoleLogs[consoleLogs.length - 1];
      const parsed = JSON.parse(lastLog);
      expect(parsed.status).toBe("success");
      expect(parsed.data.length).toBe(1);
      expect(parsed.data[0].content).toBe("A preference");
    } finally {
      console.log = originalLog;
    }
  });

  test("createFactsCommand action parses arguments, executes, and sets process.exitCode", async () => {
    const fact = Fact.create({
      type: "preference",
      project: "nexus",
      content: "Commander action test preference",
      observedAt: new Date()
    });
    await factRepo.save(fact);

    const originalExitCode = process.exitCode;
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    const spy = spyOn(connectionModule, "getDefaultDbPath").mockReturnValue(testDbPath);
    try {
      const cmd = createFactsCommand();
      await cmd.parseAsync(["node", "memory", "nexus", "--json"]);

      const lastLog = consoleLogs[consoleLogs.length - 1];
      const parsed = JSON.parse(lastLog);
      expect(parsed.status).toBe("success");
      expect(parsed.data.some((f: any) => f.content === "Commander action test preference")).toBe(true);
      expect(process.exitCode).toBe(0);
    } finally {
      console.log = originalLog;
      process.exitCode = originalExitCode;
      spy.mockRestore();
    }
  });

  test("executeFactsCommand returns exitCode 1 on DB connection failure", async () => {
    const consoleErrors: string[] = [];
    const originalError = console.error;
    console.error = (msg) => consoleErrors.push(msg);

    const spy = spyOn(connectionModule, "initializeDatabase").mockImplementation(() => {
      throw new Error("Mock connection failure");
    });

    try {
      const result = await executeFactsCommand({
        project: "nexus"
      }, {
        dbPath: testDbPath
      });

      expect(result.exitCode).toBe(1);
      expect(consoleErrors.some(e => e.includes("Database connection failed"))).toBe(true);
    } finally {
      console.error = originalError;
      spy.mockRestore();
    }
  });

  test("executeFactsCommand returns exitCode 1 with JSON on DB connection failure", async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    const spy = spyOn(connectionModule, "initializeDatabase").mockImplementation(() => {
      throw new Error("Mock connection failure");
    });

    try {
      const result = await executeFactsCommand({
        project: "nexus",
        json: true
      }, {
        dbPath: testDbPath
      });

      expect(result.exitCode).toBe(1);
      const parsed = JSON.parse(consoleLogs[0]);
      expect(parsed.status).toBe("error");
      expect(parsed.error.code).toBe("DB_CONNECTION_FAILED");
    } finally {
      console.log = originalLog;
      spy.mockRestore();
    }
  });

  test("executeFactsCommand handles zero active facts found", async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    try {
      const result = await executeFactsCommand({
        project: "nonexistent-project"
      }, {
        dbPath: testDbPath
      });

      expect(result.exitCode).toBe(0);
      expect(consoleLogs.some(l => l.includes("No active facts found for this project."))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test("executeFactsCommand handles zero historical facts found", async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    try {
      const result = await executeFactsCommand({
        project: "nonexistent-project",
        superseded: true
      }, {
        dbPath: testDbPath
      });

      expect(result.exitCode).toBe(0);
      expect(consoleLogs.some(l => l.includes("No facts history found for this project."))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test("executeFactsCommand returns exitCode 2 on query failure", async () => {
    const consoleErrors: string[] = [];
    const originalError = console.error;
    console.error = (msg) => consoleErrors.push(msg);

    const spy = spyOn(SqliteFactRepository.prototype, "findByProject").mockImplementation(() => {
      throw new Error("Mock query error");
    });

    try {
      const result = await executeFactsCommand({
        project: "nexus"
      }, {
        dbPath: testDbPath
      });

      expect(result.exitCode).toBe(2);
      expect(consoleErrors.some(e => e.includes("Facts query execution failed"))).toBe(true);
    } finally {
      console.error = originalError;
      spy.mockRestore();
    }
  }, 15000);

  test("executeFactsCommand returns exitCode 2 with JSON on query failure", async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    const spy = spyOn(SqliteFactRepository.prototype, "findByProject").mockImplementation(() => {
      throw new Error("Mock query error");
    });

    try {
      const result = await executeFactsCommand({
        project: "nexus",
        json: true
      }, {
        dbPath: testDbPath
      });

      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(consoleLogs[0]);
      expect(parsed.status).toBe("error");
      expect(parsed.error.code).toBe("UNEXPECTED_ERROR");
    } finally {
      console.log = originalLog;
      spy.mockRestore();
    }
  }, 15000);
});
