import { expect, it, mock, spyOn } from "bun:test";
import { join } from "node:path";
import { mkdirSync, symlinkSync, cpSync, renameSync, readFileSync, existsSync, copyFileSync, writeFileSync, linkSync } from "node:fs";
import { createOwnedTestDirectory } from "../../../tests/helpers/owned-test-directory.js";
import { createSourceOperationAdmission } from "./source-operation-admission.js";
import { GitRemoteEventTransport } from "../remote/git-remote-event-transport.js";
import { OwnedDatabase } from "./owned-database.js";

it("shares one authority through root aliases and independent factory instances", async () => {
  const storage = createOwnedTestDirectory("memory-source-admission-");
  const root = join(storage.dir,"events"), alias = join(storage.dir,"alias");
  mkdirSync(root); symlinkSync(root,alias,process.platform === "win32" ? "junction" : "dir");
  let release!: () => void, owner: Promise<void> | undefined;
  const barrier = new Promise<void>(resolve => { release=resolve; });
  try {
    const first = createSourceOperationAdmission(join(root,"events-a.jsonl"));
    const same = createSourceOperationAdmission(join(alias,"events-b.jsonl"));
    owner = first.run(async () => { await barrier; });
    const contender=mock(); await expect(same.run(contender)).rejects.toThrow("busy"); expect(contender).not.toHaveBeenCalled();
    release(); await owner;
    expect(await same.run(async () => "fresh")).toBe("fresh");
    expect(existsSync(join(root,".memory-local","admission.sqlite"))).toBe(true);
    expect(readFileSync(join(root,".memory-local","admission.sqlite"))).toEqual(readFileSync(join(alias,".memory-local","admission.sqlite")));
  } finally { release(); await owner; storage.cleanup(); }
});

it("refuses copied source authority and replacement after binding", async () => {
  const storage=createOwnedTestDirectory("memory-source-replaced-");
  const root=join(storage.dir,"events"), copy=join(storage.dir,"copied");
  try {
    const original=createSourceOperationAdmission(join(root,"events-a.jsonl"));
    expect(await original.run(async()=>1)).toBe(1);
    cpSync(root,copy,{recursive:true});
    const copied=createSourceOperationAdmission(join(copy,"events-a.jsonl"));
    const operation=mock(); await expect(copied.run(operation)).rejects.toThrow("authority"); expect(operation).not.toHaveBeenCalled();
    renameSync(join(root,".memory-local"),join(root,"retained-local"));
    mkdirSync(join(root,".memory-local"));
    await expect(original.run(operation)).rejects.toThrow(); expect(operation).not.toHaveBeenCalled();
  } finally { storage.cleanup(); }
});

it("keeps separate roots independent and does not use configurable data directories", async () => {
  const storage=createOwnedTestDirectory("memory-source-roots-");
  try {
    const first=createSourceOperationAdmission(join(storage.dir,"a","events-a.jsonl"));
    const other=createSourceOperationAdmission(join(storage.dir,"b","events-b.jsonl"));
    expect(await first.run(()=>other.run(async()=>"independent"))).toBe("independent");
  } finally { storage.cleanup(); }
});

it("refuses a copied replacement authority even when a new factory binds the same root", async () => {
  const storage=createOwnedTestDirectory("memory-source-copy-");
  const log=join(storage.dir,"events","events-a.jsonl"),path=join(storage.dir,"events",".memory-local","admission.sqlite");
  try {
    const bound=createSourceOperationAdmission(log);await bound.run(async()=>{});
    renameSync(path,path+".retained");copyFileSync(path+".retained",path);
    const callback=mock();await expect(bound.run(callback)).rejects.toThrow("identity");expect(callback).not.toHaveBeenCalled();
    await expect(createSourceOperationAdmission(log).run(callback)).rejects.toThrow("authority");expect(callback).not.toHaveBeenCalled();
  } finally {storage.cleanup();}
});

