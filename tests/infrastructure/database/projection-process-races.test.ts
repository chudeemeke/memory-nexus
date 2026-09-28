import { expect, it } from "bun:test";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { Fact } from "../../../src/domain/entities/fact.js";
import { appendEvent, rebuildProjections } from "../../../src/infrastructure/database/event-log.js";
import { recoverPendingProjections } from "../../../src/infrastructure/database/projection-recovery.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

for (const race of ["admitted-contender", "external-database-edit", "source-before-promotion", "source-during-promotion"] as const) {
  it(`retains concurrent process work across ${race}`, async () => {
    const storage = createOwnedTestDirectory("memory-projection-race-");
    const dbPath = join(storage.dir, "synthetic.db"), log = join(storage.dir, "events-synthetic.jsonl");
    const ready = join(storage.dir, "ready"), release = join(storage.dir, "release");
    const db = new OwnedDatabase(dbPath);
    const source = (path: string) => JSON.stringify(resolve(import.meta.dir, "../../../src", path).replaceAll("\\", "/"));
    const program = `
import { OwnedDatabase } from ${source("infrastructure/database/owned-database.ts")};
import { ProjectionRegistry } from ${source("application/services/projection-registry.ts")};
import { recoverPendingProjections } from ${source("infrastructure/database/projection-recovery.ts")};
import { existsSync, writeFileSync } from "node:fs";
const [dbPath,log,ready,release,race]=process.argv.slice(2);
const db=new OwnedDatabase(dbPath);db.exec("PRAGMA busy_timeout=0");
let reached=false;
function barrier(){
 if(reached)return;reached=true;writeFileSync(ready,JSON.stringify({pid:process.pid}));
 const deadline=Date.now()+12000,word=new Int32Array(new SharedArrayBuffer(4));
 while(!existsSync(release)){if(Date.now()>deadline)throw Error("Parent did not release barrier");Atomics.wait(word,0,0,5);}
}
const replay=ProjectionRegistry.prototype.replay;
ProjectionRegistry.prototype.replay=async function(...args){const result=await Reflect.apply(replay,this,args);if(race!=="source-during-promotion")barrier();return result;};
const run=db.run.bind(db);
db.run=function(...args){const result=Reflect.apply(run,db,args);if(race==="source-during-promotion"&&args[0]==='DELETE FROM main."facts"')barrier();return result;};
let recovery,error;
try{recovery=await recoverPendingProjections(db,log);}catch(cause){error=String(cause);}
finally{db.close();}
console.log(JSON.stringify({recovery,error,reached}));
`;
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
      createSchema(db); db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=0");
      const event = (uuid: string) => Fact.create({ uuid, type: "learning", project: "synthetic", content: uuid, observedAt: new Date("2026-01-01T00:00:00Z") });
      await appendEvent(event("baseline"), log); await rebuildProjections(db, log);
      await appendEvent(event("pending"), log);
      const script = join(storage.dir, "race.ts"); writeFileSync(script, program);
      const running = Bun.spawn([process.execPath, script, dbPath, log, ready, release, race], {
        cwd: storage.dir, stdout: "pipe", stderr: "pipe", timeout: 20000,
        env: { ...process.env, HOME: storage.dir, USERPROFILE: storage.dir, XDG_DATA_HOME: join(storage.dir,"data"),
          XDG_CONFIG_HOME: join(storage.dir,"config"), MEMORY_HOME: join(storage.dir,"legacy"), TEMP: storage.dir, TMP: storage.dir, TMPDIR: storage.dir },
      });
      child = running;
      const stdout = new Response(running.stdout).text(), stderr = new Response(running.stderr).text();
      const deadline = Date.now() + 12000;
      while (!existsSync(ready)) {
        if (Date.now() > deadline || child.exitCode !== null) throw new Error("Child did not reach barrier: " + await stderr);
        await Bun.sleep(5);
      }
      expect(JSON.parse(readFileSync(ready,"utf8")).pid).not.toBe(process.pid);
      if (race === "admitted-contender") {
        const beforeSource = readFileSync(log, "utf8"), beforeDb = db.serialize();
        await expect(appendEvent(event("denied"), log)).rejects.toThrow("busy");
        await expect(recoverPendingProjections(db, log)).rejects.toThrow("busy");
        expect(readFileSync(log, "utf8")).toBe(beforeSource);
        expect(db.serialize()).toEqual(beforeDb);
      } else if (race === "external-database-edit") {
        db.exec("UPDATE facts SET content='external edit'");
      } else {
        // Uncoordinated external I/O must still be caught by optimistic fences.
        appendFileSync(log, JSON.stringify({ uuid: "later", type: "learning", project: "synthetic", content: "later", observedAt: "2026-01-01T00:00:00Z" }) + "\n");
      }
      const rows = () => { using statement = db.prepare("SELECT uuid FROM facts ORDER BY uuid"); return statement.all(); };
      const contents = () => { using statement = db.prepare("SELECT uuid,content FROM facts ORDER BY uuid"); return statement.all(); };
      const receipt = () => { using statement = db.prepare<{manifest:string},[]>("SELECT manifest FROM projection_replay_state WHERE id=1"); return statement.get()!.manifest; };
      const before = { rows: rows(), receipt: receipt(), contents: contents() }, sourceBefore = readFileSync(log,"utf8");
      writeFileSync(release, "continue");
      expect(await child.exited, await stderr).toBe(0);
      const outcome = JSON.parse(await stdout);
      expect(outcome.reached).toBe(true);
      expect(readFileSync(log,"utf8")).toBe(sourceBefore);
      if (race === "source-during-promotion") {
        expect(outcome.recovery).toEqual({ rebuilt: true, pending: true });
        expect(rows()).toEqual([{uuid:"baseline"},{uuid:"pending"}]);
        expect(JSON.parse(receipt()).files[0].bytes).toBeLessThan(Buffer.byteLength(sourceBefore));
      } else if (race === "admitted-contender") {
        expect(outcome.recovery).toEqual({ rebuilt: true, pending: false });
      } else {
        expect(outcome.error).toContain(race === "external-database-edit" ? "Database changed" : "Projection source changed");
        expect({ rows: rows(), receipt: receipt(), contents: contents() }).toEqual(before);
      }
      if (race === "external-database-edit") await rebuildProjections(db, log);
      const retry = await recoverPendingProjections(db, log);
      expect(retry.pending).toBe(false);
      expect(rows()).toEqual(race === "admitted-contender" || race === "external-database-edit" ? [{uuid:"baseline"},{uuid:"pending"}] : [{uuid:"baseline"},{uuid:"later"},{uuid:"pending"}]);
      expect(await recoverPendingProjections(db, log)).toEqual({ rebuilt: false, pending: false });
    } finally {
      if (child && child.exitCode === null) { child.kill(); await child.exited; }
      db.close(); storage.cleanup();
    }
  }, 30000);
}
