import {expect, test, spyOn} from "bun:test";
import {Database} from "bun:sqlite";
import {spawn} from "node:child_process";
import {existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {createTestDatabase, createTestDir} from "./test-database";
import {closeDatabase} from "../../src/infrastructure/database/connection";
import {createOwnedTestDirectory, type OwnedTestDirectory} from "./owned-test-directory";

test("cleanup refuses a replacement directory and preserves its contents", () => {
  const fixture = createTestDir("memory-owner-regression-");
  const moved = fixture.dir + "-original";
  const owner=readFileSync(join(fixture.dir,".memory-test-owner.json"));
  renameSync(fixture.dir, moved);
  mkdirSync(fixture.dir);
  writeFileSync(join(fixture.dir,".memory-test-owner.json"),owner);
  const marker = join(fixture.dir, "foreign-marker.txt");
  writeFileSync(marker, "preserve");
  try {
    expect(() => fixture.cleanup()).toThrow();
    expect(readFileSync(marker, "utf8")).toBe("preserve");
  } finally {
    // Both exact paths were created above by this test; the replacement contains
    // only our synthetic marker. Never enumerate/delete unrelated temp entries.
    if (existsSync(fixture.dir)) rmSync(fixture.dir, {recursive:true});
    renameSync(moved, fixture.dir);
    fixture.cleanup();
  }
});

test("real SQLite fixture is usable and successful cleanup is idempotent", () => {
  const fixture = createTestDatabase({walMode:false,applySchema:false});
  fixture.db.exec("CREATE TABLE proof (value TEXT); INSERT INTO proof VALUES ('retained')");
  expect(fixture.db.query("SELECT value FROM proof").get()).toEqual({value:"retained"});
  fixture.cleanup();
  expect(existsSync(fixture.dir)).toBe(false);
  expect(() => fixture.cleanup()).not.toThrow();
});

test("initialization failure reclaims the owned allocation and preserves the cause", () => {
  let dir = "";
  const primary = new Error("initialization failed");
  expect(() => createTestDatabase({}, {
    createDirectory(prefix) { const storage=createOwnedTestDirectory(prefix);dir=storage.dir;return storage; },
    initialize() { throw primary; },
  })).toThrow(primary);
  expect(existsSync(dir)).toBe(false);
});

test("initialization and cleanup failures preserve both errors and retained path", () => {
  let storage: OwnedTestDirectory;
  let blocked = true;
  const primary = new Error("initialization failed");
  const removal = new Error("removal failed");
  try {
    createTestDatabase({}, {
      createDirectory(prefix) {
        storage=createOwnedTestDirectory(prefix,{remove(path) {if(blocked)throw removal;rmSync(path,{recursive:true});}});
        return storage;
      }, initialize() {throw primary;},
    });
    throw new Error("expected initialization to fail");
  } catch(error) {
    try {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors[0]).toBe(primary);
      expect((error as AggregateError).errors[1].cause).toBe(removal);
      expect((error as Error).message).toContain(storage!.dir);
      expect(existsSync(storage!.dir)).toBe(true);
    } finally { blocked=false; storage!.cleanup(); }
  }
});

test("partial removal restores ownership and retry does not close SQLite twice", () => {
  let attempts=0, closes=0;
  const fixture=createTestDatabase({}, {
    createDirectory(prefix) {return createOwnedTestDirectory(prefix,{remove(path) {
      if(++attempts===1){rmSync(join(path,".memory-test-owner.json"));throw new Error("partial removal");}
      rmSync(path,{recursive:true});
    }});},
    close(db){closes++;closeDatabase(db);},
  });
  try {
    expect(()=>fixture.cleanup()).toThrow(fixture.dir);
    expect(existsSync(join(fixture.dir,".memory-test-owner.json"))).toBe(true);
    fixture.cleanup();
    expect(closes).toBe(1);
    expect(attempts).toBe(2);
    expect(existsSync(fixture.dir)).toBe(false);
  } finally {fixture.cleanup();}
});

test("collection failure is visible and retry skips an already closed handle", () => {
  let attempts=0, closes=0;
  const fixture=createTestDatabase({}, {
    collect(){if(++attempts===1)throw new Error("collection failed");Bun.gc(true);},
    close(db){closes++;closeDatabase(db);},
  });
  try {
    expect(()=>fixture.cleanup()).toThrow(fixture.dir);
    expect(existsSync(fixture.dir)).toBe(true);
    fixture.cleanup();
    expect(closes).toBe(1);
  } finally {fixture.cleanup();}
});

