import { expect, it } from "bun:test";
import { join } from "node:path";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { runDatabaseWrite } from "../../../src/infrastructure/database/database-write-admission.js";
import { createSourceOperationAdmission } from "../../../src/infrastructure/database/source-operation-admission.js";
import { appendEvent, rebuildProjections } from "../../../src/infrastructure/database/event-log.js";
import { recoverPendingProjections } from "../../../src/infrastructure/database/projection-recovery.js";
import { Fact } from "../../../src/domain/entities/fact.js";
import { Message } from "../../../src/domain/entities/message.js";
import { SqliteMessageRepository } from "../../../src/infrastructure/database/repositories/message-repository.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";
import type { DatabaseWriteLease } from "../../../src/domain/ports/operation-admission.js";
import { captureProjectionFence } from "../../../src/infrastructure/database/projection-replacement.js";

it("nested replay stays inside its owned database transaction and rolls back with the outer action",async()=>{
  const storage=createOwnedTestDirectory("memory-db-write-replay-"),db=new OwnedDatabase(join(storage.dir,"synthetic.db")),log=join(storage.dir,"events","events-a.jsonl");
  try{
    createSchema(db);
    const fact=(uuid:string)=>Fact.create({uuid,type:"learning",project:"synthetic",content:uuid,observedAt:new Date("2026-01-01T00:00:00Z")});
    await appendEvent(fact("baseline"),log);await rebuildProjections(db,log);
    const rows=()=>{using query=db.prepare("SELECT uuid FROM facts ORDER BY uuid");return query.all();};
    const receipt=()=>{using query=db.prepare("SELECT manifest FROM projection_replay_state");return query.all();};
    const before={rows:rows(),receipt:receipt()};
    await appendEvent(fact("pending"),log);
    let replayed=false;
    await expect(createSourceOperationAdmission(log).run(source=>runDatabaseWrite(db,async lease=>{
      expect(await recoverPendingProjections(db,log,undefined,source,lease)).toEqual({rebuilt:true,pending:false});
      expect(rows()).toEqual([{uuid:"baseline"},{uuid:"pending"}]);replayed=true;
      expect(db.inTransaction).toBe(true);throw Error("synthetic outer failure");
    }))).rejects.toThrow("synthetic outer failure");
    expect(replayed).toBe(true);expect(db.inTransaction).toBe(false);
    expect({rows:rows(),receipt:receipt()}).toEqual(before);
    expect(await recoverPendingProjections(db,log)).toEqual({rebuilt:true,pending:false});
    expect(rows()).toEqual([{uuid:"baseline"},{uuid:"pending"}]);
  }finally{db.close();storage.cleanup();}
});

it("recovery and replay preserve foreign transactions and reject expired or forged scopes",async()=>{
  const storage=createOwnedTestDirectory("memory-db-write-refusal-"),db=new OwnedDatabase(join(storage.dir,"synthetic.db")),log=join(storage.dir,"events","events-a.jsonl");
  try{
    createSchema(db);await appendEvent(Fact.create({uuid:"baseline",type:"learning",project:"synthetic",content:"baseline",observedAt:new Date("2026-01-01T00:00:00Z")}),log);await rebuildProjections(db,log);
    const before=db.serialize();
    const calls=[(lease?:DatabaseWriteLease)=>rebuildProjections(db,log,undefined,"explicit",undefined,lease),(lease?:DatabaseWriteLease)=>recoverPendingProjections(db,log,undefined,undefined,lease)];
    db.exec("BEGIN IMMEDIATE");
    expect(()=>captureProjectionFence(db)).toThrow("caller transaction");
    for(const call of calls)await expect(call()).rejects.toThrow("caller transaction");
    expect(db.inTransaction).toBe(true);db.exec("ROLLBACK");
    let stale!:DatabaseWriteLease;await runDatabaseWrite(db,async lease=>{stale=lease;});
    for(const call of calls){await expect(call(stale)).rejects.toThrow("expired");await expect(call({} as DatabaseWriteLease)).rejects.toThrow("Invalid database write lease");}
    expect(db.serialize()).toEqual(before);
  }finally{db.close();storage.cleanup();}
});

it("message repository writes cannot join an extraction scope on the same connection",async()=>{
  const db=new OwnedDatabase(":memory:");
  try{
    createSchema(db);const messages=new SqliteMessageRepository(db);
    const message=Message.create({id:"message",role:"user",content:"synthetic",timestamp:new Date("2026-01-01T00:00:00Z")});
    await runDatabaseWrite(db,async()=>{
      await expect(messages.save(message,"synthetic")).rejects.toThrow("owned database write scope");
      await expect(messages.saveMany([{message,sessionId:"synthetic"}])).rejects.toThrow("owned database write scope");
      expect(await messages.findBySession("synthetic")).toEqual([]);
    });
    await messages.save(message,"synthetic");expect(await messages.findBySession("synthetic")).toHaveLength(1);
  }finally{db.close();}
});

it("message batches recheck ownership after a progress callback and retry idempotently",async()=>{
  const db=new OwnedDatabase(":memory:");let release!:()=>void,scope:Promise<void>|undefined;
  const barrier=new Promise<void>(resolve=>{release=resolve;});
  try{
    createSchema(db);const messages=new SqliteMessageRepository(db);
    const input=Array.from({length:101},(_,i)=>({sessionId:"synthetic",message:Message.create({id:String(i),role:"user",content:"synthetic",timestamp:new Date("2026-01-01T00:00:00Z")})}));
    await expect(messages.saveMany(input,{onProgress:()=>{scope=runDatabaseWrite(db,async()=>{await barrier;});}})).rejects.toThrow("owned database write scope");
    expect(await messages.findBySession("synthetic")).toHaveLength(100);
    release();await scope;
    expect(await messages.saveMany(input)).toEqual({inserted:1,skipped:100,errors:[]});
    expect(await messages.findBySession("synthetic")).toHaveLength(101);
  }finally{release();await scope;db.close();}
});
