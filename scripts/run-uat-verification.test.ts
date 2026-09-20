import {expect, test} from "bun:test";
import {Database} from "bun:sqlite";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {createOwnedTestDirectory} from "../tests/helpers/owned-test-directory";
import {existsSync,writeFileSync,renameSync,mkdirSync,unlinkSync,rmdirSync} from "node:fs";
import {runUatSandbox} from "./run-uat-verification";
import * as uat from "./run-uat-verification";

test("UAT command drains both pipes and preserves nonzero exit and diagnostics", async () => {
  const result = await uat.runUatCommand([process.execPath,"--eval",`
    setTimeout(()=>process.exit(91),5000);
    await new Promise(resolve=>process.stderr.write("e".repeat(2*1024*1024),resolve));
    console.log("PIPE_DRAINED");
    process.exitCode=7;
    process.exit(7);
  `],{});
  expect(result.code).toBe(7);
  expect(result.stdout).toBe("PIPE_DRAINED\n");
  expect(result.stderr).toBe("e".repeat(2*1024*1024));
});

test("UAT command stops a non-terminating child before returning failure", async () => {
  await expect(uat.runUatCommand([process.execPath,"--eval",`
    process.on("SIGTERM",()=>{});
    setTimeout(()=>process.exit(0),3000);
    setInterval(()=>{},100);
  `],{},250)).rejects.toThrow("UAT command terminated");
});

test.each([0,-1,NaN,Infinity,60_001])("UAT rejects invalid timeout %s before spawning", async timeout => {
  await expect(uat.runUatCommand(["deliberately-missing-uat-command"],{},timeout)).rejects.toThrow("timeout");
});

test("UAT command preserves a successful exit", async () => {
  expect(await uat.runUatCommand([process.execPath,"--eval","console.log('SYNTHETIC_SUCCESS')"],{}))
    .toEqual({code:0,stdout:"SYNTHETIC_SUCCESS\n",stderr:""});
});

test("UAT command reports a missing executable", async () => {
  await expect(uat.runUatCommand(["deliberately-missing-uat-command"],{})).rejects.toThrow();
});

test("synthetic UAT workflow replays both real database projections", () => {
  const fixture = createOwnedTestDirectory("memory-uat-replay-");
  const target = pathToFileURL(join(import.meta.dir,"run-uat-verification.ts")).href;
  const program = `
    import {verifySandbox,runUatSandbox,withUatDatabase} from ${JSON.stringify(target)};
    import {mkdirSync,writeFileSync,existsSync} from "node:fs";
    import {join} from "node:path";
    const content="Use links table for relational semantic trees";
    let firstReplay=false, secondReplay=false, exportText="", imported=false, commands=0;
    const passed=await runUatSandbox(dir=>verifySandbox(dir,async(cmd,env)=>{
      commands++;
      let stdout="";
      const database=join(env.XDG_DATA_HOME,"memory","memory.db");
      switch(cmd[1]) {
        case "sync": {
          const events=join(env.XDG_DATA_HOME,"memory","events");
          mkdirSync(events,{recursive:true});
          if(!existsSync(join(events,"events.jsonl")))writeFileSync(join(events,"events.jsonl"),JSON.stringify({
            uuid:"synthetic-seed",type:"decision",project:"project",content,metadata:{},
            observedAt:"2026-05-25T12:00:00.000Z",supersededAt:null,supersededBy:null,version:1
          })+"\\n");
          stdout="Discovered: 1";break;
        }
        case "status": stdout="=== Database Statistics === Database";break;
        case "stats": stdout="Sessions:";break;
        case "doctor": stdout="Integrity: ok";break;
        case "extract": stdout="Extraction Completed Successfully";break;
        case "export": exportText=await context(database);break;
        case "import": imported=true;break;
        case "query": {
          if(cmd[3]==="stats")stdout="Sessions:";
          else if(cmd[3]==="session")stdout="Session: session-uat-11111";
          else if(cmd[3]==="context") {
            if(imported)stdout=exportText;
            else if(!existsSync(database))stdout=content;
            else {
              stdout=await context(database);
              if(!stdout.includes(content))throw Error("Initial event did not reach real SQL projection");
              firstReplay=true;
              if(stdout.includes("tabs instead of spaces")) {
                const rows=await withUatDatabase(database,async db=>db.query("SELECT superseded_by FROM facts WHERE uuid = ?").all("fact-uuid-111111111111111111"));
                if(rows.length!==1||rows[0].superseded_by!=="fact-uuid-222222222222222222")throw Error("Second replay did not persist supersedence");
                secondReplay=true;
              }
            }
          } else stdout="session-uat-11111";
          break;
        }
        default: throw Error("Unexpected synthetic command: "+cmd[1]);
      }
      return {code:0,stdout,stderr:""};
    }));
    async function context(database) {
      const rows=await withUatDatabase(database,async db=>db.query("SELECT content FROM facts WHERE type = 'decision' AND superseded_at IS NULL ORDER BY observed_at").all());
      return rows.map(row=>row.content).join("\\n");
    }
    if(!passed||!firstReplay||!secondReplay||!imported||commands!==15)throw Error(JSON.stringify({passed,firstReplay,secondReplay,imported,commands}));
    console.log("REAL_REPLAY_CHECKS_PASSED");
  `;
  try {
    const child = Bun.spawnSync([process.execPath,"--eval",program], {
      cwd:fixture.dir,
      env:{...process.env,PATH:fixture.dir,TEMP:fixture.dir,TMP:fixture.dir,TMPDIR:fixture.dir,HOME:fixture.dir,USERPROFILE:fixture.dir},
      stdout:"pipe",stderr:"pipe",timeout:15000,
    });
    const stdout = new TextDecoder().decode(child.stdout), stderr = new TextDecoder().decode(child.stderr);
    const failedChecks=stdout.split("\n").filter(line=>line.includes("[FAIL]"));
    expect({exit:child.exitCode,stderr,failedChecks}).toEqual({exit:0,stderr:"",failedChecks:[]});
    expect(stdout).toContain("REAL_REPLAY_CHECKS_PASSED");
  } finally {fixture.cleanup();}
});

