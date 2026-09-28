import { expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

it("recovers failed default remote projections across fresh processes without changed transport", () => {
  const storage = createOwnedTestDirectory("memory-remote-recovery-");
  const source = (path: string) => JSON.stringify(resolve(import.meta.dir, "../../../src", path).replaceAll("\\", "/"));
  const program = `
import { executeSyncCommand } from ${source("presentation/cli/commands/sync/index.ts")};
import { initializeDatabase, closeDatabase, getDefaultDbPath } from ${source("infrastructure/database/index.ts")};
import { appendEvent, rebuildProjections } from ${source("infrastructure/database/event-log.ts")};
import { Fact } from ${source("domain/entities/fact.ts")};
import { DEFAULT_CONFIG } from ${source("infrastructure/hooks/config-manager.ts")};
import { getEventsDir, getMachineLogPath } from ${source("infrastructure/paths.ts")};
import { existsSync, readFileSync, mkdirSync, rmdirSync } from "node:fs";
import { join } from "node:path";
const phase = process.argv[2], log = getMachineLogPath("synthetic");
const open = () => initializeDatabase({ path: getDefaultDbPath() }).db;
function scalar(db, sql) { using statement = db.prepare(sql); return statement.get(); }
let db = open();
if (phase === "fail") {
  await appendEvent(Fact.create({uuid:"baseline",type:"learning",project:"synthetic",content:"baseline",observedAt:new Date("2026-01-01T00:00:00Z")}),log);
  await rebuildProjections(db);
  await appendEvent(Fact.create({uuid:"pending",type:"learning",project:"synthetic",content:"retained source",observedAt:new Date("2026-01-02T00:00:00Z")}),log);
  db.exec("CREATE TRIGGER fail_pending BEFORE INSERT ON facts WHEN NEW.uuid='pending' BEGIN SELECT RAISE(ABORT,'synthetic replay failure'); END");
} else if (phase === "retry") db.exec("DROP TRIGGER fail_pending");
else if (phase === "unsettled") {
  await appendEvent(Fact.create({uuid:"later",type:"learning",project:"synthetic",content:"later source",observedAt:new Date("2026-01-03T00:00:00Z")}),log);
  mkdirSync(join(getEventsDir(),".git","rebase-merge"));
} else if (phase === "settled") rmdirSync(join(getEventsDir(),".git","rebase-merge"));
else if (phase === "diverged") db.exec("DELETE FROM facts WHERE uuid='baseline'");
closeDatabase(db);
const result = await executeSyncCommand({remote:true,quiet:true}, {
  setupSignalHandlers:()=>{}, hasCheckpoint:()=>false,
  // Isolate the actual default remote adapter; local default recovery has its own driver.
  recoverProjections:async()=>({rebuilt:false,pending:false}),
  createSyncService:()=>({fixProjectNames:async()=>0,sync:async()=>({success:true,sessionsDiscovered:0,sessionsProcessed:0,sessionsSkipped:0,messagesInserted:0,toolUsesInserted:0,errors:[],durationMs:0,aborted:false})}),
  loadConfig:()=>({...DEFAULT_CONFIG,machineId:"synthetic",remoteSync:{enabled:true,repositoryUrl:"https://example.invalid/synthetic.git",autoPull:false,autoPush:false}}),
  reportResults:()=>{}, runAmbientContextGeneration:async()=>{},
});
db = open();
const state = {exitCode:result.exitCode,facts:scalar(db,"SELECT COUNT(*) AS count FROM facts").count,
  baseline:scalar(db,"SELECT COUNT(*) AS count FROM facts WHERE uuid='baseline'").count,
  receipt:JSON.stringify(scalar(db,"SELECT * FROM projection_replay_state")),
  source:readFileSync(log,"utf8"),git:existsSync(join(getEventsDir(),".git"))};
closeDatabase(db);
console.log("REMOTE_RECOVERY_RESULT="+JSON.stringify(state));
`;
  try {
    const script = join(storage.dir, "remote-recovery.ts");
    writeFileSync(script, program);
    const run = (phase: string) => {
      const child = Bun.spawnSync([process.execPath, script, phase], {
        env: { ...process.env, HOME: storage.dir, USERPROFILE: storage.dir,
          XDG_DATA_HOME: join(storage.dir, "data"), XDG_CONFIG_HOME: join(storage.dir, "config"),
          MEMORY_HOME: join(storage.dir, "legacy"), TEMP: storage.dir, TMP: storage.dir, TMPDIR: storage.dir },
        stdout: "pipe", stderr: "pipe", timeout: 30000,
      });
      const stdout = new TextDecoder().decode(child.stdout), stderr = new TextDecoder().decode(child.stderr);
      expect(child.exitCode, stderr).toBe(0);
      const line = stdout.split(/\r?\n/).find(value => value.startsWith("REMOTE_RECOVERY_RESULT="));
      expect(line).toBeDefined();
      return { ...JSON.parse(line!.slice("REMOTE_RECOVERY_RESULT=".length)), stderr };
    };
    const failed = run("fail");
    expect(failed).toMatchObject({ exitCode: 1, facts: 1, baseline: 1, git: false });
    expect(failed.stderr).toContain("synthetic replay failure");
    const recovered = run("retry");
    expect(recovered).toMatchObject({ exitCode: 0, facts: 2, baseline: 1, git: true });
    expect(recovered.source).toBe(failed.source);
    expect(recovered.receipt).not.toBe(failed.receipt);
    const idle = run("idle");
    expect(idle).toEqual(recovered);
    const unsettled = run("unsettled");
    expect(unsettled).toMatchObject({ exitCode: 1, facts: 2, baseline: 1, git: true });
    expect(unsettled.receipt).toBe(recovered.receipt);
    expect(unsettled.stderr).toContain("unfinished Git operation");
    const settled = run("settled");
    expect(settled).toMatchObject({ exitCode: 0, facts: 3, baseline: 1, git: true });
    expect(settled.source).toBe(unsettled.source);
    const divergent = run("diverged");
    expect(divergent).toMatchObject({ exitCode: 1, facts: 2, baseline: 0, git: true });
    expect(divergent.source).toBe(settled.source);
    expect(divergent.receipt).toBe(settled.receipt);
    expect(divergent.stderr).toContain("reconciliation");
  } finally { storage.cleanup(); }
}, 120000);
