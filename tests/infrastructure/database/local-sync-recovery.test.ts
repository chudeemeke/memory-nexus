import { expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

it("retains actual session capture and recovers local projections on unchanged and empty discovery across processes", () => {
  const storage = createOwnedTestDirectory("memory-local-sync-recovery-");
  const source = (path: string) => JSON.stringify(resolve(import.meta.dir, "../../../src", path).replaceAll("\\", "/"));
  const program = `
import { executeSyncCommand } from ${source("presentation/cli/commands/sync/index.ts")};
import { initializeDatabase, closeDatabase, getDefaultDbPath } from ${source("infrastructure/database/index.ts")};
import { appendEvent, rebuildProjections } from ${source("infrastructure/database/event-log.ts")};
import { Fact } from ${source("domain/entities/fact.ts")};
import { DEFAULT_CONFIG } from ${source("infrastructure/hooks/config-manager.ts")};
import { getEventsDir, getMachineLogPath } from ${source("infrastructure/paths.ts")};
import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const phase = process.argv[2], log = getMachineLogPath("synthetic");
const sessionDir=join(homedir(),".claude","projects","C--synthetic"),sessionFile=join(sessionDir,"synthetic-session.jsonl");
const open = () => initializeDatabase({ path: getDefaultDbPath() }).db;
function scalar(db,sql) { using statement=db.prepare(sql);return statement.get(); }
let db=open();
const event = uuid => Fact.create({uuid,type:"learning",project:"synthetic",content:uuid,observedAt:new Date("2026-01-01T00:00:00Z")});
if(phase==="fail") {
  mkdirSync(sessionDir,{recursive:true});
  writeFileSync(sessionFile,JSON.stringify({type:"user",uuid:"synthetic-message",timestamp:"2026-01-01T00:00:00Z",message:{role:"user",content:"offline capture survives recovery failure"}})+"\\n");
  await appendEvent(event("baseline"),log);await rebuildProjections(db);await appendEvent(event("pending"),log);
  db.exec("CREATE TRIGGER fail_pending BEFORE INSERT ON facts WHEN NEW.uuid='pending' BEGIN SELECT RAISE(ABORT,'synthetic replay failure'); END");
} else if(phase==="retry") db.exec("DROP TRIGGER fail_pending");
else if(phase==="empty") {unlinkSync(sessionFile);await appendEvent(event("later"),log);}
else if(phase==="diverged") db.exec("DELETE FROM facts WHERE uuid='baseline'");
closeDatabase(db);
let remoteCalls=0;
const result=await executeSyncCommand({json:true}, {
  setupSignalHandlers:()=>{},
  loadConfig:()=>({...DEFAULT_CONFIG,machineId:"synthetic",remoteSync:{enabled:true,repositoryUrl:"https://example.invalid/synthetic.git",autoPull:true,autoPush:true}}),
  createRemoteEventSyncService:()=>{remoteCalls++;throw new Error("Implicit remote invocation");},
  runAmbientContextGeneration:async()=>{},
});
db=open();
const state={exitCode:result.exitCode,remoteCalls,facts:scalar(db,"SELECT COUNT(*) AS count FROM facts").count,
  baseline:scalar(db,"SELECT COUNT(*) AS count FROM facts WHERE uuid='baseline'").count,
  messages:scalar(db,"SELECT COUNT(*) AS count FROM messages_meta").count,
  searchable:scalar(db,"SELECT COUNT(*) AS count FROM messages_fts WHERE messages_fts MATCH 'offline'").count,
  receipt:JSON.stringify(scalar(db,"SELECT * FROM projection_replay_state")),source:readFileSync(log,"utf8"),git:existsSync(join(getEventsDir(),".git"))};
closeDatabase(db);
console.log("LOCAL_RECOVERY_RESULT="+JSON.stringify(state));
`;
  try {
    const script = join(storage.dir, "local-recovery.ts");
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
      const boundary = stdout.indexOf("LOCAL_RECOVERY_RESULT=");
      expect(boundary).toBeGreaterThan(0);
      const report = JSON.parse(stdout.slice(0, boundary));
      const state = JSON.parse(stdout.slice(boundary + "LOCAL_RECOVERY_RESULT=".length));
      expect(state).toMatchObject({ remoteCalls: 0, messages: 1, searchable: 1, git: false });
      expect(report.remote.status).toBe("not_requested");
      return { report, state, stderr };
    };
    const failed = run("fail");
    expect(failed.state).toMatchObject({ exitCode: 1, facts: 1, baseline: 1 });
    expect(failed.report).toMatchObject({ success: false, processed: 1, messages: 1,
      capture: { success: true }, projections: { status: "failed" } });
    expect(failed.stderr).toContain("synthetic replay failure");
    const recovered = run("retry");
    expect(recovered.state).toMatchObject({ exitCode: 0, facts: 2, baseline: 1 });
    expect(recovered.report).toMatchObject({ success: true, processed: 0, skipped: 1,
      projections: { status: "current", rebuilt: true } });
    expect(recovered.state.source).toBe(failed.state.source);
    const empty = run("empty");
    expect(empty.state).toMatchObject({ exitCode: 0, facts: 3 });
    expect(empty.report).toMatchObject({ success: true, discovered: 0, processed: 0, projections: { status: "current", rebuilt: true } });
    const idle = run("idle");
    expect(idle.state).toEqual(empty.state);
    expect(idle.report.projections).toEqual({ status: "current", rebuilt: false });
    const divergent = run("diverged");
    expect(divergent.state).toMatchObject({ exitCode: 1, facts: 2, baseline: 0 });
    expect(divergent.state.source).toBe(empty.state.source);
    expect(divergent.state.receipt).toBe(empty.state.receipt);
    expect(divergent.report.projections.status).toBe("failed");
    expect(divergent.stderr).toContain("reconciliation");
  } finally { storage.cleanup(); }
}, 150000);
