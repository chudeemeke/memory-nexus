import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Fact } from "../../../domain/entities/fact.js";
import { createSchema } from "../../../infrastructure/database/schema.js";
import { SqliteFactRepository } from "../../../infrastructure/database/repositories/fact-repository.js";
import { SqliteDreamRepository } from "../../../infrastructure/database/repositories/dream-repository.js";
import { SqliteMemoryGovernanceRepository } from "../../../infrastructure/database/repositories/memory-governance-repository.js";
import { createDreamCommand, executeDreamCommand } from "./dream.js";

describe("Dream CLI Command", () => {
  let dbPath: string;
  let sequence: number;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `memory-dream-cli-${Math.random().toString(36).slice(2)}.db`);
    sequence = 0;
    const db = openTestDb();
    const factRepo = new SqliteFactRepository(db);
    await factRepo.save(Fact.create({
      uuid: "fact-provider-old",
      type: "decision",
      project: "memory-nexus",
      content: "Provider health checks enumerate three providers directly.",
      observedAt: new Date("2026-06-07T07:00:00Z"),
    }));
    db.close();
  });

  afterEach(() => {
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    } catch {
      // Windows can briefly retain SQLite handles; temp names are unique.
    }
  });

  test("createDreamCommand registers manual dreaming workflow subcommands", () => {
    const command = createDreamCommand();

    expect(command.name()).toBe("dream");
    expect(command.commands.map((sub) => sub.name())).toEqual([
      "propose-supersedence",
      "list",
      "show",
      "approve",
      "reject",
      "apply",
      "rollback",
    ]);
    expect(command.commands.find((sub) => sub.name() === "apply")?.options.some((option) => option.long === "--confirm")).toBe(true);
  });

  test("createDreamCommand parses subcommands through isolated command dependencies", async () => {
    const proposed = await runDreamCli([
      "propose-supersedence",
      "--project",
      "memory-nexus",
      "--target",
      "fact-provider-old",
      "--source-event",
      "evt-provider-old",
      "evt-provider-new",
      "--replacement",
      "Provider registry uses capability metadata.",
      "--reason",
      "Supersedes the old hard-coded provider switch note.",
      "--type",
      "learning",
      "--confidence",
      "0.7",
      "--json",
    ]);
    const proposalId = JSON.parse(proposed.logs[0]).data.dream_id as string;
    const listed = await runDreamCli(["list", "--status", "pending_review", "--kind", "supersedence_proposal", "--limit", "1", "--json"]);
    const shown = await runDreamCli(["show", proposalId, "--json"]);
    const approved = await runDreamCli(["approve", proposalId, "--json"]);
    const applied = await runDreamCli(["apply", proposalId, "--confirm", "--json"]);
    const rolledBack = await runDreamCli(["rollback", proposalId, "--confirm", "--json"]);

    expect(proposed.result.exitCode).toBe(0);
    expect(JSON.parse(proposed.logs[0]).data.proposed_fact.type).toBe("learning");
    expect(listed.result.exitCode).toBe(0);
    expect(JSON.parse(listed.logs[0]).data).toHaveLength(1);
    expect(JSON.parse(shown.logs[0]).data.dream_id).toBe(proposalId);
    expect(JSON.parse(approved.logs[0]).data.status).toBe("approved");
    expect(JSON.parse(applied.logs[0]).data.entry.status).toBe("applied");
    expect(JSON.parse(rolledBack.logs[0]).data.entry.status).toBe("rolled_back");
  });

  test("propose-supersedence emits stable JSON and registers governance", async () => {
    const output = await captureConsole(() => executeDreamCommand({
      action: "propose-supersedence",
      project: "memory-nexus",
      targetFactUuid: "fact-provider-old",
      sourceEventIds: ["evt-provider-old", "evt-provider-new"],
      proposedContent: "Provider registry uses capability metadata and masks sk-ant-123456789012345678901234.",
      reason: "Supersedes the old hard-coded provider switch note.",
      confidence: 0.91,
      json: true,
    }, testDeps()));
    const parsed = JSON.parse(output.logs[0]);
    const { entries, governance } = await readDreamState(parsed.data.dream_id);

    expect(output.result.exitCode).toBe(0);
    expect(parsed.status).toBe("success");
    expect(parsed.data.schema_version).toBe(1);
    expect(parsed.data.status).toBe("pending_review");
    expect(parsed.data.auto_promoted).toBe(false);
    expect(parsed.data.proposed_fact.content).not.toContain("sk-ant");
    expect(entries).toHaveLength(1);
    expect(governance?.surface).toBe("dream");
  });

  test("list and show expose dream review state in text output", async () => {
    const proposalId = await createProposal();

    const list = await captureConsole(() => executeDreamCommand({
      action: "list",
      project: "memory-nexus",
    }, testDeps()));
    const show = await captureConsole(() => executeDreamCommand({
      action: "show",
      dreamId: proposalId,
    }, testDeps()));

    expect(list.result.exitCode).toBe(0);
    expect(list.logs.join("\n")).toContain("pending_review");
    expect(show.result.exitCode).toBe(0);
    expect(show.logs.join("\n")).toContain(`Dream: ${proposalId}`);
    expect(show.logs.join("\n")).toContain("Rollback event: dream.rollback");
  });

  test("approve, apply, and rollback require explicit confirmation for mutation steps", async () => {
    const proposalId = await createProposal();
    const approved = await captureConsole(() => executeDreamCommand({
      action: "approve",
      dreamId: proposalId,
      json: true,
    }, testDeps()));
    const unconfirmedApply = await captureConsole(() => executeDreamCommand({
      action: "apply",
      dreamId: proposalId,
      json: true,
    }, testDeps()));
    const applied = await captureConsole(() => executeDreamCommand({
      action: "apply",
      dreamId: proposalId,
      confirm: true,
      json: true,
    }, testDeps()));
    const unconfirmedRollback = await captureConsole(() => executeDreamCommand({
      action: "rollback",
      dreamId: proposalId,
      json: true,
    }, testDeps()));
    const rolledBack = await captureConsole(() => executeDreamCommand({
      action: "rollback",
      dreamId: proposalId,
      confirm: true,
      json: true,
    }, testDeps()));

    expect(approved.result.exitCode).toBe(0);
    expect(JSON.parse(approved.logs[0]).data.status).toBe("approved");
    expect(unconfirmedApply.result.exitCode).toBe(2);
    expect(JSON.parse(unconfirmedApply.logs[0]).error.message).toContain("confirm");
    expect(applied.result.exitCode).toBe(0);
    expect(JSON.parse(applied.logs[0]).data.entry.status).toBe("applied");
    expect(unconfirmedRollback.result.exitCode).toBe(2);
    expect(JSON.parse(unconfirmedRollback.logs[0]).error.message).toContain("confirm");
    expect(rolledBack.result.exitCode).toBe(0);
    expect(JSON.parse(rolledBack.logs[0]).data.entry.status).toBe("rolled_back");
  });

  test("reject moves proposal out of pending review", async () => {
    const proposalId = await createProposal();
    const rejected = await captureConsole(() => executeDreamCommand({
      action: "reject",
      dreamId: proposalId,
      json: true,
    }, testDeps()));

    expect(rejected.result.exitCode).toBe(0);
    expect(JSON.parse(rejected.logs[0]).data.status).toBe("rejected");
  });

  test("reports missing dream proposals through the command contract", async () => {
    const output = await captureConsole(() => executeDreamCommand({
      action: "show",
      dreamId: "missing",
      json: true,
    }, testDeps()));
    const parsed = JSON.parse(output.logs[0]);

    expect(output.result.exitCode).toBe(1);
    expect(parsed.error.code).toBe("NOT_FOUND");
  });

  test("reports empty lists and mutation results in human-readable text", async () => {
    const empty = await captureConsole(() => executeDreamCommand({
      action: "list",
      project: "memory-nexus",
    }, testDeps()));
    const proposalId = await createProposal();
    await captureConsole(() => executeDreamCommand({ action: "approve", dreamId: proposalId }, testDeps()));

    const applied = await captureConsole(() => executeDreamCommand({
      action: "apply",
      dreamId: proposalId,
      confirm: true,
    }, testDeps()));
    const rolledBack = await captureConsole(() => executeDreamCommand({
      action: "rollback",
      dreamId: proposalId,
      confirm: true,
    }, testDeps()));

    expect(empty.result.exitCode).toBe(0);
    expect(empty.logs).toEqual(["No dream proposals found."]);
    expect(applied.result.exitCode).toBe(0);
    expect(applied.logs.join("\n")).toContain(`Dream ${proposalId} applied.`);
    expect(applied.logs.join("\n")).toContain("Canonical events:");
    expect(rolledBack.result.exitCode).toBe(0);
    expect(rolledBack.logs.join("\n")).toContain(`Dream ${proposalId} rolled back.`);
    expect(rolledBack.logs.join("\n")).toContain("Rollback events:");
  });

  test("reports validation, unsupported actions, and connection errors through stable exits", async () => {
    const missingProject = await captureConsole(() => executeDreamCommand({
      action: "propose-supersedence",
      targetFactUuid: "fact-provider-old",
      sourceEventIds: ["evt-provider-old"],
      proposedContent: "Provider registry uses capability metadata.",
      reason: "Supersedes the old hard-coded provider switch note.",
      json: true,
    }, testDeps()));
    const missingSource = await captureConsole(() => executeDreamCommand({
      action: "propose-supersedence",
      project: "memory-nexus",
      targetFactUuid: "fact-provider-old",
      proposedContent: "Provider registry uses capability metadata.",
      reason: "Supersedes the old hard-coded provider switch note.",
    }, testDeps()));
    const unsupported = await captureConsole(() => executeDreamCommand({
      action: "unsupported" as "show",
      dreamId: "dream-id",
      json: true,
    }, testDeps()));
    const badConnection = await captureConsole(() => executeDreamCommand({
      action: "list",
      json: true,
    }, {
      dbPath: "\0",
    }));

    expect(missingProject.result.exitCode).toBe(2);
    expect(JSON.parse(missingProject.logs[0]).error.message).toContain("project");
    expect(missingSource.result.exitCode).toBe(2);
    expect(missingSource.errors.join("\n")).toContain("sourceEventIds");
    expect(unsupported.result.exitCode).toBe(2);
    expect(JSON.parse(unsupported.logs[0]).error.code).toBe("INVALID_ACTION");
    expect(badConnection.result.exitCode).toBe(1);
    expect(JSON.parse(badConnection.logs[0]).error.code).toBe("DB_CONNECTION_FAILED");
  });

  test("createDreamCommand rejects invalid numeric options before command execution", async () => {
    const invalidLimitZero = await runDreamCliParseError(["list", "--limit", "0"]);
    const invalidLimitNaN = await runDreamCliParseError(["list", "--limit", "not-a-number"]);
    const invalidConfidenceHigh = await runDreamCliParseError([
      "propose-supersedence",
      "--project",
      "memory-nexus",
      "--target",
      "fact-provider-old",
      "--source-event",
      "evt-provider-old",
      "--replacement",
      "Provider registry uses capability metadata.",
      "--reason",
      "Supersedes the old hard-coded provider switch note.",
      "--confidence",
      "2",
    ]);
    const invalidConfidenceLow = await runDreamCliParseError([
      "propose-supersedence",
      "--project",
      "memory-nexus",
      "--target",
      "fact-provider-old",
      "--source-event",
      "evt-provider-old",
      "--replacement",
      "Provider registry uses capability metadata.",
      "--reason",
      "Supersedes the old hard-coded provider switch note.",
      "--confidence",
      "-0.1",
    ]);
    const invalidConfidenceNaN = await runDreamCliParseError([
      "propose-supersedence",
      "--project",
      "memory-nexus",
      "--target",
      "fact-provider-old",
      "--source-event",
      "evt-provider-old",
      "--replacement",
      "Provider registry uses capability metadata.",
      "--reason",
      "Supersedes the old hard-coded provider switch note.",
      "--confidence",
      "not-a-number",
    ]);

    expect(invalidLimitZero.result.exitCode).toBe(1);
    expect(invalidLimitZero.result.error.message).toContain("positive integer");
    expect(invalidLimitNaN.result.exitCode).toBe(1);
    expect(invalidLimitNaN.result.error.message).toContain("positive integer");
    expect(invalidConfidenceHigh.result.exitCode).toBe(1);
    expect(invalidConfidenceHigh.result.error.message).toContain("between 0 and 1");
    expect(invalidConfidenceLow.result.exitCode).toBe(1);
    expect(invalidConfidenceLow.result.error.message).toContain("between 0 and 1");
    expect(invalidConfidenceNaN.result.exitCode).toBe(1);
    expect(invalidConfidenceNaN.result.error.message).toContain("between 0 and 1");
  });

  async function createProposal(): Promise<string> {
    const output = await captureConsole(() => executeDreamCommand({
      action: "propose-supersedence",
      project: "memory-nexus",
      targetFactUuid: "fact-provider-old",
      sourceEventIds: ["evt-provider-old", "evt-provider-new"],
      proposedContent: "Provider registry uses capability metadata.",
      reason: "Supersedes the old hard-coded provider switch note.",
      json: true,
    }, testDeps()));
    return JSON.parse(output.logs[0]).data.dream_id as string;
  }

  async function readDreamState(dreamId: string) {
    const db = openTestDb();
    try {
      const dreamRepo = new SqliteDreamRepository(db);
      const governanceRepo = new SqliteMemoryGovernanceRepository(db);
      return {
        entries: await dreamRepo.findAll({ project: "memory-nexus" }),
        governance: await governanceRepo.findByTarget("dream", dreamId),
      };
    } finally {
      db.close();
    }
  }

  function openTestDb(): Database {
    const db = new Database(dbPath);
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    return db;
  }

  function testDeps() {
    return {
      dbPath,
      writeEvents: false,
      now: () => new Date("2026-06-07T08:00:00Z"),
      nextSequence: () => ++sequence,
    };
  }

  async function runDreamCli(args: string[]) {
    return captureConsole(async () => {
      const command = createDreamCommand(testDeps());
      process.exitCode = undefined;
      await command.parseAsync(["node", "memory", ...args]);
      return { exitCode: Number(process.exitCode ?? 0) };
    });
  }

  async function runDreamCliParseError(args: string[]) {
    return captureConsole(async () => {
      const command = createDreamCommand(testDeps());
      command.exitOverride();
      command.configureOutput({
        writeErr: () => undefined,
        writeOut: () => undefined,
      });
      process.exitCode = undefined;
      try {
        await command.parseAsync(["node", "memory", ...args]);
        return { exitCode: Number(process.exitCode ?? 0), error: new Error("Expected parse failure") };
      } catch (error) {
        return {
          exitCode: typeof (error as { exitCode?: unknown }).exitCode === "number"
            ? (error as { exitCode: number }).exitCode
            : 1,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    });
  }
});

async function captureConsole<T extends { exitCode: number }>(fn: () => Promise<T>) {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalExitCode = process.exitCode;
  console.log = (...args) => { logs.push(args.map(String).join(" ")); };
  console.error = (...args) => { errors.push(args.map(String).join(" ")); };
  try {
    const result = await fn();
    return { result, logs, errors };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = originalExitCode;
  }
}
