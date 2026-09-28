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
