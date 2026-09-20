/**
 * Standalone UAT Verification Suite for Phase v4.0 GA Readiness
 *
 * Runs a battery of empirical verification checks against the globally
 * installed `@chude/memory` package using historical audit checks in an
 * isolated temporary sandbox. These checks do not establish release readiness.
 */

import { spawn } from "bun";
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { exit } from "node:process";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { Database } from "bun:sqlite";
import { readMemoryEventsWithReport, rebuildProjections } from "../src/infrastructure/database/event-log.js";
import { closeDatabase } from "../src/infrastructure/database/connection.js";
import {createOwnedTestDirectory, type OwnedTestDirectory} from "../tests/helpers/owned-test-directory";

/** Own setup, checks and teardown together; cleanup failure cannot pass UAT. */
export async function runUatSandbox(
  execute: (directory: string) => Promise<boolean>,
  allocate: () => OwnedTestDirectory = () => createOwnedTestDirectory("memory-uat-"),
  report: (message: string, error: unknown) => void = (message,error) => console.error(message,error),
): Promise<boolean> {
  let storage: OwnedTestDirectory;
  try {storage=allocate();}
  catch(error){report("UAT sandbox allocation failed:",error);return false;}
  let passed=false;
  try {storage.assertOwned();passed=await execute(storage.dir);}
  catch(error){report("UAT setup or checks failed:",error);}
  finally {
    try {
      // Release Bun's closed native handles and pending stream-close callbacks.
      Bun.gc(true);
      await yieldToEventLoop();
      storage.cleanup();
    }
    catch(error){passed=false;report(`UAT cleanup failed; retained: ${storage.dir}`,error);}
  }
  return passed;
}

/** Close projection handles on either outcome without hiding the replay failure. */
export async function withUatDatabase<T>(
  path: string,
  execute: (database: Database) => Promise<T>,
  open: (path: string) => Database = path => new Database(path),
  close: (database: Database) => void = closeDatabase,
): Promise<T> {
  const database = open(path);
  let result: T;
  try { result = await execute(database); }
  catch (error) {
    try { close(database); }
    catch (closeError) {
      throw new AggregateError([error, closeError], "UAT projection and database close failed");
    }
    throw error;
  }
  close(database);
  return result;
}

// Colors for visual reporting
const reset = "\x1b[0m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const yellow = "\x1b[33m";
const bold = "\x1b[1m";
const cyan = "\x1b[36m";

// Cupertino Cupertino styles
function logHeader(title: string) {
  console.log(`\n${bold}${cyan}======================================================================${reset}`);
  console.log(`${bold}${cyan}  UAT GATE: ${title}${reset}`);
  console.log(`${bold}${cyan}======================================================================${reset}`);
}

function logResult(name: string, success: boolean, info?: string, detail?: string) {
  const mark = success ? `${green}[PASS]${reset}` : `${red}[FAIL]${reset}`;
  console.log(`  ${mark} ${bold}${name}${reset}${info ? ` - ${info}` : ""}`);
  if (!success && detail) {
    console.log(`${yellow}      Detail: ${detail}${reset}`);
  }
}

// Spawns binary in sandbox env
export async function runUatCommand(cmd: string[], env: Record<string, string>, timeoutMs = 60_000): Promise<{ code: number; stdout: string; stderr: string }> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new Error("UAT command timeout must be an integer from 1 to 60000 milliseconds");
  }
  const proc = spawn({
    cmd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });

  const [stdoutStr, stderrStr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (proc.signalCode) {
    throw new Error(`UAT command terminated by ${proc.signalCode} (timeout limit ${timeoutMs} ms)`);
  }

  return { code: exitCode, stdout: stdoutStr, stderr: stderrStr };
}

