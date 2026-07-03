/**
 * Projections command tests.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createProjectionsCommand,
  executeProjectionsRebuildCommand,
} from "./projections.js";

describe("projections command", () => {
  let testDir: string;
  let dbPath: string;
  let eventsDir: string;
  let consoleOutput: string[];
  let consoleErrorOutput: string[];
  const originalLog = console.log;
  const originalError = console.error;

  beforeEach(() => {
    testDir = join(tmpdir(), `memory-projections-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    dbPath = join(testDir, "memory.db");
    eventsDir = join(testDir, "events");
    mkdirSync(eventsDir, { recursive: true });
    writeFileSync(join(eventsDir, "events-local.jsonl"), `${JSON.stringify({
      uuid: "projection-fact-1",
      type: "decision",
      project: "memory-nexus",
      content: "Projection rebuilds replay canonical event logs.",
      observedAt: "2026-07-01T21:00:00.000Z",
    })}\n`);

    consoleOutput = [];
    consoleErrorOutput = [];
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
      rmSync(testDir, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
    } catch {
      // Best-effort cleanup on Windows; SQLite can release handles late.
    }
  });

  it("registers rebuild with verify and confirm safety options", () => {
    const command = createProjectionsCommand();
    expect(command.name()).toBe("projections");
    const rebuild = command.commands.find((subcommand) => subcommand.name() === "rebuild");
    expect(rebuild).toBeDefined();
    expect(rebuild?.options.some((option) => option.long === "--verify")).toBe(true);
    expect(rebuild?.options.some((option) => option.long === "--confirm")).toBe(true);
    expect(rebuild?.options.some((option) => option.long === "--json")).toBe(true);
  });

  it("executes the commander action handler", async () => {
    const originalExitCode = process.exitCode;
    try {
      const command = createProjectionsCommand({ dbPathOverride: dbPath, eventsDirOverride: eventsDir });
      await command.parseAsync(["node", "memory", "rebuild", "--verify", "--json"]);
      expect(process.exitCode).toBe(0);
      expect(JSON.parse(consoleOutput.join("\n")).data.mode).toBe("verify");
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("verifies event-log readiness without creating or mutating the database", async () => {
    const result = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsDir },
      { verify: true, json: true },
    );

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.command).toBe("projections.rebuild");
    expect(parsed.data.mode).toBe("verify");
    expect(parsed.data.events).toBe(1);
    expect(parsed.data.invalidEvents).toBe(0);
    expect(existsSync(dbPath)).toBe(false);
  });

  it("prints text verification success", async () => {
    const result = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsDir },
      { verify: true },
    );

    expect(result.exitCode).toBe(0);
    expect(consoleOutput.join("\n")).toContain("Projection rebuild verification passed");
  });

  it("reports invalid event-log lines during verify", async () => {
    writeFileSync(join(eventsDir, "events-bad.jsonl"), "not json\n");

    const result = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsDir },
      { verify: true, json: true },
    );

    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("error");
    expect(parsed.data.invalidEvents).toBe(1);
    expect(parsed.errors.length).toBe(1);
  });

  it("prints text verification failure for invalid event logs", async () => {
    writeFileSync(join(eventsDir, "events-bad.jsonl"), "not json\n");

    const result = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsDir },
      { verify: true },
    );

    expect(result.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("verification failed");
  });

  it("refuses projection rebuild mutation without --confirm", async () => {
    const result = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsDir },
      { json: true },
    );

    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("not_ready");
    expect(parsed.errors[0]).toContain("requires --verify");
    expect(existsSync(dbPath)).toBe(false);
  });

  it("prints text no-confirm guard", async () => {
    const result = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsDir },
      {},
    );

    expect(result.exitCode).toBe(2);
    expect(consoleErrorOutput.join("\n")).toContain("requires --verify");
  });

  it("rebuilds projections from the canonical event log with --confirm", async () => {
    const result = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsDir },
      { confirm: true, json: true },
    );

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("ok");
    expect(parsed.data.mode).toBe("rebuild");
    expect(parsed.data.processedEvents).toBe(1);
    expect(parsed.data.appliedProjections).toContain("facts");

    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM facts WHERE uuid = 'projection-fact-1'").get();
      expect(row?.count).toBe(1);
    } finally {
      db.close();
    }
  });

  it("prints text rebuild success", async () => {
    const result = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsDir },
      { confirm: true },
    );

    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Projection rebuild completed");
    expect(out).toContain("Applied projections");
  });

  it("prints none when a confirmed rebuild has no applicable projection events", async () => {
    rmSync(join(eventsDir, "events-local.jsonl"), { force: true });

    const result = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsDir },
      { confirm: true },
    );

    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Projection rebuild completed");
    expect(out).toContain("Applied projections: none");
  });

  it("reports invalid events after confirmed rebuild", async () => {
    writeFileSync(join(eventsDir, "events-bad.jsonl"), "not json\n");

    const result = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsDir },
      { confirm: true, json: true },
    );

    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("error");
    expect(parsed.data.invalidEvents).toBe(1);
  });

  it("prints invalid event count after confirmed rebuild in text mode", async () => {
    writeFileSync(join(eventsDir, "events-bad.jsonl"), "not json\n");

    const result = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsDir },
      { confirm: true },
    );

    expect(result.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("completed with 1 invalid event log line");
  });

  it("reports rebuild exceptions in JSON and text modes", async () => {
    const eventsFile = join(testDir, "events-file");
    writeFileSync(eventsFile, "not a directory");

    const jsonResult = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsFile },
      { verify: true, json: true },
    );
    expect(jsonResult.exitCode).toBe(1);
    expect(JSON.parse(consoleOutput.join("\n")).errors[0]).toContain("Error rebuilding projections");

    consoleOutput = [];
    const textResult = await executeProjectionsRebuildCommand(
      { dbPathOverride: dbPath, eventsDirOverride: eventsFile },
      { verify: true },
    );
    expect(textResult.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("Error rebuilding projections");
  });
});
