import { expect, it, spyOn } from "bun:test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { Fact } from "../../../src/domain/entities/fact.js";
import { appendEvent, rebuildProjections } from "../../../src/infrastructure/database/event-log.js";
import { executeDreamCommand } from "../../../src/presentation/cli/commands/dream.js";
import { executeGovernanceCommand } from "../../../src/presentation/cli/commands/governance.js";
import { captureStreams } from "../../helpers/capture-json.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";
import type { LeasedOperationAdmission } from "../../../src/domain/ports/operation-admission.js";
import { createSourceOperationAdmission } from "../../../src/infrastructure/database/source-operation-admission.js";

it("admits a decision before its first read and preserves approval on a fresh retry across processes", async () => {
  const storage=createOwnedTestDirectory("memory-admitted-command-"),dbPath=join(storage.dir,"synthetic.db"),eventLogPath=join(storage.dir,"events-synthetic.jsonl");
  const ready=join(storage.dir,"ready"),release=join(storage.dir,"release"),script=join(storage.dir,"actor.ts");
  const source=(path:string)=>JSON.stringify(resolve(import.meta.dir,"../../../src",path).replaceAll("\\","/"));
  const program=`
import {executeDreamCommand} from ${source("presentation/cli/commands/dream.ts")};
import {SqliteDreamRepository} from ${source("infrastructure/database/repositories/dream-repository.ts")};
import {existsSync,writeFileSync} from 'node:fs';
const [dbPath,eventLogPath,ready,release]=process.argv.slice(2);
const find=SqliteDreamRepository.prototype.findByDreamId;let reached=false;
SqliteDreamRepository.prototype.findByDreamId=async function(...args){const result=await Reflect.apply(find,this,args);
 if(!reached){reached=true;writeFileSync(ready,JSON.stringify({pid:process.pid,initiallyMissing:result===null}));
 const deadline=Date.now()+12000,word=new Int32Array(new SharedArrayBuffer(4));while(!existsSync(release)){if(Date.now()>deadline)throw Error('Barrier timeout');Atomics.wait(word,0,0,5);}}return result;};
const result=await executeDreamCommand({action:'propose-supersedence',project:'synthetic',targetFactUuid:'target',sourceEventIds:['target'],proposedContent:'replacement',reason:'synthetic',json:true},{dbPath,eventLogPath,now:()=>new Date('2026-01-04T00:00:00Z'),nextSequence:()=>4});
console.log('ADMITTED_RESULT='+JSON.stringify(result));
`;
  let child: ReturnType<typeof Bun.spawn>|undefined;
  try {
    const db=new OwnedDatabase(dbPath);
    try { createSchema(db);db.exec("PRAGMA journal_mode=WAL");await appendEvent(Fact.create({uuid:"target",type:"decision",project:"synthetic",content:"baseline",observedAt:new Date("2026-01-01T00:00:00Z")}),eventLogPath);await rebuildProjections(db,eventLogPath); }
    finally {db.close();}
    writeFileSync(script,program);
    const running=Bun.spawn([process.execPath,script,dbPath,eventLogPath,ready,release],{cwd:storage.dir,stdout:"pipe",stderr:"pipe",timeout:20000,
      env:{...process.env,HOME:storage.dir,USERPROFILE:storage.dir,XDG_DATA_HOME:join(storage.dir,"different-profile"),XDG_CONFIG_HOME:join(storage.dir,"config"),MEMORY_HOME:join(storage.dir,"legacy"),TEMP:storage.dir,TMP:storage.dir,TMPDIR:storage.dir}});
    child=running;const stdout=new Response(running.stdout).text(),stderr=new Response(running.stderr).text(),deadline=Date.now()+12000;
    while(!existsSync(ready)){if(Date.now()>deadline||child.exitCode!==null)throw Error("Missing decision barrier: "+await stderr+" "+await stdout);await Bun.sleep(5);}
    const barrier=JSON.parse(readFileSync(ready,"utf8"));expect(barrier.initiallyMissing).toBe(true);expect(barrier.pid).not.toBe(process.pid);
    const before=readFileSync(eventLogPath,"utf8"),deps={dbPath,eventLogPath,now:()=>new Date("2026-01-05T00:00:00Z"),nextSequence:()=>5};
    const proposal={action:"propose-supersedence" as const,project:"synthetic",targetFactUuid:"target",sourceEventIds:["target"],proposedContent:"replacement",reason:"synthetic",json:true};
    for(const run of [()=>executeDreamCommand(proposal,deps),()=>executeGovernanceCommand({action:"suppress",surface:"fact",targetId:"target",json:true},deps)]) {
      const denied=await captureStreams(run);expect(denied.exitCode).not.toBe(0);expect(JSON.parse(denied.stdout).error.message).toContain("busy");
      expect(readFileSync(eventLogPath,"utf8")).toBe(before);
    }
    writeFileSync(release,"continue");expect(await child.exited,await stderr).toBe(0);
    const output=await stdout,index=output.indexOf("ADMITTED_RESULT=");expect(index).toBeGreaterThan(0);
    expect(JSON.parse(output.slice(index+"ADMITTED_RESULT=".length)).exitCode).toBe(0);
    const inspect=()=>{const db=new OwnedDatabase(dbPath);try{using statement=db.prepare<{dream_id:string;status:string},[]>("SELECT dream_id,status FROM dream_entries");return statement.get()!;}finally{db.close();}};
    const proposed=inspect();expect(proposed.status).toBe("pending_review");
    const approved=await captureStreams(()=>executeDreamCommand({action:"approve",dreamId:proposed.dream_id,json:true},deps));expect(approved.exitCode).toBe(0);expect(inspect().status).toBe("approved");
    const approvedSource=readFileSync(eventLogPath,"utf8");
    const retried=await captureStreams(()=>executeDreamCommand(proposal,deps));expect(retried.exitCode).toBe(0);expect(inspect().status).toBe("approved");expect(readFileSync(eventLogPath,"utf8")).toBe(approvedSource);
    const conflict=await captureStreams(()=>executeDreamCommand({...proposal,reason:"different immutable recipe"},deps));expect(conflict.exitCode).not.toBe(0);expect(conflict.stdout).toContain("conflicts");expect(inspect().status).toBe("approved");expect(readFileSync(eventLogPath,"utf8")).toBe(approvedSource);
  } finally {if(child&&child.exitCode===null){child.kill();await child.exited;}storage.cleanup();}
},30000);