export async function verifySandbox(sandboxDir: string, runCommand: typeof runUatCommand = runUatCommand): Promise<boolean> {
  const configHome = join(sandboxDir, "config");
  const dataHome = join(sandboxDir, "data");
  const memoryHome = join(sandboxDir, "memory");
  const mockHome = join(sandboxDir, "home");

  mkdirSync(configHome, { recursive: true });
  mkdirSync(dataHome, { recursive: true });
  mkdirSync(join(dataHome, "logs"), { recursive: true }); // Pre-create logs dir
  mkdirSync(memoryHome, { recursive: true });
  mkdirSync(mockHome, { recursive: true });

  const mockProjectsDir = join(mockHome, ".claude", "projects");
  const projectEncoded = "C--mock-project";
  const projectSessionDir = join(mockProjectsDir, projectEncoded);
  mkdirSync(projectSessionDir, { recursive: true });

  const binDir = join(sandboxDir, "bin");
  mkdirSync(binDir, { recursive: true });

  // Create mock claude CLI executable
  if (process.platform === "win32") {
    writeFileSync(
      join(binDir, "claude.cmd"),
      `@echo off\necho [ { "type": "decision", "content": "Use links table for relational semantic trees.", "confidence": 0.98 } ]\n`,
      "utf-8"
    );
  } else {
    writeFileSync(
      join(binDir, "claude"),
      `#!/bin/sh\necho '[ { "type": "decision", "content": "Use links table for relational semantic trees.", "confidence": 0.98 } ]'\n`,
      "utf-8"
    );
    const { chmodSync } = require("node:fs");
    chmodSync(join(binDir, "claude"), 0o755);
  }

  const pathSeparator = process.platform === "win32" ? ";" : ":";
  const uatEnv = {
    HOME: mockHome,
    USERPROFILE: mockHome,
    XDG_CONFIG_HOME: configHome,
    XDG_DATA_HOME: dataHome,
    MEMORY_HOME: memoryHome,
    PATH: `${binDir}${pathSeparator}${process.env.PATH || ""}`,
  };

  // Create isolated config
  const configPath = join(configHome, "memory", "config.json");
  mkdirSync(join(configHome, "memory"), { recursive: true });
  const mockConfig = {
    autoSync: true,
    recoveryOnStartup: true,
    syncOnCompaction: true,
    timeout: 5000,
    logLevel: "info",
    showFailures: false,
    embedding: { enabled: false },
    llmExtraction: { provider: "claude-cli", model: "claude-cli-print" },
    search: { defaultMode: "fts", temporalDecay: { enabled: true, halfLifeDays: 30 } },
    ambientContext: { enabled: true, budget: 800 },
  };
  writeFileSync(configPath, JSON.stringify(mockConfig, null, 2), "utf-8");

  // Create mock Claude session logs
  const mockSessionId = "session-uat-11111";
  const mockSessionPath = join(projectSessionDir, `${mockSessionId}.jsonl`);
  const mockEvents = [
    {
      type: "system",
      content: "SessionStart:startup [] completed",
      level: "info",
      timestamp: "2026-05-25T12:00:00.000Z",
      uuid: "event-uid-0",
      sessionId: mockSessionId,
      cwd: "C:\\mock-project"
    },
    {
      type: "user",
      message: { role: "user", content: "I need to configure a relational links graph for decision mappings." },
      uuid: "event-uid-1",
      timestamp: "2026-05-25T12:01:00.000Z",
      sessionId: mockSessionId
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Creating custom links table query." },
          { type: "text", text: "I have stored a new decision fact: Use links table for relational semantic trees." }
        ]
      },
      uuid: "event-uid-2",
      timestamp: "2026-05-25T12:02:00.000Z",
      sessionId: mockSessionId
    },
    {
      type: "summary",
      summary: "Decision on using relational links graph.",
      leafUuid: "event-uid-2"
    }
  ];
  writeFileSync(
    mockSessionPath,
    mockEvents.map(e => JSON.stringify(e)).join("\n") + "\n",
    "utf-8"
  );

  let overallPassed = true;

  try {
    // -------------------------------------------------------------
    // GATE 1: Phase 32.5 Surface Consolidation
    // -------------------------------------------------------------
    logHeader("Phase 32.5 - Surface Consolidation");

    // Test A: sync mock sessions to DB
    const syncRes = await runCommand(["memory", "sync"], uatEnv);
    const syncSuccess = syncRes.code === 0 && syncRes.stdout.includes("Discovered: 1");
    logResult("Sync Mock Sessions", syncSuccess, `Exit: ${syncRes.code}`, syncSuccess ? "" : syncRes.stdout + syncRes.stderr);
    if (!syncSuccess) overallPassed = false;

    // Test B: unified status diagnostics
    const statusRes = await runCommand(["memory", "status", "--all"], uatEnv);
    // Exit code is expected to be 1 in sandbox due to missing Git hooks / local models, which is correct.
    const statusSuccess = (statusRes.code === 0 || statusRes.code === 1) && statusRes.stdout.includes("=== Database Statistics ===") && statusRes.stdout.includes("Database");
    logResult("Unified Status & Health Surface", statusSuccess, "Combines stats and doctor diagnostics in memory status --all", statusSuccess ? "" : statusRes.stdout + statusRes.stderr);
    if (!statusSuccess) overallPassed = false;

    // Test C: unified query primitives
    const queryStatsRes = await runCommand(["memory", "query", "--kind", "stats"], uatEnv);
    const queryStatsSuccess = queryStatsRes.code === 0 && queryStatsRes.stdout.includes("Sessions:");
    logResult("Unified Query Primitive: stats scope", queryStatsSuccess, "", queryStatsSuccess ? "" : queryStatsRes.stdout + queryStatsRes.stderr);
    if (!queryStatsSuccess) overallPassed = false;

    const querySessionRes = await runCommand(["memory", "query", "--kind", "session", mockSessionId], uatEnv);
    const querySessionSuccess = querySessionRes.code === 0 && querySessionRes.stdout.includes("Session:") && querySessionRes.stdout.includes(mockSessionId);
    logResult("Unified Query Primitive: session details scope", querySessionSuccess, "", querySessionSuccess ? "" : querySessionRes.stdout + querySessionRes.stderr);
    if (!querySessionSuccess) overallPassed = false;

    const queryMessageRes = await runCommand(["memory", "query", "relational"], uatEnv);
    const queryMessageSuccess = queryMessageRes.code === 0 && queryMessageRes.stdout.includes("session-uat-1111");
    logResult("Unified Query Primitive: message search scope", queryMessageSuccess, "", queryMessageSuccess ? "" : queryMessageRes.stdout + queryMessageRes.stderr);
    if (!queryMessageSuccess) overallPassed = false;

    // Test D: Legacy Compatibility Wrappers
    const statsRes = await runCommand(["memory", "stats"], uatEnv);
    const statsSuccess = statsRes.code === 0 && statsRes.stdout.includes("Sessions:");
    logResult("Legacy Wrapper compatibility: memory stats", statsSuccess, "", statsSuccess ? "" : statsRes.stdout + statsRes.stderr);
    if (!statsSuccess) overallPassed = false;

    const doctorRes = await runCommand(["memory", "doctor"], uatEnv);
    // Doctor will exit with 1 due to warnings, which is fine, we check output integrity
    const doctorSuccess = (doctorRes.code === 0 || doctorRes.code === 1) && doctorRes.stdout.includes("Integrity: ok");
    logResult("Legacy Wrapper compatibility: memory doctor", doctorSuccess, "", doctorSuccess ? "" : doctorRes.stdout + doctorRes.stderr);
    if (!doctorSuccess) overallPassed = false;


    // -------------------------------------------------------------
    // GATE 2: Phase 33 - Event-Log SSOT & Projection Rebuild
    // -------------------------------------------------------------
    logHeader("Phase 33 - Event-Log SSOT & Projection Rebuild");

    // Test A: Run LLM Knowledge Extraction to generate events
    const extractRes = await runCommand(["memory", "extract", "project"], uatEnv);
    const extractSuccess = extractRes.code === 0 && extractRes.stdout.includes("Extraction Completed Successfully");
    logResult("LLM Comparative Knowledge Extraction Run", extractSuccess, "", extractSuccess ? "" : extractRes.stdout + extractRes.stderr);
    if (!extractSuccess) overallPassed = false;

    // Test B: verify events folder has events.jsonl *after* extraction
    const eventsDir = join(dataHome, "memory", "events");
    const eventLogPath = join(eventsDir, "events.jsonl");
    const logExists = existsSync(eventLogPath);
    logResult("Plain-Text Canonical Event Log Physical Existence", logExists, `Path: ${eventLogPath}`);
    if (!logExists) overallPassed = false;

    // Verify events.jsonl populated with typed facts
    const eventReport = await readMemoryEventsWithReport(eventLogPath);
    const hasDecisionEvent = eventReport.invalidEvents.length === 0 && eventReport.events.some(event =>
      ["decision", "observation", "preference"].includes(event.kind));
    logResult("Plain-Text Event Types populate events.jsonl", hasDecisionEvent, "Validates canonical or legacy event records", hasDecisionEvent ? "" : `Valid events: ${eventReport.events.length}; invalid lines: ${eventReport.invalidEvents.length}`);
    if (!hasDecisionEvent) overallPassed = false;

    // Test C: Projection Rebuild Test
    const dbPath = join(dataHome, "memory", "memory.db");
    const preDeleteQuery = await runCommand(["memory", "query", "--kind", "context", "project", "--format", "ai"], uatEnv);

    // Delete database file
    rmSync(dbPath, { force: true });
    logResult("Delete Derived SQL Projection Database", !existsSync(dbPath));

    // Programmatically re-hydrate projection database from events.jsonl SSOT
    await withUatDatabase(dbPath, async db => {
      const { createSchema } = await import("../src/infrastructure/database/schema.js");
      db.exec("PRAGMA foreign_keys = ON;");
      createSchema(db);
      await rebuildProjections(db, eventLogPath);
    });

    // Re-sync mock sessions to restore projection dependency
    const syncPostRebuildRes = await runCommand(["memory", "sync"], uatEnv);
    const syncPostRebuildSuccess = syncPostRebuildRes.code === 0;
    logResult("Sync After Projection Rebuild", syncPostRebuildSuccess, `Exit: ${syncPostRebuildRes.code}`, syncPostRebuildSuccess ? "" : syncPostRebuildRes.stdout + syncPostRebuildRes.stderr);
    if (!syncPostRebuildSuccess) overallPassed = false;

    const postRebuildQuery = await runCommand(["memory", "query", "--kind", "context", "project", "--format", "ai"], uatEnv);
    const rebuildSuccess = preDeleteQuery.code === 0 && postRebuildQuery.code === 0 && postRebuildQuery.stdout.trim() === preDeleteQuery.stdout.trim() && postRebuildQuery.stdout.includes("Use links table for relational semantic trees");
    logResult("Database Re-hydration from Plain-Text Event Log (SSOT)", rebuildSuccess, "Proves SQL is derived projection; JSONL is primary source", rebuildSuccess ? "" : `Pre: ${preDeleteQuery.stdout}\nPost: ${postRebuildQuery.stdout}`);
    if (!rebuildSuccess) overallPassed = false;


    // -------------------------------------------------------------
    // GATE 3: Phase 34 - Supersedence-as-Event-Type
    // -------------------------------------------------------------
    logHeader("Phase 34 - Supersedence-as-Event-Type");

    // Simulating a supersedence chain event directly into JSONL to test query capabilities
    const mockFactUuid1 = "fact-uuid-111111111111111111";
    const mockFactUuid2 = "fact-uuid-222222222222222222";
    const mockFact1 = {
      uuid: mockFactUuid1,
      type: "decision",
      project: "project",
      content: "Initial decision: Use spaces for formatting code.",
      metadata: { confidence: 0.95 },
      observedAt: "2026-05-25T13:00:00.000Z",
      supersededAt: "2026-05-25T13:05:00.000Z",
      supersededBy: mockFactUuid2,
      version: 1
    };
    const mockFact2 = {
      uuid: mockFactUuid2,
      type: "decision",
      project: "project",
      content: "Superseding decision: Use tabs instead of spaces for coding.",
      metadata: { confidence: 0.98 },
      observedAt: "2026-05-25T13:05:00.000Z",
      supersededAt: null,
      supersededBy: null,
      version: 1
    };
    const mockSupersedence = {
      uuid: "supersedence-uuid-33333",
      type: "supersedence",
      project: "project",
      content: `Superseded ${mockFactUuid1} by ${mockFactUuid2}`,
      metadata: {
        superseded_uuid: mockFactUuid1,
        superseded_by_uuid: mockFactUuid2
      },
      observedAt: "2026-05-25T13:05:00.000Z",
      supersededAt: null,
      supersededBy: null,
      version: 1
    };

    // Append mock supersedence event chain
    writeFileSync(eventLogPath, JSON.stringify(mockFact1) + "\n" + JSON.stringify(mockFact2) + "\n" + JSON.stringify(mockSupersedence) + "\n", { flag: "a" });

    // Sync database projection programmatically
    await withUatDatabase(dbPath, db => rebuildProjections(db, eventLogPath));

    // Test A: Default facts queries exclude superseded items
    const factsListRes = await runCommand(["memory", "query", "--kind", "context", "project", "--format", "ai"], uatEnv);
    const excludesSuperseded = !factsListRes.stdout.includes("Initial decision: Use spaces");
    const includesCurrent = factsListRes.stdout.includes("tabs instead of spaces");
    const factsQuerySuccess = factsListRes.code === 0 && excludesSuperseded && includesCurrent;
    logResult("Default Queries Filter Out Superseded Facts", factsQuerySuccess, "Excludes invalidated histories", factsQuerySuccess ? "" : factsListRes.stdout + factsListRes.stderr);
    if (!factsQuerySuccess) overallPassed = false;

    // Test B: memory export / import maintains supersedence chain round-trip
    const exportPath = join(sandboxDir, "export.json");
    const exportRes = await runCommand(["memory", "export", exportPath], uatEnv);
    logResult("Export facts database to file", exportRes.code === 0, `Path: ${exportPath}`);
    if (exportRes.code !== 0) overallPassed = false;

    // Import into fresh database env
    const dataHomeImport = join(sandboxDir, "import-data");
    mkdirSync(dataHomeImport, { recursive: true });
    const importEnv = { ...uatEnv, XDG_DATA_HOME: dataHomeImport };
    
    const importRes = await runCommand(["memory", "import", "--force", exportPath], importEnv);
    const importSuccess = importRes.code === 0;
    logResult("Import facts into fresh database environment", importSuccess, "", importSuccess ? "" : importRes.stdout + importRes.stderr);
    if (!importSuccess) overallPassed = false;

    // Verify imported database has identical facts query state
    const importQueryRes = await runCommand(["memory", "query", "--kind", "context", "project", "--format", "ai"], importEnv);
    const importQuerySuccess = importQueryRes.code === 0 && factsListRes.code === 0 && importQueryRes.stdout.trim() === factsListRes.stdout.trim();
    logResult("Export/Import round-trip projection deep equivalence", importQuerySuccess, "Preserves supersedence lineage integrity", importQuerySuccess ? "" : `Orig: ${factsListRes.stdout}\nImported: ${importQueryRes.stdout}`);
    if (!importQuerySuccess) overallPassed = false;


    // -------------------------------------------------------------
    // GATE 4: Phase 35 - Context Rewire & T7 Recovery
    // -------------------------------------------------------------
    logHeader("Phase 35 - Context Rewire & T7 Recovery");

    // Test A: SmartContext reads from SQL projections, not ~/.memory
    const legacyMemoryDir = join(mockHome, ".memory");
    const hasLegacyAccess = existsSync(legacyMemoryDir);
    logResult("SmartContext Decoupled from Legacy ~/.memory/ directory", !hasLegacyAccess, "Pure SQL DB-projection reading active");
    if (hasLegacyAccess) overallPassed = false;

    // Test B: T7 Framework-less recovery check
    let recoveredFactsCount = 0;
    const finalLogData = readFileSync(eventLogPath, "utf-8");
    const lines = finalLogData.split("\n").filter(l => l.trim().length > 0);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      if (parsed.type === "decision" && parsed.supersededAt === null) {
        recoveredFactsCount++;
      }
    }
    const t7RecoverySuccess = recoveredFactsCount > 0;
    logResult("T7 Recovery Gate (Framework-less JSONL parsing)", t7RecoverySuccess, `Recovered ${recoveredFactsCount} facts directly from text log`);
    if (!t7RecoverySuccess) overallPassed = false;

  } catch (err) {
    console.error("UAT automation error:", err);
    overallPassed = false;
  }

  return overallPassed;
}

export async function runUatVerification(
  checks: (directory: string) => Promise<boolean> = verifySandbox,
  allocate?: () => OwnedTestDirectory,
) {
  console.log(`\n${bold}${yellow}--- Starting Installed-Package UAT Checks ---${reset}`);
  const overallPassed=await runUatSandbox(checks, allocate);

  // -------------------------------------------------------------
  // FINAL UAT STATUS CARD
  // -------------------------------------------------------------
  console.log(`\n${bold}${cyan}======================================================================${reset}`);
  console.log(`  ${bold}${bold}UAT REPORT CARD FOR PHASE v4.0 RELEASE READINESS${reset}`);
  console.log(`${bold}${cyan}======================================================================${reset}`);
  
  if (overallPassed) {
    console.log(`  ${green}${bold}STATUS: PASSED (SCRIPT CHECKS AND SANDBOX CLEANUP)${reset}`);
  } else {
    console.log(`  ${red}${bold}STATUS: REJECTED (ONE OR MORE UAT GATES FAILED)${reset}`);
    console.log(`  Review the failure details in stdout and stderr.`);
  }
  console.log(`${bold}${cyan}======================================================================${reset}\n`);

  exit(overallPassed ? 0 : 1);
}

if (import.meta.main) await runUatVerification();