test("UAT opens and closes a real projection database with its default adapters", async () => {
  let database: Database | undefined;
  expect(await uat.withUatDatabase(":memory:", async db => {
    database = db;
    return db.query("SELECT 7 AS value").get();
  })).toEqual({value:7});
  expect(database).toBeDefined();
  expect(() => database!.exec("SELECT 1")).toThrow();
});

test.each(["success", "failure"])("UAT closes the projection handle after %s", async outcome => {
  const db = new Database(":memory:");
  const primary = new Error("replay interrupted");
  try {
    const result = uat.withUatDatabase(":memory:", async handle => {
      handle.exec("CREATE TABLE proof (value TEXT)");
      if (outcome === "failure") throw primary;
      return "replayed";
    }, () => db);
    if (outcome === "failure") await expect(result).rejects.toBe(primary);
    else expect(await result).toBe("replayed");
    expect(() => db.exec("SELECT 1")).toThrow();
  } finally { db.close(); }
});

test.each([false, true])("UAT preserves close failure with replay failure=%s", async failReplay => {
  const db = new Database(":memory:");
  const primary = new Error("replay failed"), closing = new Error("close failed");
  let closeCalls = 0;
  try {
    const result = uat.withUatDatabase(":memory:", async () => {
      if (failReplay) throw primary;
      return "replayed";
    }, () => db, () => { closeCalls++; throw closing; });
    if (failReplay) {
      const failure = await result.catch(error => error);
      expect(failure).toBeInstanceOf(AggregateError);
      expect(failure.errors).toEqual([primary, closing]);
    } else await expect(result).rejects.toBe(closing);
    expect(closeCalls).toBe(1);
  } finally { db.close(); }
});

test("UAT open failure preserves the cause without running replay or closing", async () => {
  const primary = new Error("open failed");
  let executed = false, closed = false;
  await expect(uat.withUatDatabase("unused", async () => {executed = true;},
    () => {throw primary;}, () => {closed = true;})).rejects.toBe(primary);
  expect({executed, closed}).toEqual({executed:false, closed:false});
});