test("changed owner marker is refused without deleting fixture contents", () => {
  const fixture=createTestDir();
  const path=join(fixture.dir,".memory-test-owner.json");
  const original=readFileSync(path,"utf8");
  writeFileSync(path,"changed");
  try {expect(()=>fixture.cleanup()).toThrow(fixture.dir);expect(readFileSync(path,"utf8")).toBe("changed");}
  finally {writeFileSync(path,original);fixture.cleanup();}
});

test("prefixes cannot escape the temporary allocation parent", () => {
  for(const prefix of ["../foreign-","C:\\foreign-","/foreign-","", ".", "x".repeat(81)]) {
    expect(()=>createTestDir(prefix)).toThrow("Invalid test directory prefix");
  }
});

test("independent fixtures do not share cleanup authority", () => {
  const left=createTestDir(), right=createTestDir();
  try {
    expect(left.dir).not.toBe(right.dir);
    left.cleanup();
    expect(existsSync(right.dir)).toBe(true);
  } finally {left.cleanup();right.cleanup();}
});

test("a directory link replacement cannot redirect cleanup to another fixture", () => {
  const fixture=createTestDir(), foreign=createTestDir();
  const moved=fixture.dir+"-original";
  writeFileSync(join(foreign.dir,"keep.txt"),"preserve");
  renameSync(fixture.dir,moved);
  symlinkSync(foreign.dir,fixture.dir,process.platform==="win32"?"junction":"dir");
  try {
    expect(()=>fixture.cleanup()).toThrow(fixture.dir);
    expect(readFileSync(join(foreign.dir,"keep.txt"),"utf8")).toBe("preserve");
  } finally {
    unlinkSync(fixture.dir);renameSync(moved,fixture.dir);fixture.cleanup();foreign.cleanup();
  }
});

test("cleanup unlinks a nested directory link without deleting its target", () => {
  const fixture=createTestDir(), foreign=createTestDir();
  writeFileSync(join(foreign.dir,"keep.txt"),"preserve");
  symlinkSync(foreign.dir,join(fixture.dir,"link"),process.platform==="win32"?"junction":"dir");
  try {
    fixture.cleanup();
    expect(readFileSync(join(foreign.dir,"keep.txt"),"utf8")).toBe("preserve");
  } finally {fixture.cleanup();foreign.cleanup();}
});

const windowsTest = process.platform === "win32" ? test : test.skip;

async function withLockHolder(
  script: string,
  target: string,
  exercise: (holder: {child: ReturnType<typeof spawn>; ready: Promise<void>; exited: Promise<number|null>}) => Promise<void>,
  command = "powershell.exe",
): Promise<void> {
  const child=spawn(command,["-NoProfile","-NonInteractive","-File",script,target],{windowsHide:true,timeout:15000,killSignal:"SIGKILL",stdio:["pipe","pipe","pipe"]});
  const exited=new Promise<number|null>(resolve=>child.once("close",resolve));
  let output="", errors="";
  child.stderr.on("data",chunk=>{errors+=String(chunk);});
  const ready=new Promise<void>((resolve,reject)=>{
    child.stdout.on("data",chunk=>{output+=String(chunk);if(output.includes("READY"))resolve();});
    child.once("error",reject);
    child.once("close",()=>{if(!output.includes("READY"))reject(new Error(`Lock holder did not become ready: ${errors}`));});
  });
  try { await exercise({child,ready,exited}); }
  finally {
    if(child.exitCode===null&&child.signalCode===null)child.kill();
    await exited;
  }
}

windowsTest("a real Windows file lock retains ownership until a successful retry", async () => {
  const fixture=createTestDir("memory-lock-target-"), control=createTestDir("memory-lock-control-");
  const target=join(fixture.dir,"locked.txt");
  const script=join(control.dir,"hold.ps1");
  const owner=readFileSync(join(fixture.dir,".memory-test-owner.json"),"utf8");
  writeFileSync(target,"locked content");
  writeFileSync(script, 'param([string]$Target)\n$stream = [System.IO.File]::Open($Target, "Open", "ReadWrite", "None")\ntry {\n[Console]::Out.WriteLine("READY")\n[Console]::Out.Flush()\n[Console]::In.ReadLine() | Out-Null\n} finally { $stream.Dispose() }\n');
  try {
    await withLockHolder(script,target,async ({child,ready,exited})=>{
      await ready;
      expect(()=>fixture.cleanup()).toThrow(fixture.dir);
      expect(existsSync(target)).toBe(true);
      expect(readFileSync(join(fixture.dir,".memory-test-owner.json"),"utf8")).toBe(owner);
      child.stdin!.end("\n");
      expect(await exited).toBe(0);
      expect(readFileSync(target,"utf8")).toBe("locked content");
      fixture.cleanup();
      expect(existsSync(fixture.dir)).toBe(false);
    });
  } finally {
    fixture.cleanup();control.cleanup();
  }
},20000);

