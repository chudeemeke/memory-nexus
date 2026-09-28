import type { LeasedOperationAdmission as AdmissionPort, OperationLease } from "../../domain/ports/operation-admission.js";
import { mkdirSync, realpathSync, lstatSync, existsSync, mkdtempSync, openSync, closeSync, linkSync, unlinkSync, rmdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getEventsDir } from "../paths.js";
import { OwnedDatabase } from "./owned-database.js";
import { SqliteOperationAdmission } from "./sqlite-operation-admission.js";
import { LeasedOperationAdmission } from "./leased-operation-admission.js";

export const LOCAL_EVENT_STATE_DIRECTORY = ".memory-local";
const issuedSourceLeases = new WeakSet<OperationLease>();
type Identity = { dev: bigint; ino: bigint };
function identity(path: string): Identity { return lstatSync(path, { bigint: true }); }
function assertIdentity(path: string, expected: Identity): void {
  const actual = identity(path);
  if (actual.dev !== expected.dev || actual.ino !== expected.ino) throw new Error("Source operation authority identity changed; reconciliation required");
}
function provision(path: string, root: string, rootIdentity: Identity): void {
  if (existsSync(path)) return;
  const temporary = mkdtempSync(join(dirname(path), "provision-")), directoryIdentity = identity(temporary);
  const staged = join(temporary,"admission.sqlite");
  let fileIdentity: Identity | undefined;
  const failures: unknown[] = [];
  try {
    const descriptor = openSync(staged,"wx",0o600);
    try { fileIdentity = identity(staged); } finally { closeSync(descriptor); }
    const db = new OwnedDatabase(staged, { create: false, readwrite: true });
    try {
      db.transaction(() => {
        db.exec("PRAGMA application_id=1296122957; CREATE TABLE admission_format(version INTEGER NOT NULL); INSERT INTO admission_format VALUES(1); CREATE TABLE source_authority(root TEXT NOT NULL,device TEXT NOT NULL,inode TEXT NOT NULL,file_device TEXT NOT NULL,file_inode TEXT NOT NULL)");
        db.run("INSERT INTO source_authority VALUES(?,?,?,?,?)",[root,rootIdentity.dev.toString(),rootIdentity.ino.toString(),fileIdentity!.dev.toString(),fileIdentity!.ino.toString()]);
      }).immediate();
    } catch (error) { failures.push(error); }
    try { db.close(); } catch (error) { failures.push(error); }
    if (failures.length === 0) {
      try { linkSync(staged,path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
  } catch (error) { failures.push(error); }
  for (const cleanup of [() => { if (fileIdentity) { assertIdentity(staged,fileIdentity); unlinkSync(staged); } }, () => { assertIdentity(temporary,directoryIdentity); rmdirSync(temporary); }]) {
    try { cleanup(); } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures,"Source authority provisioning and cleanup failed");
}

/** Same real event root shares admission across profiles and path aliases. */
export function createSourceOperationAdmission(logPath?: string): AdmissionPort {
  if (logPath && existsSync(logPath)) {
    const file = lstatSync(logPath);
    if (!file.isFile() || file.nlink !== 1) throw new Error("Event log must be a regular file with one link for operation admission");
  }
  const requestedRoot = resolve(logPath ? dirname(logPath) : getEventsDir());
  mkdirSync(requestedRoot,{recursive:true,mode:0o700});
  const root = realpathSync(requestedRoot), rootIdentity = identity(root);
  const rootKey = process.platform === "win32" ? root.toLowerCase() : root;
  const local = join(root,LOCAL_EVENT_STATE_DIRECTORY);
  mkdirSync(local,{recursive:true,mode:0o700});
  if (!lstatSync(local).isDirectory()) throw new Error("Source operation authority directory must be a real directory");
  const localIdentity = identity(local), path = join(local,"admission.sqlite");
  provision(path,rootKey,rootIdentity);
  const fileIdentity = identity(path);
  const validateIdentity = () => {
    assertIdentity(root,rootIdentity); assertIdentity(local,localIdentity); assertIdentity(path,fileIdentity);
    if (realpathSync(requestedRoot) !== root) throw new Error("Source operation authority alias changed; reconciliation required");
  };
  const backend = new SqliteOperationAdmission(path, db => {
    validateIdentity();
    using statement = db.prepare<{root:string;device:string;inode:string;file_device:string;file_inode:string},[]>("SELECT root,device,inode,file_device,file_inode FROM source_authority");
    const rows = statement.all(), row = rows[0];
    if (rows.length !== 1 || row?.root !== rootKey || row.device !== rootIdentity.dev.toString() || row.inode !== rootIdentity.ino.toString() || row.file_device !== fileIdentity.dev.toString() || row.file_inode !== fileIdentity.ino.toString()) {
      throw new Error("Source operation authority belongs to a different root; reconciliation required");
    }
  });
  const authority = JSON.stringify([rootKey, rootIdentity.dev.toString(), rootIdentity.ino.toString(),
    localIdentity.dev.toString(), localIdentity.ino.toString(), fileIdentity.dev.toString(), fileIdentity.ino.toString()]);
  const admission = new LeasedOperationAdmission(backend, authority, validateIdentity);
  return {
    run(operation, parent) {
      if (parent !== undefined && !issuedSourceLeases.has(parent)) {
        return Promise.reject(new Error("Invalid operation lease: not issued under source admission"));
      }
      return admission.run(lease => { issuedSourceLeases.add(lease); return operation(lease); }, parent);
    },
  };
}
