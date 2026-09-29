import { expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { SqliteSessionRepository } from "../../../src/infrastructure/database/repositories/session-repository.js";
import { SqliteMessageRepository } from "../../../src/infrastructure/database/repositories/message-repository.js";
import { SqliteExtractionLogRepository } from "../../../src/infrastructure/database/repositories/extraction-log-repository.js";
import { Session } from "../../../src/domain/entities/session.js";
import { Message } from "../../../src/domain/entities/message.js";
import { ProjectPath } from "../../../src/domain/value-objects/project-path.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

for (const entrypoint of ["pipeline", "cli"] as const) it(`${entrypoint} audit identity survives restart and reprocesses changed input`, async () => {
  const storage=createOwnedTestDirectory("memory-audit-identity-"),dbPath=join(storage.dir,"synthetic.db"),log=join(storage.dir,"events","events-a.jsonl");
  const db=new OwnedDatabase(dbPath);
  const source=(path:string)=>JSON.stringify(resolve(import.meta.dir,"../../../src",path).replaceAll("\\","/"));
  const program=`
import { OwnedDatabase } from ${source("infrastructure/database/owned-database.ts")};
import { SqliteFactRepository } from ${source("infrastructure/database/repositories/fact-repository.ts")};
import { SqliteExtractionLogRepository } from ${source("infrastructure/database/repositories/extraction-log-repository.ts")};
import { SqliteMessageRepository } from ${source("infrastructure/database/repositories/message-repository.ts")};
import { ExtractionPipeline } from ${source("application/services/extraction-pipeline.ts")};
import { executeExtractCommand } from ${source("presentation/cli/commands/extract.ts")};
const [dbPath,log,entrypoint]=process.argv.slice(2);let calls=0,result;const provider={providerId:'synthetic',modelName:'synthetic',extract:async messages=>{calls++;return[{type:'learning',content:messages.at(-1).content,confidence:0.9,metadata:{}}];}};
if(entrypoint==='pipeline'){const db=new OwnedDatabase(dbPath);try{result=await new ExtractionPipeline(db,new SqliteFactRepository(db),new SqliteExtractionLogRepository(db),new SqliteMessageRepository(db),provider,undefined,log).extractFromSession('session','synthetic');}finally{db.close();}}
else{const emit=console.log;let output;try{console.log=value=>{output=JSON.parse(value);};result={command:await executeExtractCommand({project:'synthetic',json:true},{dbPath,eventLogPath:log,mockExtractor:provider}),get output(){return output;}};}finally{console.log=emit;}}
console.log(JSON.stringify({calls,result}));
`;
  let child:ReturnType<typeof Bun.spawn>|undefined;
  try{
    createSchema(db);db.exec("PRAGMA journal_mode=WAL");
    await new SqliteSessionRepository(db).save(Session.create({id:"session",projectPath:ProjectPath.fromDecoded("C:\\Projects\\synthetic"),startTime:new Date("2026-01-01T00:00:00Z")}));
    const messages=new SqliteMessageRepository(db),audits=new SqliteExtractionLogRepository(db);
    await messages.save(Message.create({id:"one",role:"user",content:"first synthetic input",timestamp:new Date("2026-01-01T00:00:00Z")}),"session");
    mkdirSync(join(storage.dir,"config","memory"),{recursive:true});writeFileSync(join(storage.dir,"config","memory","config.json"),JSON.stringify({embedding:{enabled:false}}));
    const script=join(storage.dir,"child.ts");writeFileSync(script,program);
    const run=async()=>{
      const running=Bun.spawn([process.execPath,script,dbPath,log,entrypoint],{cwd:storage.dir,stdout:"pipe",stderr:"pipe",timeout:20000,env:{...process.env,HOME:storage.dir,USERPROFILE:storage.dir,XDG_CONFIG_HOME:join(storage.dir,"config"),XDG_DATA_HOME:join(storage.dir,"data"),MEMORY_HOME:join(storage.dir,"legacy"),TEMP:storage.dir,TMP:storage.dir,TMPDIR:storage.dir}});child=running;
      const stdout=new Response(running.stdout).text(),stderr=new Response(running.stderr).text();expect(await running.exited,await stderr).toBe(0);return JSON.parse(await stdout);
    };
    expect((await run()).calls).toBe(1);
    const before=await audits.findById("session");
    expect((await run()).calls).toBe(0);
    expect(await audits.findById("session")).toEqual(before);
    await messages.save(Message.create({id:"two",role:"user",content:"entirely different subsequent observation",timestamp:new Date("2026-01-02T00:00:00Z")}),"session");
    const changed=await run();expect(changed.calls).toBe(1);
    if(entrypoint==='cli'){expect(changed.result.command.exitCode).toBe(0);expect(changed.result.output.meta.sessions_processed).toBe(1);}
    const after=await audits.findById("session");
    expect(before?.inputIdentity).toMatch(/^v1:[a-f0-9]{64}$/);
    expect(after?.inputIdentity).toMatch(/^v1:[a-f0-9]{64}$/);
    expect(after?.inputIdentity).not.toBe(before?.inputIdentity);
    expect(after?.inputIdentity).not.toContain("synthetic");
    expect((await run()).calls).toBe(0);
  }finally{if(child&&child.exitCode===null){child.kill();await child.exited;}db.close();storage.cleanup();}
},30000);