windowsTest("lock-holder startup failure reports diagnostics and permits fixture recovery", async () => {
  const control=createTestDir("memory-lock-startup-");
  const script=join(control.dir,"fail.ps1");
  writeFileSync(script,'[Console]::Out.WriteLine("STARTING")\n[Console]::Error.WriteLine("startup refused")\nexit 23\n');
  try {
    await withLockHolder(script,"unused",async ({ready,exited})=>{
      await expect(ready).rejects.toThrow("startup refused");
      expect(await exited).toBe(23);
    });
    control.cleanup();
    expect(existsSync(control.dir)).toBe(false);
  } finally {control.cleanup();}
},20000);

windowsTest("lock-holder process creation failure rejects readiness without hanging", async () => {
  const control=createTestDir("memory-lock-spawn-");
  try {
    await withLockHolder("unused","unused",async ({child,ready,exited})=>{
      await expect(ready).rejects.toThrow("ENOENT");
      expect(child.pid).toBeUndefined();
      expect(await exited).not.toBe(0);
    },join(control.dir,"nonexistent.exe"));
  } finally {control.cleanup();}
},20000);

windowsTest.each([false,true])("interrupted lock-holder callback preserves failure and reaps the child (already terminated: %s)", async terminated => {
  const control=createTestDir("memory-lock-interrupted-");
  const script=join(control.dir,"wait.ps1");
  writeFileSync(script,'[Console]::Out.WriteLine("READY")\n[Console]::Out.Flush()\n[Console]::In.ReadLine() | Out-Null\n');
  const primary=new Error("fixture assertion interrupted");
  let verify!: () => void;
  try {
    await expect(withLockHolder(script,"unused",async ({child,ready,exited})=>{
      await ready;
      const kill=spyOn(child,"kill");
      verify=()=>{
        expect(child.killed).toBe(true);
        expect(child.signalCode).toBe("SIGTERM");
        expect(kill).toHaveBeenCalledTimes(1);
      };
      if(terminated){child.kill();await exited;}
      throw primary;
    })).rejects.toBe(primary);
    verify();
    control.cleanup();
    expect(existsSync(control.dir)).toBe(false);
  } finally {control.cleanup();}
},20000);

test("failed database close retains the directory and can be retried", () => {
  let attempts = 0;
  const fixture = createTestDatabase({}, {close(db) {
    if (++attempts === 1) throw new Error("injected close failure");
    closeDatabase(db);
  }});
  try {
    expect(() => fixture.cleanup()).toThrow(fixture.dir);
    expect(existsSync(fixture.path)).toBe(true);
    fixture.cleanup();
    expect(existsSync(fixture.dir)).toBe(false);
    fixture.cleanup();
    expect(attempts).toBe(2);
  } finally { fixture.cleanup(); }
});

test.each([false,true])("ownership allocation failure preserves errors (partial write: %s)", partial => {
  let dir="";
  let unexpected: OwnedTestDirectory|undefined;
  const primary=new Error("owner write failed");
  try {
    let failure:unknown;
    try {
      unexpected=createOwnedTestDirectory("memory-owner-write-",{writeOwner(path,owner) {
        dir=dirname(path);
        if(partial)writeFileSync(path,owner.slice(0,10),{flag:"wx"});
        throw primary;
      }});
    } catch(error){failure=error;}
    if(partial){
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors[0]).toBe(primary);
      expect((failure as Error).message).toContain(dir);
    } else expect(failure).toBe(primary);
    expect(dir).not.toBe("");
    expect(existsSync(dir)).toBe(partial);
  } finally {
    if(unexpected)unexpected.cleanup();
    if(dir&&existsSync(dir)){
      // Only the synthetic partial marker was created; non-recursive retirement
      // refuses any unexpected additional files instead of deleting them.
      unlinkSync(join(dir,".memory-test-owner.json"));rmdirSync(dir);
    }
  }
});

