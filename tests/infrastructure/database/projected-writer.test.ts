import { describe, expect, it, spyOn } from "bun:test";
import { readFileSync, writeFileSync, unlinkSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { appendEvent, rebuildProjectionsWithReport, readMemoryEventsWithReport } from "../../../src/infrastructure/database/event-log.js";
import { assertAutomaticProjectionReplay, projectionContentIdentity } from "../../../src/infrastructure/database/projection-state.js";
import { recoverPendingProjections, createProjectedEventWriter } from "../../../src/infrastructure/database/projection-recovery.js";
import { Fact } from "../../../src/domain/entities/fact.js";
import { executeGovernanceCommand } from "../../../src/presentation/cli/commands/governance.js";
import { executeDreamCommand } from "../../../src/presentation/cli/commands/dream.js";
import { captureStreams } from "../../helpers/capture-json.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

async function fixture(run: (db: OwnedDatabase, dbPath: string, log: string) => Promise<void>) {
  const storage=createOwnedTestDirectory("memory-projected-writer-"),dbPath=join(storage.dir,"synthetic.db"),log=join(storage.dir,"events-synthetic.jsonl"),db=new OwnedDatabase(dbPath);
  try { createSchema(db); await appendEvent(Fact.create({uuid:"target",type:"decision",project:"synthetic",content:"original",observedAt:new Date("2026-01-01T00:00:00Z")}),log); await rebuildProjectionsWithReport(db,log); await run(db,dbPath,log); }
  finally {db.close();storage.cleanup();}
}
describe("canonical projected command writers",()=>{
  it("bootstraps an empty projection from an existing source directory and recognizes idle recovery",async()=>{
    await fixture(async(_db,_path,log)=>{
      const empty=new OwnedDatabase(":memory:");
      try {
        createSchema(empty);
        expect(await recoverPendingProjections(empty,undefined,dirname(log))).toEqual({rebuilt:true,pending:false});
        expect(await recoverPendingProjections(empty,undefined,dirname(log))).toEqual({rebuilt:false,pending:false});
        expect(()=>assertAutomaticProjectionReplay(empty)).not.toThrow();
      } finally {empty.close();}
    });
  });
  for(const route of ["governance","dream","writer"] as const) it(`reports more source work as pending before ${route} can write from stale projections`,async()=>{
    await fixture(async(db,dbPath,eventLogPath)=>{
      await appendEvent(Fact.create({uuid:"pending",type:"learning",project:"synthetic",content:"pending",observedAt:new Date("2026-01-02T00:00:00Z")}),eventLogPath);
      const run=OwnedDatabase.prototype.run;let appended=false;
      const hook=spyOn(OwnedDatabase.prototype,"run").mockImplementation(function(this:OwnedDatabase,...args){
        const result=Reflect.apply(run,this,args);
        if(!appended && args[0]==='DELETE FROM main."facts"') {
          appended=true;appendFileSync(eventLogPath,JSON.stringify({uuid:"later",type:"learning",project:"synthetic",content:"later",observedAt:"2026-01-03T00:00:00Z"})+"\n");
        }
        return result;
      });
      try {
        if(route==="writer") {
          const event=(await readMemoryEventsWithReport(eventLogPath)).events[0]!;
          await expect(createProjectedEventWriter(db,eventLogPath)(event)).rejects.toThrow("pending");
        } else {
          const result=await captureStreams(()=>route==="governance"
            ? executeGovernanceCommand({action:"suppress",surface:"fact",targetId:"target",json:true},{dbPath,eventLogPath})
            : executeDreamCommand({action:"approve",dreamId:"missing",json:true},{dbPath,eventLogPath}));
          expect(result.exitCode).not.toBe(0);expect(result.stdout).toContain("pending");
        }
        expect(appended).toBe(true);
        expect(readFileSync(eventLogPath,"utf8").trim().split("\n")).toHaveLength(3);
      } finally {hook.mockRestore();}
      expect(await recoverPendingProjections(db,eventLogPath)).toEqual({rebuilt:true,pending:false});
    });
  });
  for(const emptyFile of [false,true]) {
    it("leaves unlogged data intact when an unacknowledged source is absent or empty",async()=>{
      await fixture(async(db,_path,log)=>{
        db.exec("DELETE FROM projection_replay_state");
        if(emptyFile) writeFileSync(log,""); else unlinkSync(log);
        const before=db.serialize();
        expect(await recoverPendingProjections(db,log)).toEqual({rebuilt:false,pending:false});
        expect(db.serialize().equals(before)).toBe(true);
      });
    });
  }
  for (const replacement of ["",JSON.stringify({uuid:"target",type:"learning",project:"synthetic",content:"replacement".repeat(1000),observedAt:"2026-01-01T00:00:00Z"})]) {
    it("refuses automatic truncation or rewriting of acknowledged source history",async()=>{
      await fixture(async(db,_dbPath,log)=>{
        const before=db.serialize();writeFileSync(log,replacement);
        await expect(recoverPendingProjections(db,log)).rejects.toThrow("reconciliation");
        expect(db.serialize().equals(before)).toBe(true);
        await rebuildProjectionsWithReport(db,log);expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
      });
    });
  }
  it("refuses missing acknowledged sources and leaves projections unchanged during read-only commands",async()=>{
    await fixture(async(db,dbPath,eventLogPath)=>{
      unlinkSync(eventLogPath);const before=projectionContentIdentity(db);
      await expect(recoverPendingProjections(db,eventLogPath)).rejects.toThrow("source is unavailable");
      const result=await captureStreams(()=>executeGovernanceCommand({action:"list",json:true},{dbPath,eventLogPath}));
      expect(result.exitCode).toBe(0);expect(projectionContentIdentity(db)).toEqual(before);
      expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
    });
  });
  it("does not recover pending sources for unconfirmed dream apply",async()=>{
    await fixture(async(db,dbPath,eventLogPath)=>{
      await appendEvent(Fact.create({uuid:"pending",type:"learning",project:"synthetic",content:"pending",observedAt:new Date("2026-01-02T00:00:00Z")}),eventLogPath);
      const before=projectionContentIdentity(db);const result=await captureStreams(()=>executeDreamCommand({action:"apply",dreamId:"missing",json:true},{dbPath,eventLogPath}));
      expect(result.exitCode).not.toBe(0);expect(projectionContentIdentity(db)).toEqual(before);
      expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
    });
  });
  it("keeps governance writes source-backed and the receipt current",async()=>{
    await fixture(async(db,dbPath,eventLogPath)=>{
      for(const action of ["suppress","unsuppress"] as const){
        const result=await captureStreams(()=>executeGovernanceCommand({action,surface:"fact",targetId:"target",json:true},{dbPath,eventLogPath}));
        expect(result.exitCode).toBe(0); expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
      }
      expect(readFileSync(eventLogPath,"utf8").trim().split("\n")).toHaveLength(3);
    });
  });
  it("does not repeat governance side effects after canonical replay has committed",async()=>{
    await fixture(async(db,dbPath,eventLogPath)=>{
      db.exec("CREATE TABLE governance_write_audit(hits INTEGER NOT NULL); INSERT INTO governance_write_audit VALUES(0); CREATE TRIGGER observe_governance_update AFTER UPDATE ON memory_governance BEGIN UPDATE governance_write_audit SET hits=hits+1; END");
      const deps={dbPath,eventLogPath};
      expect((await captureStreams(()=>executeGovernanceCommand({action:"suppress",surface:"fact",targetId:"target",json:true},deps))).exitCode).toBe(0);
      expect((await captureStreams(()=>executeDreamCommand({action:"propose-supersedence",project:"synthetic",targetFactUuid:"target",sourceEventIds:["target"],proposedContent:"replacement",reason:"synthetic",json:true},deps))).exitCode).toBe(0);
      using audit=db.prepare<{hits:number},[]>("SELECT hits FROM governance_write_audit");
      expect(audit.get()?.hits).toBe(0);
      expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
    });
  });
  for(const change of ["append","remove"] as const) it(`reports committed work and pending source after post-cutoff ${change}`,async()=>{
    await fixture(async(db,dbPath,eventLogPath)=>{
      const run=OwnedDatabase.prototype.run;let changed=false,retained="";
      const hook=spyOn(OwnedDatabase.prototype,"run").mockImplementation(function(this:OwnedDatabase,...args){
        const result=Reflect.apply(run,this,args);
        if(!changed && args[0]==='DELETE FROM main."facts"') {
          changed=true;retained=readFileSync(eventLogPath,"utf8");
          if(change==="append") appendFileSync(eventLogPath,JSON.stringify({uuid:"later",type:"learning",project:"synthetic",content:"later",observedAt:"2026-01-03T00:00:00Z"})+"\n");
          else unlinkSync(eventLogPath);
        }
        return result;
      });
      try {
        const result=await captureStreams(()=>executeGovernanceCommand({action:"suppress",surface:"fact",targetId:"target",json:true},{dbPath,eventLogPath}));
        expect(changed).toBe(true);expect(result.exitCode).not.toBe(0);
        expect(result.stdout).toContain("recorded and projected");expect(result.stdout).toContain("pending");
        expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
        using state=db.prepare<{status:string},[]>("SELECT status FROM memory_governance WHERE surface='fact' AND target_id='target'");
        expect(state.get()?.status).toBe("suppressed");
      } finally {hook.mockRestore();if(change==="remove")writeFileSync(eventLogPath,retained);}
      expect((await recoverPendingProjections(db,eventLogPath)).pending).toBe(false);
    });
  });
  it("reports a retained event after failed replay and recovers on the next mutating command",async()=>{
    await fixture(async(db,dbPath,eventLogPath)=>{
      db.exec("CREATE TRIGGER refuse_projection BEFORE DELETE ON facts BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
      const result=await captureStreams(()=>executeGovernanceCommand({action:"suppress",surface:"fact",targetId:"target",json:true},{dbPath,eventLogPath}));
      expect(result.exitCode).not.toBe(0); expect(result.stdout).toContain("pending");
      expect(readFileSync(eventLogPath,"utf8").trim().split("\n")).toHaveLength(2);
      db.exec("DROP TRIGGER refuse_projection");
      const retry=await captureStreams(()=>executeGovernanceCommand({action:"consent-revoke",surface:"fact",targetId:"target",json:true},{dbPath,eventLogPath}));
      expect(retry.exitCode).toBe(0); expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
      using state=db.prepare<{status:string},[]>("SELECT status FROM memory_governance WHERE surface='fact' AND target_id='target'");
      expect(state.get()?.status).toBe("suppressed");
    });
  });
  it("refuses to append or overwrite after an unrelated direct edit",async()=>{
    await fixture(async(db,dbPath,eventLogPath)=>{
      db.exec("UPDATE facts SET content='direct edit'");const before=readFileSync(eventLogPath,"utf8");
      const result=await captureStreams(()=>executeGovernanceCommand({action:"suppress",surface:"fact",targetId:"target",json:true},{dbPath,eventLogPath}));
      expect(result.exitCode).not.toBe(0);expect(result.stdout).toContain("reconciliation");expect(readFileSync(eventLogPath,"utf8")).toBe(before);
    });
  });
  it("recovers retained source during no-message extraction in a fresh process",async()=>{
    await fixture(async(db,dbPath,eventLogPath)=>{
      await appendEvent(Fact.create({uuid:"restart",type:"learning",project:"synthetic",content:"restart retained",observedAt:new Date("2026-01-02T00:00:00Z")}),eventLogPath);
      db.exec("CREATE TRIGGER reject_restart BEFORE DELETE ON facts BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
      await expect(rebuildProjectionsWithReport(db,eventLogPath,undefined,"automatic")).rejects.toThrow("synthetic failure");
      db.exec("DROP TRIGGER reject_restart");
      const program=join(dirname(eventLogPath),"synthetic-recovery.ts"),source=(path:string)=>JSON.stringify(join(process.cwd(),path).replaceAll("\\","/"));
      writeFileSync(program,`
import {OwnedDatabase} from ${source("src/infrastructure/database/owned-database.ts")};
import {ExtractionPipeline} from ${source("src/application/services/extraction-pipeline.ts")};
import {SqliteFactRepository} from ${source("src/infrastructure/database/repositories/fact-repository.ts")};
import {SqliteExtractionLogRepository} from ${source("src/infrastructure/database/repositories/extraction-log-repository.ts")};
import {SqliteMessageRepository} from ${source("src/infrastructure/database/repositories/message-repository.ts")};
const db=new OwnedDatabase(process.argv[2]);
try {
  const facts=new SqliteFactRepository(db);
  const pipeline=new ExtractionPipeline(db,facts,new SqliteExtractionLogRepository(db),new SqliteMessageRepository(db),{providerId:"synthetic",modelName:"synthetic",extract:async()=>{throw Error("No-message retry must not call inference");}},undefined,process.argv[3]);
  const result=await pipeline.extractFromSession("no-messages","synthetic");
  console.log(JSON.stringify({pid:process.pid,result,present:(await facts.findByUuid("restart"))?.content}));
} finally {db.close();}
`);
      const retained=readFileSync(eventLogPath,"utf8");
      for(let attempt=0;attempt<2;attempt++) {
        const child=Bun.spawnSync([process.execPath,program,dbPath,eventLogPath],{stdout:"pipe",stderr:"pipe",timeout:15000});
        expect(child.exitCode).toBe(0);
        const output=JSON.parse(new TextDecoder().decode(child.stdout));
        expect(output.pid).not.toBe(process.pid);expect(output.result.added).toBe(0);expect(output.present).toBe("restart retained");
        expect(readFileSync(eventLogPath,"utf8")).toBe(retained);
      }
      expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
    });
  });
  it("replays real dream propose, approve, apply and rollback through canonical writers",async()=>{
    await fixture(async(db,dbPath,eventLogPath)=>{
      let tick=0;const deps={dbPath,eventLogPath,now:()=>new Date(Date.UTC(2026,5,1,0,0,++tick)),nextSequence:()=>++tick};
      const proposed=await captureStreams(()=>executeDreamCommand({action:"propose-supersedence",project:"synthetic",targetFactUuid:"target",sourceEventIds:["target"],proposedContent:"replacement",reason:"synthetic",json:true},deps));
      expect(proposed.exitCode).toBe(0);expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
      const dreamId=JSON.parse(proposed.stdout).data.dream_id as string;
      for(const action of ["approve","apply","rollback"] as const){
        const result=await captureStreams(()=>executeDreamCommand({action,dreamId,confirm:true,json:true},deps));
        expect(result.exitCode).toBe(0);expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
      }
      using state=db.prepare<{superseded_by:string|null},[]>("SELECT superseded_by FROM facts WHERE uuid='target'");expect(state.get()?.superseded_by).toBeNull();
    });
  });
  for(const boundary of ["proposal","governance"] as const) it(`resumes proposal registration after ${boundary} failure without duplicating source`,async()=>{
    await fixture(async(db,dbPath,eventLogPath)=>{
      const deps={dbPath,eventLogPath},options={action:"propose-supersedence" as const,project:"synthetic",targetFactUuid:"target",sourceEventIds:["target"],proposedContent:"replacement",reason:"synthetic",json:true};
      db.exec(boundary==="proposal"
        ? "CREATE TRIGGER reject_proposal BEFORE INSERT ON dream_entries BEGIN SELECT RAISE(ABORT,'synthetic failure'); END"
        : "CREATE TRIGGER reject_proposal BEFORE INSERT ON memory_governance WHEN NEW.surface='dream' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
      const failed=await captureStreams(()=>executeDreamCommand(options,deps));
      expect(failed.exitCode).not.toBe(0);expect(failed.stdout).toContain("pending");
      db.exec("DROP TRIGGER reject_proposal");
      const retry=await captureStreams(()=>executeDreamCommand(options,deps));
      expect(retry.exitCode).toBe(0);expect(readFileSync(eventLogPath,"utf8").trim().split("\n")).toHaveLength(3);
      const dreamId=JSON.parse(retry.stdout).data.dream_id as string;
      using state=db.prepare<{status:string},[string]>("SELECT status FROM memory_governance WHERE surface='dream' AND target_id=?");
      expect(state.get(dreamId)?.status).toBe("active");expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
    });
  });
  it("preserves reviewed proposals and governance controls on retry and rejects conflicting recipes",async()=>{
    await fixture(async(db,dbPath,eventLogPath)=>{
      const deps={dbPath,eventLogPath},options={action:"propose-supersedence" as const,project:"synthetic",targetFactUuid:"target",sourceEventIds:["target","support"],proposedContent:"replacement",reason:"synthetic",json:true};
      const proposed=await captureStreams(()=>executeDreamCommand(options,deps));expect(proposed.exitCode).toBe(0);
      const dreamId=JSON.parse(proposed.stdout).data.dream_id as string;
      expect((await captureStreams(()=>executeDreamCommand({action:"approve",dreamId,json:true},deps))).exitCode).toBe(0);
      expect((await captureStreams(()=>executeGovernanceCommand({action:"suppress",surface:"dream",targetId:dreamId,json:true},deps))).exitCode).toBe(0);
      const before=readFileSync(eventLogPath,"utf8");
      const retry=await captureStreams(()=>executeDreamCommand({...options,sourceEventIds:["support","target"]},deps));
      expect(retry.exitCode).toBe(0);expect(JSON.parse(retry.stdout).data.status).toBe("approved");
      expect(readFileSync(eventLogPath,"utf8")).toBe(before);
      using state=db.prepare<{status:string},[string]>("SELECT status FROM memory_governance WHERE surface='dream' AND target_id=?");expect(state.get(dreamId)?.status).toBe("suppressed");
      for(const conflict of [{reason:"different"},{confidence:0.5},{sourceEventIds:["other"]},{proposedFactType:"learning" as const}]) {
        const rejected=await captureStreams(()=>executeDreamCommand({...options,...conflict},deps));
        expect(rejected.exitCode).not.toBe(0);expect(rejected.stdout).toContain("conflicts");expect(readFileSync(eventLogPath,"utf8")).toBe(before);
      }
      expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
    });
  });
  for(const failure of ["replacement","supersedence","applied","restore","rolled_back"] as const) {
    it(`recovers an interrupted dream ${failure} step through fresh CLI connections`,async()=>{
      await fixture(async(db,dbPath,eventLogPath)=>{
        let tick=0;const deps={dbPath,eventLogPath,now:()=>new Date(Date.UTC(2026,5,1,0,0,++tick)),nextSequence:()=>++tick};
        const proposed=await captureStreams(()=>executeDreamCommand({action:"propose-supersedence",project:"synthetic",targetFactUuid:"target",sourceEventIds:["target"],proposedContent:"replacement",reason:"synthetic",json:true},deps));
        expect(proposed.exitCode).toBe(0);
        const dreamId=JSON.parse(proposed.stdout).data.dream_id as string;
        expect((await captureStreams(()=>executeDreamCommand({action:"approve",dreamId,json:true},deps))).exitCode).toBe(0);
        const rollback=failure==="restore"||failure==="rolled_back";
        if(rollback) expect((await captureStreams(()=>executeDreamCommand({action:"apply",dreamId,confirm:true,json:true},deps))).exitCode).toBe(0);
        const condition=failure==="replacement" ? "ON facts WHEN NEW.uuid != 'target' AND NEW.type != 'supersedence'"
          :failure==="supersedence" ? "ON facts WHEN NEW.uuid='target' AND NEW.superseded_by IS NOT NULL"
          :failure==="restore" ? "ON facts WHEN NEW.uuid='target' AND NEW.superseded_by IS NULL"
          :`ON dream_entries WHEN NEW.status='${failure}'`;
        db.exec(`CREATE TRIGGER fail_dream_step AFTER INSERT ${condition} BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`);
        const action=rollback?"rollback":"apply";
        const failed=await captureStreams(()=>executeDreamCommand({action,dreamId,confirm:true,json:true},deps));
        expect(failed.exitCode).not.toBe(0);expect(failed.stdout).toContain("pending");
        db.exec("DROP TRIGGER fail_dream_step");
        const retry=await captureStreams(()=>executeDreamCommand({action,dreamId,confirm:true,json:true},deps));
        expect(retry.exitCode).toBe(0);expect(()=>assertAutomaticProjectionReplay(db)).not.toThrow();
        const before=readFileSync(eventLogPath,"utf8");
        expect((await captureStreams(()=>executeDreamCommand({action,dreamId,confirm:true,json:true},deps))).exitCode).toBe(0);
        expect(readFileSync(eventLogPath,"utf8")).toBe(before);
        using target=db.prepare<{superseded_by:string|null},[]>("SELECT superseded_by FROM facts WHERE uuid='target'");
        if(rollback) expect(target.get()?.superseded_by).toBeNull();else expect(target.get()?.superseded_by).toBeString();
      });
    });
  }
});
