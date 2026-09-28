import { expect, it } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { SqliteFactRepository } from "../../../src/infrastructure/database/repositories/fact-repository.js";
import { SqliteExtractionLogRepository } from "../../../src/infrastructure/database/repositories/extraction-log-repository.js";
import { SqliteSessionRepository } from "../../../src/infrastructure/database/repositories/session-repository.js";
import { SqliteMessageRepository } from "../../../src/infrastructure/database/repositories/message-repository.js";
import { Session } from "../../../src/domain/entities/session.js";
import { Message } from "../../../src/domain/entities/message.js";
import { ProjectPath } from "../../../src/domain/value-objects/project-path.js";
import { ExtractionPipeline } from "../../../src/application/services/extraction-pipeline.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

for (const mode of ["completed", "empty", "active-change", "decision", "input-add", "input-edit", "input-delete", "input-role", "input-time", "input-tools", "input-id", "input-empty", "input-redacted", "late-input", "killed-before-audit"] as const) {
it(`extraction revalidates concurrent ${mode} before writing`, async () => {
  const storage = createOwnedTestDirectory("memory-extraction-admission-");
  const dbPath = join(storage.dir, "synthetic.db"), log = join(storage.dir, "events", "events-a.jsonl");
  const ready = join(storage.dir, "ready"), release = join(storage.dir, "release");
  const db = new OwnedDatabase(dbPath);
  const source = (path: string) => JSON.stringify(resolve(import.meta.dir, "../../../src", path).replaceAll("\\", "/"));
  const program = `
import { OwnedDatabase } from ${source("infrastructure/database/owned-database.ts")};
import { SqliteFactRepository } from ${source("infrastructure/database/repositories/fact-repository.ts")};
import { SqliteExtractionLogRepository } from ${source("infrastructure/database/repositories/extraction-log-repository.ts")};
import { SqliteMessageRepository } from ${source("infrastructure/database/repositories/message-repository.ts")};
import { ExtractionPipeline } from ${source("application/services/extraction-pipeline.ts")};
import { existsSync, writeFileSync } from "node:fs";
const [dbPath,log,ready,release,mode]=process.argv.slice(2);
const db=new OwnedDatabase(dbPath);
async function barrier(){
 writeFileSync(ready,JSON.stringify({pid:process.pid}));const deadline=Date.now()+12000;
 while(!existsSync(release)){if(Date.now()>deadline)throw Error('Provider barrier timed out');await Bun.sleep(5);}
}
const provider={providerId:'synthetic-child',modelName:'synthetic',extract:async()=>{
 if(mode==='completed'||mode==='empty'||mode.startsWith('input-'))await barrier();
 return mode==='empty'||mode==='input-empty'?[]:[{type:'learning',content:'synthetic identical candidate',confidence:0.9,metadata:{}}];
}};
let waiting=true;
const embedding={name:'synthetic',model:'synthetic',dimensions:2,isReady:()=>true,initialize:async()=>{},dispose:async()=>{},embed:async()=>{throw Error('Unused');},embedBatch:async(texts)=>{
 if(waiting){waiting=false;await barrier();}
 return texts.map(()=>({embedding:new Float32Array([1,0])}));
}};
const audits=new SqliteExtractionLogRepository(db);const find=audits.findById.bind(audits);let reads=0;
audits.findById=async(...args)=>{reads++;if((mode==='decision'||mode==='late-input')&&reads===2)await barrier();return find(...args);};
const redactor=mode==='input-redacted'?{redactText:()=>({text:'masked synthetic',findings:[]}),redactJson:value=>({value,findings:[]})}:undefined;
const save=audits.save.bind(audits);audits.save=async entry=>{if(mode==='killed-before-audit')await barrier();return save(entry);};
let result,error;
try{result=await new ExtractionPipeline(db,new SqliteFactRepository(db),audits,new SqliteMessageRepository(db),provider,mode==='active-change'?embedding:undefined,log,redactor).extractFromSession('session','synthetic');}
catch(cause){error=String(cause);}finally{db.close();}
console.log(JSON.stringify({result,error}));
`;
  let child: ReturnType<typeof Bun.spawn> | undefined;
  try {
    createSchema(db); db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=0");
    await new SqliteSessionRepository(db).save(Session.create({ id: "session", projectPath: ProjectPath.fromDecoded("C:\\Projects\\synthetic"), startTime: new Date("2026-01-01T00:00:00Z") }));
    if(mode==='active-change') await new SqliteSessionRepository(db).save(Session.create({ id: "parent", projectPath: ProjectPath.fromDecoded("C:\\Projects\\synthetic"), startTime: new Date("2026-01-01T00:00:00Z") }));
    const messages = new SqliteMessageRepository(db), facts = new SqliteFactRepository(db), audits = new SqliteExtractionLogRepository(db);
    await messages.save(Message.create({ id: "message", role: "user", content: "synthetic input", timestamp: new Date("2026-01-01T00:00:00Z") }), "session");
    if(mode==='active-change') await messages.save(Message.create({id:"parent-message",role:"user",content:"synthetic parent",timestamp:new Date("2026-01-01T00:00:00Z")}),"parent");
    const script = join(storage.dir, "child.ts"); writeFileSync(script, program);
    const running = Bun.spawn([process.execPath,script,dbPath,log,ready,release,mode], { cwd: storage.dir, stdout:"pipe",stderr:"pipe",timeout:20000,
      env:{...process.env,HOME:storage.dir,USERPROFILE:storage.dir,XDG_DATA_HOME:join(storage.dir,"data"),XDG_CONFIG_HOME:join(storage.dir,"config"),MEMORY_HOME:join(storage.dir,"legacy"),TEMP:storage.dir,TMP:storage.dir,TMPDIR:storage.dir} });
    child = running;
    const stdout = new Response(running.stdout).text(), stderr = new Response(running.stderr).text();
    const deadline = Date.now()+12000;
    while(!existsSync(ready)) {
      if(Date.now()>deadline || child.exitCode!==null) throw Error("Child failed before provider barrier: "+await stdout+await stderr);
      await Bun.sleep(5);
    }
    expect(JSON.parse(readFileSync(ready,"utf8")).pid).not.toBe(process.pid);
    const provider = {providerId:"synthetic-parent",modelName:"synthetic",extract:async()=>[{type:"learning" as const,content:"synthetic identical candidate",confidence:0.9,metadata:{}}]};
    if(mode.startsWith('input-')) {
      if(mode==='input-add') await messages.save(Message.create({id:'additional',role:'assistant',content:'new synthetic input',timestamp:new Date('2026-01-02T00:00:00Z')}),'session');
      else if(mode==='input-delete') db.exec("DELETE FROM messages_meta WHERE id='message'");
      else {
        const field={ 'input-edit':'content','input-role':'role','input-time':'timestamp','input-tools':'tool_use_ids','input-id':'id','input-empty':'content','input-redacted':'content' }[mode as 'input-edit'|'input-role'|'input-time'|'input-tools'|'input-id'|'input-empty'|'input-redacted'];
        const value={ 'input-edit':'changed synthetic input','input-role':'assistant','input-time':'2026-01-02T00:00:00.000Z','input-tools':'["synthetic-tool"]','input-id':'replacement-id','input-empty':'changed synthetic input','input-redacted':'changed private synthetic input' }[mode as 'input-edit'|'input-role'|'input-time'|'input-tools'|'input-id'|'input-empty'|'input-redacted'];
        using update=db.prepare('UPDATE messages_meta SET '+field+'=? WHERE id=?');update.run(value,'message');
      }
      writeFileSync(release,'continue');expect(await child.exited,await stderr).toBe(0);
      const outcome=JSON.parse(await stdout);
      expect(outcome.error).not.toContain('synthetic input');
      expect(outcome.error).not.toContain('private');
      expect(outcome.error).toContain('Session input changed');expect(outcome.result).toBeUndefined();
      expect(existsSync(log)).toBe(false);expect(await audits.findById('session')).toBeNull();expect(await facts.findByProject('synthetic')).toEqual([]);
      const retry=await new ExtractionPipeline(db,facts,audits,messages,provider,undefined,log).extractFromSession('session','synthetic');
      expect(retry.added).toBe(mode==='input-delete'?0:1);
      expect((await facts.findByProject('synthetic')).length).toBe(mode==='input-delete'?0:1);
      return;
    }
    if(mode==='killed-before-audit') {
      const retained=readFileSync(log,'utf8');expect(await facts.findByProject('synthetic')).toEqual([]);expect(await audits.findById('session')).toBeNull();
      child.kill();expect(await child.exited).not.toBe(0);await stdout;await stderr;
      const retry=await new ExtractionPipeline(db,facts,audits,messages,provider,undefined,log).extractFromSession('session','synthetic');
      expect(retry).toEqual({skippedSession:false,added:0,updated:0,superseded:0,skipped:1});
      expect(readFileSync(log,'utf8')).toBe(retained);expect((await facts.findByProject('synthetic')).length).toBe(1);expect((await audits.findById('session'))?.factsSkipped).toBe(1);
      expect((await new ExtractionPipeline(db,facts,audits,messages,provider,undefined,log).extractFromSession('session','synthetic')).skippedSession).toBe(true);return;
    }
    if(mode==='decision'||mode==='late-input') {
      const beforeDb=db.serialize();
      if(mode==='late-input') await expect(messages.save(Message.create({id:'late',role:'user',content:'late synthetic input',timestamp:new Date('2026-01-02T00:00:00Z')}),'session')).rejects.toThrow('database is locked');
      else await expect(new ExtractionPipeline(db,facts,audits,messages,provider,undefined,log).extractFromSession("session","synthetic")).rejects.toThrow("busy");
      expect(db.serialize()).toEqual(beforeDb);
      expect(existsSync(log)).toBe(false);
      writeFileSync(release,"continue");
      expect(await child.exited,await stderr).toBe(0);
      const outcome=JSON.parse(await stdout);
      expect(outcome.error).toBeUndefined();expect(outcome.result.added).toBe(1);
      expect((await audits.findById("session"))?.factsAdded).toBe(1);
      expect((await new ExtractionPipeline(db,facts,audits,messages,provider,undefined,log).extractFromSession("session","synthetic")).skippedSession).toBe(true);
      if(mode==='late-input') {
        const beforeIdentity=(await audits.findById('session'))?.inputIdentity;
        await messages.save(Message.create({id:'late',role:'user',content:'late synthetic input',timestamp:new Date('2026-01-02T00:00:00Z')}),'session');
        expect((await new ExtractionPipeline(db,facts,audits,messages,provider,undefined,log).extractFromSession('session','synthetic')).skippedSession).toBe(false);
        expect((await audits.findById('session'))?.inputIdentity).not.toBe(beforeIdentity);
      }
      return;
    }
    const result = await new ExtractionPipeline(db,facts,audits,messages,provider,undefined,log).extractFromSession(mode==="active-change"?"parent":"session","synthetic");
    expect(result.added).toBe(1);
    const before = {source:readFileSync(log,"utf8"),audit:await audits.findById("session")};
    writeFileSync(release,"continue");
    expect(await child.exited,await stderr).toBe(0);
    const outcome = JSON.parse(await stdout);
    if(mode==='active-change') {
      expect(outcome.error).toContain('Active facts changed');
      expect(outcome.result).toBeUndefined();
    } else {
      expect(outcome.error).toBeUndefined();
      expect(outcome.result.skippedSession).toBe(true);
    }
    expect({source:readFileSync(log,"utf8"),audit:await audits.findById("session")}).toEqual(before);
    expect((await facts.findByProject("synthetic")).length).toBe(1);
    if(mode==='active-change') {
      const retry = await new ExtractionPipeline(db,facts,audits,messages,provider,undefined,log).extractFromSession("session","synthetic");
      expect(retry).toEqual({skippedSession:false,added:0,updated:0,superseded:0,skipped:1});
      expect(readFileSync(log,"utf8")).toBe(before.source);
      expect((await audits.findById("session"))?.factsSkipped).toBe(1);
    }
  } finally {
    if(child && child.exitCode===null){child.kill();await child.exited;}
    db.close();storage.cleanup();
  }
},30000);

}