it("refuses a moved authority whose file identity is unchanged but source root differs", async () => {
  const storage=createOwnedTestDirectory("memory-source-moved-");
  const first=join(storage.dir,"first"),second=join(storage.dir,"second");
  try {
    await createSourceOperationAdmission(join(first,"events-a.jsonl")).run(async()=>{});
    mkdirSync(second);renameSync(join(first,".memory-local"),join(second,".memory-local"));
    const callback=mock();await expect(createSourceOperationAdmission(join(second,"events-a.jsonl")).run(callback)).rejects.toThrow("different root");expect(callback).not.toHaveBeenCalled();
  } finally {storage.cleanup();}
});

it("keeps the authority out of an actual default transport commit", async () => {
  const storage=createOwnedTestDirectory("memory-source-git-");
  try {
    const root=join(storage.dir,"events"),log=join(root,"events-synthetic.jsonl");
    await createSourceOperationAdmission(log).run(async()=>{});
    writeFileSync(log,"synthetic event fixture\n");
    const transport=new GitRemoteEventTransport(root);
    expect((await transport.initRepository({machineId:"synthetic",userName:"Synthetic Test",userEmail:"synthetic@example.invalid"})).success).toBe(true);
    expect((await transport.commitEventLog("synthetic","Synthetic local fixture")).success).toBe(true);
    const child=Bun.spawnSync(["git","ls-tree","-r","--name-only","HEAD"],{cwd:root,stdout:"pipe",stderr:"pipe",timeout:10000});
    expect(child.exitCode).toBe(0);expect(new TextDecoder().decode(child.stdout).trim()).toBe("events-synthetic.jsonl");
    expect(existsSync(join(root,".memory-local","admission.sqlite"))).toBe(true);
  } finally {storage.cleanup();}
});

it("rejects a redirected namespace and hardlinked event source before provisioning", () => {
  const storage=createOwnedTestDirectory("memory-source-invalid-");
  try {
    const root=join(storage.dir,"events"),outside=join(storage.dir,"outside");mkdirSync(root);mkdirSync(outside);
    symlinkSync(outside,join(root,".memory-local"),process.platform==="win32"?"junction":"dir");
    expect(()=>createSourceOperationAdmission(join(root,"events-a.jsonl"))).toThrow("real directory");
    expect(existsSync(join(outside,"admission.sqlite"))).toBe(false);
    const log=join(storage.dir,"events-a.jsonl");writeFileSync(log,"synthetic\n");linkSync(log,join(storage.dir,"events-b.jsonl"));
    expect(()=>createSourceOperationAdmission(log)).toThrow("one link");
    expect(existsSync(join(storage.dir,".memory-local"))).toBe(false);
  } finally {storage.cleanup();}
});

it("fails after the callback if its source root alias was replaced", async () => {
  const storage=createOwnedTestDirectory("memory-source-post-check-");
  try {
    const root=join(storage.dir,"events"),moved=join(storage.dir,"retained");
    const authority=createSourceOperationAdmission(join(root,"events-a.jsonl"));
    await expect(authority.run(async()=>{renameSync(root,moved);mkdirSync(root);})).rejects.toThrow();
  } finally {storage.cleanup();}
});

it("preserves provisioning and close failures without publishing an incomplete authority", () => {
  const storage=createOwnedTestDirectory("memory-source-provision-failure-");
  const primary=Error("synthetic initialization failure"),cleanup=Error("synthetic close failure");
  const original=OwnedDatabase.prototype.exec;let connection:OwnedDatabase|undefined;
  const execute=spyOn(OwnedDatabase.prototype,"exec").mockImplementation(function(this:OwnedDatabase,...args){connection=this;if(args[0].startsWith("PRAGMA application_id"))throw primary;return Reflect.apply(original,this,args);});
  const close=spyOn(OwnedDatabase.prototype,"close").mockImplementation(()=>{throw cleanup;});
  try {
    let failure:unknown;
    try{createSourceOperationAdmission(join(storage.dir,"events-a.jsonl"));}catch(error){failure=error;}
    expect(failure).toBeInstanceOf(AggregateError);expect((failure as AggregateError).errors).toContain(primary);expect((failure as AggregateError).errors).toContain(cleanup);
    expect(existsSync(join(storage.dir,".memory-local","admission.sqlite"))).toBe(false);
  } finally {execute.mockRestore();close.mockRestore();connection?.close();storage.cleanup();}
});