test("marker restoration failure reports both errors and preserves the directory", () => {
  let writes=0, removals=0, owner="";
  const removeError=new Error("partial removal"), restoreError=new Error("restore denied");
  const fixture=createOwnedTestDirectory("memory-owner-restore-",{
    writeOwner(path,value){owner=value;if(++writes===2)throw restoreError;writeFileSync(path,value,{flag:"wx"});},
    remove(path){if(++removals===1){unlinkSync(join(path,".memory-test-owner.json"));throw removeError;}rmSync(path,{recursive:true});},
  });
  try {
    let failure:unknown;
    try {fixture.cleanup();}catch(error){failure=error;}
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([removeError,restoreError]);
    expect((failure as Error).message).toContain(fixture.dir);
    expect(existsSync(fixture.dir)).toBe(true);
    expect(existsSync(join(fixture.dir,".memory-test-owner.json"))).toBe(false);
  } finally {
    const marker=join(fixture.dir,".memory-test-owner.json");
    if(!existsSync(marker))writeFileSync(marker,owner,{flag:"wx"});
    fixture.cleanup();
  }
});

test("default helper entrypoints create independent usable fixtures", () => {
  const storage=createOwnedTestDirectory();
  const database=createTestDatabase();
  try {
    expect(database.db.query("SELECT count(*) AS count FROM sessions").get()).toEqual({count:0});
    expect(storage.dir).not.toBe(database.dir);
  } finally {database.cleanup();storage.cleanup();}
});

test("ownership allocation never retires a replacement after its marker write fails", () => {
  let dir="", moved="";
  const primary=new Error("allocation interrupted");
  try {
    let failure:unknown;
    try {
      createOwnedTestDirectory("memory-claim-replaced-",{writeOwner(path) {
        dir=dirname(path);moved=dir+"-original";
        renameSync(dir,moved);mkdirSync(dir);writeFileSync(join(dir,"keep.txt"),"preserve");
        throw primary;
      }});
    }catch(error){failure=error;}
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors[0]).toBe(primary);
    expect((failure as Error).message).toContain(dir);
    expect(readFileSync(join(dir,"keep.txt"),"utf8")).toBe("preserve");
  }finally{
    if(dir){unlinkSync(join(dir,"keep.txt"));rmdirSync(dir);rmdirSync(moved);}
  }
});

test("transient busy removal collects again and retries without reclosing SQLite", () => {
  let attempts=0, collections=0, closes=0, busy=true;
  const waits:number[]=[];
  const fixture=createTestDatabase({}, {
    createDirectory(prefix){return createOwnedTestDirectory(prefix,{remove(path){
      if(++attempts<3&&busy)throw Object.assign(new Error("busy"),{code:"EBUSY"});
      rmSync(path,{recursive:true});
    }});},
    collect(){collections++;Bun.gc(true);},
    waitBeforeRetry(attempt){waits.push(attempt);},
    close(db){closes++;closeDatabase(db);},
  });
  try {
    fixture.cleanup();
    expect(attempts).toBe(3);expect(collections).toBe(3);expect(closes).toBe(1);
    expect(waits).toEqual([1,2]);
    expect(existsSync(fixture.dir)).toBe(false);
  }finally{busy=false;fixture.cleanup();}
});

test.each(["EBUSY","EPERM","EIO"])("persistent removal error %s has bounded retries and remains recoverable", code => {
  let attempts=0, blocked=true, closes=0;
  const fixture=createTestDatabase({}, {
    createDirectory(prefix){return createOwnedTestDirectory(prefix,{remove(path){
      attempts++;if(blocked)throw Object.assign(new Error("injected removal failure"),{code});
      rmSync(path,{recursive:true});
    }});},close(db){closes++;closeDatabase(db);},
  });
  try {
    expect(()=>fixture.cleanup()).toThrow(fixture.dir);
    expect(attempts).toBe(code==="EIO"?1:3);
    expect(existsSync(fixture.path)).toBe(true);
    blocked=false;fixture.cleanup();expect(closes).toBe(1);
  }finally{blocked=false;fixture.cleanup();}
});