test.each(["success", "checks", "setup", "allocation", "cleanup"])(
  "UAT reports process status and diagnostics for %s", mode => {
    const fixture = createOwnedTestDirectory("memory-uat-process-");
    const target = pathToFileURL(join(import.meta.dir, "run-uat-verification.ts")).href;
    const helper = pathToFileURL(join(import.meta.dir, "../tests/helpers/owned-test-directory.ts")).href;
    const program = `
      import {runUatVerification} from ${JSON.stringify(target)};
      import {createOwnedTestDirectory} from ${JSON.stringify(helper)};
      import {tmpdir} from "node:os";
      if(tmpdir()!==${JSON.stringify(fixture.dir)})throw Error("Synthetic temp isolation failed");
      const mode=${JSON.stringify(mode)};
      await runUatVerification(async()=>{
        if(mode==="setup")throw Error("SYNTHETIC_SETUP_FAILURE");
        return mode!=="checks";
      },()=>{
        if(mode==="allocation")throw Error("SYNTHETIC_ALLOCATION_FAILURE");
        const storage=createOwnedTestDirectory("memory-uat-child-");
        console.log("FIXTURE="+storage.dir);
        if(mode==="cleanup")return {...storage,cleanup(){throw Error("SYNTHETIC_CLEANUP_FAILURE");}};
        return storage;
      });
    `;
    try {
      const child = Bun.spawnSync([process.execPath,"--eval",program], {
        env:{...process.env,TEMP:fixture.dir,TMP:fixture.dir,TMPDIR:fixture.dir,HOME:fixture.dir,USERPROFILE:fixture.dir},
        stdout:"pipe",stderr:"pipe",timeout:15000,
      });
      const stdout = new TextDecoder().decode(child.stdout), stderr = new TextDecoder().decode(child.stderr);
      expect(child.exitCode).toBe(mode === "success" ? 0 : 1);
      expect(stdout).toContain(mode === "success" ? "STATUS: PASSED" : "STATUS: REJECTED");
      if (mode === "allocation") expect(stderr).toContain("SYNTHETIC_ALLOCATION_FAILURE");
      else {
        const retained = stdout.match(/FIXTURE=([^\r\n]+)/)?.[1];
        expect(retained).toBeDefined();
        expect(existsSync(retained!)).toBe(mode === "cleanup");
        if (mode === "cleanup") {
          expect(stderr).toContain(`UAT cleanup failed; retained: ${retained}`);
          expect(stderr).toContain("SYNTHETIC_CLEANUP_FAILURE");
        } else if (mode === "setup") expect(stderr).toContain("SYNTHETIC_SETUP_FAILURE");
        else expect(stderr).toBe("");
      }
    } finally {fixture.cleanup();}
  },
);

test.each([true,false])("UAT preserves check result %s and removes owned storage", async passed => {
  let path="";
  expect(await runUatSandbox(async dir=>{path=dir;writeFileSync(join(dir,"proof"),"synthetic");return passed;})).toBe(passed);
  expect(path).not.toBe("");
  expect(existsSync(path)).toBe(false);
});

test("UAT allocation failure is reported before checks execute", async () => {
  const primary=new Error("allocation denied"), reports: unknown[]=[];
  let executed=false;
  expect(await runUatSandbox(async()=>{executed=true;return true;},()=>{throw primary;},(_message,error)=>reports.push(error))).toBe(false);
  expect(executed).toBe(false);expect(reports).toEqual([primary]);
});

test("UAT refuses execution when initial ownership verification fails", async () => {
  const storage = createOwnedTestDirectory("memory-uat-guard-");
  const primary = new Error("ownership refused"), reports: unknown[] = [];
  let executed = false;
  try {
    expect(await runUatSandbox(async () => {executed = true; return true;},
      () => ({...storage, assertOwned() {throw primary;}}),
      (_message, error) => reports.push(error))).toBe(false);
    expect(executed).toBe(false);
    expect(reports).toEqual([primary]);
    expect(existsSync(storage.dir)).toBe(false);
  } finally {storage.cleanup();}
});

test("UAT preserves setup failure and reports retained cleanup failure", async () => {
  const primary=new Error("setup interrupted"), reports: Array<{message:string,error:unknown}>=[];
  let blocked=true;
  const storage=createOwnedTestDirectory("memory-uat-failure-",{remove(path){
    if(blocked)throw Object.assign(new Error("locked"),{code:"EBUSY"});
    // The owned-directory guard authorizes this exact fixture before removal.
    require("node:fs").rmSync(path,{recursive:true});
  }});
  try {
    expect(await runUatSandbox(async()=>{throw primary;},()=>storage,(message,error)=>reports.push({message,error}))).toBe(false);
    expect(reports[0]?.error).toBe(primary);expect(reports[1]?.message).toContain(storage.dir);
    expect(existsSync(storage.dir)).toBe(true);
  } finally {blocked=false;storage.cleanup();}
});

