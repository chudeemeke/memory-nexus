import {randomUUID} from "node:crypto";
import {lstatSync, mkdtempSync, readFileSync, realpathSync, rmdirSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {tmpdir} from "node:os";

const MARKER = ".memory-test-owner.json";

export interface OwnedTestDirectory {
  readonly dir: string;
  assertOwned(): void;
  cleanup(): void;
}

/** Local fault injection; every removal still passes the ownership guard. */
export interface DirectoryCleanupOperations {
  remove(path: string): void;
  writeOwner(path: string, contents: string): void;
}

const defaults: DirectoryCleanupOperations = {
  remove: path => rmSync(path, {recursive:true, force:false, maxRetries:3, retryDelay:100}),
  writeOwner: (path,contents) => writeFileSync(path,contents,{flag:"wx"}),
};

export function createOwnedTestDirectory(prefix = "memory-test-", operations: Partial<DirectoryCleanupOperations> = {}): OwnedTestDirectory {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(prefix)) throw new Error("Invalid test directory prefix");
  const io = {...defaults,...operations};
  const parent = realpathSync(tmpdir());
  const dir = mkdtempSync(join(parent, prefix));
  const identity = lstatSync(dir, {bigint:true});
  const markerPath = join(dir, MARKER);
  const owner = JSON.stringify({project:"memory-nexus", pid:process.pid, id:randomUUID(),
    dir, device:identity.dev.toString(), inode:identity.ino.toString()});
  let removed = false;

  function original(): boolean {
    const stat = lstatSync(dir, {bigint:true, throwIfNoEntry:false});
    return !!stat && stat.isDirectory() && !stat.isSymbolicLink() &&
      stat.dev === identity.dev && stat.ino === identity.ino &&
      realpathSync(dir) === dir && dirname(dir) === parent && realpathSync(parent) === parent;
  }
  function assertOwned(): void {
    if (!original()) throw new Error(`Test directory ownership changed; retained: ${dir}`);
    const marker = lstatSync(markerPath, {throwIfNoEntry:false});
    if (!marker || !marker.isFile() || marker.isSymbolicLink() || marker.nlink !== 1 ||
        marker.size !== Buffer.byteLength(owner) || readFileSync(markerPath,"utf8") !== owner) {
      throw new Error(`Test directory ownership marker changed; retained: ${dir}`);
    }
  }
  try { io.writeOwner(markerPath, owner); }
  catch (cause) {
    try {
      if (!original()) throw new Error("Allocation identity changed");
      rmdirSync(dir); // Empty allocation only; never recursively erase an unclaimed path.
    } catch (cleanupError) {
      throw new AggregateError([cause,cleanupError], `Test directory allocation failed; retained: ${dir}`);
    }
    throw cause;
  }
  return {dir, assertOwned, cleanup() {
    if (removed) return;
    assertOwned();
    try { io.remove(dir); removed = true; }
    catch (cause) {
      // Recursive removal may delete the marker before encountering a locked
      // file. Restore only our exact directory, never a replacement or changed marker.
      try {
        if (original() && !lstatSync(markerPath,{throwIfNoEntry:false})) {
          io.writeOwner(markerPath,owner);
        }
      } catch (restoreError) {
        throw new AggregateError([cause,restoreError], `Test cleanup failed; retained: ${dir}`);
      }
      throw new Error(`Test cleanup failed; retained: ${dir}; ${String(cause)}`, {cause});
    }
  }};
}