test("a busy retry rechecks directory identity before any further removal", () => {
  let attempts=0, moved="";
  const fixture=createTestDatabase({}, {
    createDirectory(prefix){return createOwnedTestDirectory(prefix,{remove(path){
      if(++attempts===1){
        const owner=readFileSync(join(path,".memory-test-owner.json"));
        moved=path+"-original";renameSync(path,moved);mkdirSync(path);
        writeFileSync(join(path,".memory-test-owner.json"),owner);writeFileSync(join(path,"keep.txt"),"preserve");
        throw Object.assign(new Error("busy"),{code:"EBUSY"});
      }
      rmSync(path,{recursive:true});
    }});},
  });
  try {
    expect(()=>fixture.cleanup()).toThrow("ownership changed");
    expect(attempts).toBe(1);
    expect(readFileSync(join(fixture.dir,"keep.txt"),"utf8")).toBe("preserve");
  }finally{
    unlinkSync(join(fixture.dir,"keep.txt"));unlinkSync(join(fixture.dir,".memory-test-owner.json"));
    rmdirSync(fixture.dir);renameSync(moved,fixture.dir);fixture.cleanup();
  }
});

test("a non-Error cleanup failure is reported without blind retries", () => {
  let blocked=true, attempts=0;
  const fixture=createTestDatabase({}, {
    createDirectory(prefix){
      const storage=createOwnedTestDirectory(prefix);
      return {...storage,cleanup(){attempts++;if(blocked)throw "unexpected cleanup failure";storage.cleanup();}};
    },
  });
  try {
    expect(()=>fixture.cleanup()).toThrow("unexpected cleanup failure");
    expect(attempts).toBe(1);expect(existsSync(fixture.dir)).toBe(true);
  }finally{blocked=false;fixture.cleanup();}
});

test.each(["missing","same-length-change","directory","hard-link"])("an ownership marker that is %s cannot authorize cleanup", shape => {
  const fixture=createTestDir(), control=createTestDir();
  const marker=join(fixture.dir,".memory-test-owner.json"), extra=join(control.dir,"owner-copy");
  const owner=readFileSync(marker,"utf8");
  writeFileSync(join(fixture.dir,"keep.txt"),"preserve");
  if(shape==="missing")unlinkSync(marker);
  if(shape==="same-length-change")writeFileSync(marker,owner.slice(0,-1)+"!");
  if(shape==="directory"){unlinkSync(marker);mkdirSync(marker);}
  if(shape==="hard-link")linkSync(marker,extra);
  try {
    expect(()=>fixture.cleanup()).toThrow(fixture.dir);
    expect(readFileSync(join(fixture.dir,"keep.txt"),"utf8")).toBe("preserve");
  }finally{
    if(existsSync(extra))unlinkSync(extra);
    if(existsSync(fixture.dir)){
      if(shape==="directory")rmdirSync(marker);
      writeFileSync(marker,owner);
    }
    fixture.cleanup();control.cleanup();
  }
});

test("partial cleanup never overwrites a changed owner marker", () => {
  let attempts=0;
  const fixture=createOwnedTestDirectory("memory-marker-changed-",{remove(path){
    if(++attempts===1){writeFileSync(join(path,".memory-test-owner.json"),"replacement-owner");throw new Error("partial failure");}
    rmSync(path,{recursive:true});
  }});
  const marker=join(fixture.dir,".memory-test-owner.json"), owner=readFileSync(marker,"utf8");
  try {
    expect(()=>fixture.cleanup()).toThrow("partial failure");
    expect(readFileSync(marker,"utf8")).toBe("replacement-owner");
    expect(()=>fixture.cleanup()).toThrow("ownership marker changed");
    expect(attempts).toBe(1);
  }finally{writeFileSync(marker,owner);fixture.cleanup();}
});

test("a file replacing the allocated directory is preserved", () => {
  const fixture=createTestDir(), moved=fixture.dir+"-original";
  renameSync(fixture.dir,moved);writeFileSync(fixture.dir,"preserve");
  try {
    expect(()=>fixture.cleanup()).toThrow("ownership changed");
    expect(readFileSync(fixture.dir,"utf8")).toBe("preserve");
  }finally{unlinkSync(fixture.dir);renameSync(moved,fixture.dir);fixture.cleanup();}
});

test("closing a database prevents execution of retained cached statements", () => {
  const db=new Database(":memory:");
  const statement=db.query("SELECT 1 AS value");
  expect(statement.get()).toEqual({value:1});
  try {
    closeDatabase(db);
    expect(()=>statement.get()).toThrow();
  }finally{statement.finalize();db.close();}
});
