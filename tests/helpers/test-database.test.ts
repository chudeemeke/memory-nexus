import {expect, test} from "bun:test";
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {createTestDatabase, createTestDir} from "./test-database";
import {closeDatabase} from "../../src/infrastructure/database/connection";
import {createOwnedTestDirectory, type OwnedTestDirectory} from "./owned-test-directory";

test("cleanup refuses a replacement directory and preserves its contents", () => {
  const fixture = createTestDir("memory-owner-regression-");
  const moved = fixture.dir + "-original";
  renameSync(fixture.dir, moved);
  mkdirSync(fixture.dir);
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