for (const command of ["dream","governance"] as const) it(`reports ${command} only after admission cleanup`, async()=>{
  const storage=createOwnedTestDirectory("memory-admission-report-");
  const dbPath=join(storage.dir,"synthetic.db"),eventLogPath=join(storage.dir,"events-synthetic.jsonl");
  try {
    const db=new OwnedDatabase(dbPath);
    try{createSchema(db);await appendEvent(Fact.create({uuid:"target",type:"decision",project:"synthetic",content:"baseline",observedAt:new Date("2026-01-01T00:00:00Z")}),eventLogPath);await rebuildProjections(db,eventLogPath);}finally{db.close();}
    const operationAdmission: LeasedOperationAdmission = {async run(operation,parent){await createSourceOperationAdmission(eventLogPath).run(operation,parent);throw Error("synthetic reservation release failed");}};
    const result=await captureStreams(()=>command==="dream"
      ?executeDreamCommand({action:"propose-supersedence",project:"synthetic",targetFactUuid:"target",sourceEventIds:["target"],proposedContent:"replacement",reason:"synthetic",json:true},{dbPath,eventLogPath,operationAdmission})
      :executeGovernanceCommand({action:"suppress",surface:"fact",targetId:"target",json:true},{dbPath,eventLogPath,operationAdmission}));
    expect(result.exitCode).not.toBe(0);expect(JSON.parse(result.stdout)).toMatchObject({status:"error",error:{message:"synthetic reservation release failed"}});
    expect(readFileSync(eventLogPath,"utf8").trim().split("\n").length).toBeGreaterThan(1);
  } finally {storage.cleanup();}
});

for (const command of ["dream","governance"] as const) it(`retains ${command} operation and database cleanup failures in one response`, async()=>{
  const storage=createOwnedTestDirectory("memory-admission-compound-");
  const dbPath=join(storage.dir,"synthetic.db"),eventLogPath=join(storage.dir,"events-synthetic.jsonl");
  let connection:OwnedDatabase|undefined;
  const close=spyOn(OwnedDatabase.prototype,"close").mockImplementation(function(this:OwnedDatabase){connection=this;throw Error("synthetic database close failure");});
  try {
    const result=await captureStreams(()=>command==="dream"
      ?executeDreamCommand({action:"approve",dreamId:"missing",json:true},{dbPath,eventLogPath,writeEvents:false})
      :executeGovernanceCommand({action:"suppress",surface:"invalid" as any,targetId:"missing",json:true},{dbPath,eventLogPath,writeEvents:false}));
    expect(result.exitCode).not.toBe(0);
    const output=JSON.parse(result.stdout);expect(output.status).toBe("error");expect(output.error.message).toContain("database cleanup failed: synthetic database close failure");
    expect(output.error.message).toContain(command==="dream"?"Dream proposal not found":"surface");
  } finally {close.mockRestore();connection?.close();storage.cleanup();}
});
