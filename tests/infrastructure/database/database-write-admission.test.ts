import { expect, it, spyOn } from "bun:test";
import { join } from "node:path";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { runDatabaseWrite, assertDatabaseWriteLease, assertNoDatabaseWriteScope } from "../../../src/infrastructure/database/database-write-admission.js";
import type { DatabaseWriteLease } from "../../../src/domain/ports/operation-admission.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

it("owns an asynchronous write reservation and commits explicit nested work", async () => {
  const storage=createOwnedTestDirectory("memory-db-write-");
  const db=new OwnedDatabase(join(storage.dir,"synthetic.db")),other=new OwnedDatabase(join(storage.dir,"synthetic.db"));
  try{
    db.exec("CREATE TABLE records(value TEXT); PRAGMA journal_mode=WAL; PRAGMA busy_timeout=0");other.exec("PRAGMA busy_timeout=0");
    let retained!:DatabaseWriteLease;
    expect(await runDatabaseWrite(db,async lease=>{
      retained=lease;assertDatabaseWriteLease(db,lease);
      db.exec("INSERT INTO records VALUES('outer')");
      await Promise.resolve();
      expect(()=>other.exec("INSERT INTO records VALUES('denied')")).toThrow();
      return runDatabaseWrite(db,async child=>{
        assertDatabaseWriteLease(db,child);db.exec("INSERT INTO records VALUES('nested')");return 7;
      },lease);
    })).toBe(7);
    expect(db.inTransaction).toBe(false);
    expect(()=>assertDatabaseWriteLease(db,retained)).toThrow("expired");
    other.exec("INSERT INTO records VALUES('fresh')");
    using rows=db.prepare("SELECT value FROM records ORDER BY rowid");
    expect(rows.all()).toEqual([{value:"outer"},{value:"nested"},{value:"fresh"}]);
  }finally{other.close();db.close();storage.cleanup();}
});

it("refuses forged wrong-connection and expired authority without adopting caller transactions", async () => {
  const db=new OwnedDatabase(":memory:"),other=new OwnedDatabase(":memory:");
  try{
    assertDatabaseWriteLease(db);
    const forged=Object.freeze({}) as DatabaseWriteLease;
    expect(()=>assertDatabaseWriteLease(db,forged)).toThrow("Invalid database write lease");
    await expect(runDatabaseWrite(db,async()=>{},forged)).rejects.toThrow("Invalid database write lease");
    let stale!:DatabaseWriteLease;
    await runDatabaseWrite(db,async lease=>{
      stale=lease;
      other.exec("BEGIN IMMEDIATE");
      expect(()=>assertDatabaseWriteLease(other,lease)).toThrow("Invalid database write lease");
      other.exec("ROLLBACK");
      expect(()=>assertDatabaseWriteLease(db)).toThrow("caller transaction");
    });
    await expect(runDatabaseWrite(db,async()=>{},stale)).rejects.toThrow("expired");
    await runDatabaseWrite(db,async()=>{expect(()=>assertDatabaseWriteLease(db,stale)).toThrow("expired");});
    db.exec("BEGIN IMMEDIATE");
    await expect(runDatabaseWrite(db,async()=>{throw Error("Must not run");})).rejects.toThrow("caller transaction");
    expect(db.inTransaction).toBe(true);db.exec("ROLLBACK");
  }finally{other.close();db.close();}
});

it("drains detached children before rollback and revokes descendants", async () => {
  const db=new OwnedDatabase(":memory:");db.exec("CREATE TABLE records(value TEXT)");
  let release!:()=>void;
  const barrier=new Promise<void>(resolve=>{release=resolve;});
  let child:Promise<void>|undefined,settled=false,revoked=false;
  try{
    const root=runDatabaseWrite(db,async parent=>{
      child=runDatabaseWrite(db,async lease=>{
        await barrier;
        try{assertDatabaseWriteLease(db,lease);}catch{revoked=true;}
        db.exec("INSERT INTO records VALUES('detached')");
      },parent);
      void child.catch(()=>{});
    });
    void root.then(()=>{settled=true;},()=>{settled=true;});
    await Bun.sleep(10);expect(settled).toBe(false);expect(db.inTransaction).toBe(true);
    release();await expect(root).rejects.toThrow("unawaited child");await child;
    expect(revoked).toBe(true);expect(db.inTransaction).toBe(false);
    using rows=db.prepare("SELECT * FROM records");expect(rows.all()).toEqual([]);
  }finally{release();if(child)await child;db.close();}
});

for(const fault of ["operation","begin-before","begin-after","begin-noop","commit-before","commit-noop","commit-after","rollback-before","rollback-noop","rollback-after","ended"] as const) {
  it(`retains database scope failure and reservation state for ${fault}`,async()=>{
    const db=new OwnedDatabase(":memory:");db.exec("CREATE TABLE records(value TEXT)");
    const exec=db.exec.bind(db);let called=false;
    const hook=spyOn(db,"exec").mockImplementation(sql=>{
      if((sql==="BEGIN IMMEDIATE"&&fault==="begin-before")||(sql==="COMMIT"&&fault==="commit-before")||(sql==="ROLLBACK"&&fault==="rollback-before"))throw Error("synthetic "+fault);
      if((sql==="BEGIN IMMEDIATE"&&fault==="begin-noop")||(sql==="COMMIT"&&fault==="commit-noop")||(sql==="ROLLBACK"&&fault==="rollback-noop"))return {changes:0,lastInsertRowid:0};
      const outcome=exec(sql);
      if((sql==="BEGIN IMMEDIATE"&&fault==="begin-after")||(sql==="COMMIT"&&fault==="commit-after")||(sql==="ROLLBACK"&&fault==="rollback-after"))throw Error("synthetic "+fault);
      return outcome;
    });
    try{
      let failure:unknown;
      try{await runDatabaseWrite(db,async lease=>{
        called=true;db.exec("INSERT INTO records VALUES('work')");
        if(fault==="ended"){db.exec("ROLLBACK");expect(()=>assertDatabaseWriteLease(db,lease)).toThrow("ended unexpectedly");return;}
        if(fault==="operation"||fault.startsWith("rollback"))throw Error("primary operation failure");
      });}catch(error){failure=error;}
      expect(failure).toBeInstanceOf(Error);
      const message=String(failure);
      expect(message).toContain(fault==="operation"||fault.startsWith("rollback")?"primary operation failure":fault==="ended"?"ended unexpectedly":fault==="begin-noop"?"reservation was not acquired":fault==="commit-noop"?"commit did not close":"synthetic "+fault);
      expect(called).toBe(!fault.startsWith("begin"));
      const remainsOpen=fault==="rollback-before"||fault==="rollback-noop";
      expect(db.inTransaction).toBe(remainsOpen);
      if(fault.startsWith("rollback")){expect(failure).toBeInstanceOf(AggregateError);if(remainsOpen)expect(message).toContain("reservation remains open");}
      if(remainsOpen) expect(()=>assertNoDatabaseWriteScope(db)).toThrow("owned database write scope");
      hook.mockRestore();if(db.inTransaction)db.exec("ROLLBACK");
      assertNoDatabaseWriteScope(db);
      using rows=db.prepare("SELECT * FROM records");expect(rows.all()).toEqual(fault==="commit-after"?[{value:"work"}]:[]);
      expect(await runDatabaseWrite(db,async()=>9)).toBe(9);
    }finally{hook.mockRestore();if(db.inTransaction)db.exec("ROLLBACK");db.close();}
  });
}