test("UAT cleanup failure prevents a passing result and preserves a replacement", async () => {
  const storage=createOwnedTestDirectory("memory-uat-replaced-"), moved=storage.dir+"-original";
  const reports:string[]=[];
  try {
    const passed=await runUatSandbox(async dir=>{
      renameSync(dir,moved);mkdirSync(dir);writeFileSync(join(dir,"keep"),"synthetic foreign data");return true;
    },()=>storage,message=>reports.push(message));
    expect(passed).toBe(false);expect(existsSync(join(storage.dir,"keep"))).toBe(true);
    expect(reports.join()).toContain(storage.dir);
  } finally {unlinkSync(join(storage.dir,"keep"));rmdirSync(storage.dir);renameSync(moved,storage.dir);storage.cleanup();}
});

test("importing UAT verification does not allocate a sandbox or execute checks", () => {
  const fixture=createOwnedTestDirectory("memory-uat-import-");
  const target=pathToFileURL(join(import.meta.dir,"run-uat-verification.ts")).href;
  const program=`
    import {tmpdir} from "node:os";
    import {readdirSync} from "node:fs";
    if(tmpdir()!==${JSON.stringify(fixture.dir)})throw Error("Synthetic temp isolation failed");
    // Bun can populate its own .bun cache while loading dependencies.
    const entries=()=>readdirSync(tmpdir()).filter(name=>name!==".bun").sort();
    const before=entries();
    await import(${JSON.stringify(target)});
    if(JSON.stringify(before)!==JSON.stringify(entries()))throw Error("Import wrote to sandbox storage");
    console.log("IMPORTED_WITHOUT_UAT");
  `;
  try {
    const child=Bun.spawnSync([process.execPath,"--eval",program],{
      cwd:fixture.dir,
      env:{...process.env,PATH:fixture.dir,TEMP:fixture.dir,TMP:fixture.dir,TMPDIR:fixture.dir,HOME:fixture.dir,USERPROFILE:fixture.dir},
      stdout:"pipe",stderr:"pipe",timeout:15000,
    });
    const output=new TextDecoder().decode(child.stdout)+new TextDecoder().decode(child.stderr);
    expect({exit:child.exitCode,output}).toEqual({exit:0,output:"IMPORTED_WITHOUT_UAT\n"});
  } finally {fixture.cleanup();}
});

test("UAT workflow rejects an injected command failure and cleans its isolated sandbox", () => {
  const fixture = createOwnedTestDirectory("memory-uat-main-");
  const target = pathToFileURL(join(import.meta.dir, "run-uat-verification.ts")).href;
  const helper = pathToFileURL(join(import.meta.dir, "../tests/helpers/owned-test-directory.ts")).href;
  const program = `
    import {runUatVerification,verifySandbox} from ${JSON.stringify(target)};
    import {tmpdir} from "node:os";
    import {createOwnedTestDirectory} from ${JSON.stringify(helper)};
    if(tmpdir()!==${JSON.stringify(fixture.dir)})throw Error("Synthetic temp isolation failed");
    await runUatVerification(dir=>verifySandbox(dir,async()=>{
      throw Error("SYNTHETIC_COMMAND_REFUSED");
    }),()=>{
      const storage=createOwnedTestDirectory("memory-uat-check-");
      console.log("FIXTURE="+storage.dir);
      return storage;
    });
  `;
  try {
    const child = Bun.spawnSync([process.execPath,"--eval",program], {
      cwd:fixture.dir,
      env:{...process.env,PATH:fixture.dir,TEMP:fixture.dir,TMP:fixture.dir,TMPDIR:fixture.dir,HOME:fixture.dir,USERPROFILE:fixture.dir},
      stdout:"pipe",stderr:"pipe",timeout:15000,
    });
    const stdout = new TextDecoder().decode(child.stdout), stderr = new TextDecoder().decode(child.stderr);
    expect(child.exitCode).toBe(1);
    expect(stdout).toContain("STATUS: REJECTED");
    expect(stderr).toContain("SYNTHETIC_COMMAND_REFUSED");
    const sandbox = stdout.match(/FIXTURE=([^\r\n]+)/)?.[1];
    expect(sandbox).toBeDefined();
    expect(existsSync(sandbox!)).toBe(false);
  } finally {fixture.cleanup();}
});
