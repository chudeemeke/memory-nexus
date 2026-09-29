import { expect, it, spyOn, mock } from "bun:test";
import { mkdirSync, linkSync, writeFileSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Database } from "bun:sqlite";
import { createOwnedTestDirectory } from "../../../tests/helpers/owned-test-directory.js";
import { SqliteOperationAdmission } from "./sqlite-operation-admission.js";
import { OwnedDatabase } from "./owned-database.js";

it("serializes independent async operations and releases after success and failure", async () => {
  const storage = createOwnedTestDirectory("memory-admission-");
  const path = join(storage.dir, "coordination.db"), db = new Database(path);
  db.exec("PRAGMA application_id=1296122957; CREATE TABLE admission_format(version INTEGER NOT NULL); INSERT INTO admission_format VALUES(1)"); db.close();
  const admission = new SqliteOperationAdmission(path);
  let release!: () => void, entered = false, owner: Promise<string> | undefined;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  try {
    owner = admission.run(async () => { entered = true; await barrier; return "owner"; });
    expect(entered).toBe(true);
    const contender = mock();
    await expect(new SqliteOperationAdmission(path).run(contender)).rejects.toThrow("busy");
    expect(contender).not.toHaveBeenCalled();
    release(); expect(await owner).toBe("owner");
    const failure = new Error("synthetic operation failure");
    await expect(admission.run(async () => { throw failure; })).rejects.toBe(failure);
    expect(await admission.run(async () => "retry")).toBe("retry");
  } finally { release(); await owner; storage.cleanup(); }
});

it.each(["relative", "directory", "hardlink", "corrupt"] as const)("refuses %s authority without modifying it", async kind => {
  const storage = createOwnedTestDirectory("memory-admission-path-");
  let path = join(storage.dir, "authority");
  if (kind === "directory") mkdirSync(path);
  else {
    if (kind === "corrupt") writeFileSync(path, "synthetic non-database");
    else {
      const db = new Database(path);
      db.exec("PRAGMA application_id=1296122957; CREATE TABLE admission_format(version INTEGER NOT NULL); INSERT INTO admission_format VALUES(1)"); db.close();
    }
    if (kind === "hardlink") linkSync(path, join(storage.dir,"second-link"));
    if (kind === "relative") path = relative(process.cwd(),path);
  }
  const operation = mock(), before = kind === "directory" ? undefined : readFileSync(path);
  try {
    await expect(new SqliteOperationAdmission(path).run(operation)).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
    if (before) expect(readFileSync(path)).toEqual(before);
  } finally { storage.cleanup(); }
});

it.each(["begin", "rollback", "close", "compound"] as const)("preserves %s failure and attempts release", async phase => {
  const storage = createOwnedTestDirectory("memory-admission-cleanup-");
  const path = join(storage.dir,"coordination.db"), db = new Database(path);
  db.exec("PRAGMA application_id=1296122957; CREATE TABLE admission_format(version INTEGER NOT NULL); INSERT INTO admission_format VALUES(1)"); db.close();
  const originalExec = OwnedDatabase.prototype.exec, originalClose = OwnedDatabase.prototype.close;
  const failure = new Error("synthetic " + phase), operationFailure = new Error("operation failed");
  let connection: OwnedDatabase | undefined, closeAttempted = false;
  const exec = spyOn(OwnedDatabase.prototype,"exec").mockImplementation(function(this:OwnedDatabase,...args) {
    connection = this;
    if (phase === "begin" && args[0] === "BEGIN IMMEDIATE") throw failure;
    if ((phase === "rollback" || phase === "compound") && args[0] === "ROLLBACK") throw failure;
    return Reflect.apply(originalExec,this,args);
  });
  const close = spyOn(OwnedDatabase.prototype,"close").mockImplementation(function(this:OwnedDatabase,...args) {
    closeAttempted = true;
    if (phase === "close" || phase === "compound") throw failure;
    return Reflect.apply(originalClose,this,args);
  });
  let caught: unknown;
  try {
    try { await new SqliteOperationAdmission(path).run(async () => { if (phase === "compound") throw operationFailure; return 1; }); }
    catch (error) { caught = error; }
    expect(closeAttempted).toBe(true);
    if (phase === "compound") {
      expect(caught).toBeInstanceOf(AggregateError);
      expect((caught as AggregateError).errors).toEqual([operationFailure,failure,failure]);
    } else expect(caught).toBe(failure);
  } finally {
    exec.mockRestore(); close.mockRestore();
    // The injected close failure deliberately retains the real connection.
    if (phase === "close" || phase === "compound") connection!.close();
    storage.cleanup();
  }
});

it("rejects implicit nested admission instead of granting shared process authority", async () => {
  const storage = createOwnedTestDirectory("memory-admission-nested-");
  const path = join(storage.dir,"coordination.db"), db = new Database(path);
  db.exec("PRAGMA application_id=1296122957; CREATE TABLE admission_format(version INTEGER NOT NULL); INSERT INTO admission_format VALUES(1)"); db.close();
  const admission = new SqliteOperationAdmission(path);
  try {
    await admission.run(async () => {
      const nested = mock();
      await expect(admission.run(nested)).rejects.toThrow("busy");
      expect(nested).not.toHaveBeenCalled();
    });
    expect(await admission.run(async () => 1)).toBe(1);
  } finally { storage.cleanup(); }
});

it.each(["missing", "unrelated", "wrong-version", "extra-version"] as const)("refuses %s authority without running an operation", async kind => {
  const storage = createOwnedTestDirectory("memory-admission-invalid-");
  const path = join(storage.dir,"coordination.db");
  if (kind !== "missing") {
    const db = new Database(path);
    try {
      db.exec("CREATE TABLE admission_format(version INTEGER NOT NULL)");
      if (kind !== "unrelated") db.exec("PRAGMA application_id=1296122957");
      db.exec(kind === "wrong-version" ? "INSERT INTO admission_format VALUES(2)" : "INSERT INTO admission_format VALUES(1)");
      if (kind === "extra-version") db.exec("INSERT INTO admission_format VALUES(1)");
    } finally { db.close(); }
  }
  const operation = mock();
  try {
    await expect(new SqliteOperationAdmission(path).run(operation)).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
  } finally { storage.cleanup(); }
});
