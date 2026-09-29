import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const OWNER_FILE = ".memory-coverage-owner.json";

interface DirectoryOwner {
  version: 1;
  role: "reports" | "work";
  project: string;
  path: string;
  device: string;
  inode: string;
  runId: string;
  pid: number;
  startedAt: string;
}

export interface CoverageRunStorage {
  workDir: string;
  checkoutDir: string;
  reportDir: string;
  owner: DirectoryOwner;
}

function directoryIdentity(path: string) {
  const stat = lstatSync(path, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Refusing non-directory ownership: ${path}`);
  return { path: realpathSync(path), device: stat.dev.toString(), inode: stat.ino.toString() };
}

function readOwner(path: string): DirectoryOwner {
  const marker = join(path, OWNER_FILE);
  const stat = lstatSync(marker, { throwIfNoEntry: false });
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4096) {
    throw new Error(`Refusing unowned coverage directory: ${path}`);
  }
  let owner: DirectoryOwner;
  try { owner = JSON.parse(readFileSync(marker, "utf-8")); }
  catch { throw new Error(`Refusing malformed coverage ownership: ${path}`); }
  const identity = directoryIdentity(path);
  if (!owner || owner.version !== 1 || !["reports", "work"].includes(owner.role) ||
      typeof owner.project !== "string" || typeof owner.runId !== "string" ||
      !/^[0-9a-f-]{36}$/.test(owner.runId) || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
      typeof owner.startedAt !== "string" || !Number.isFinite(Date.parse(owner.startedAt)) ||
      owner.path !== identity.path || owner.device !== identity.device || owner.inode !== identity.inode) {
    throw new Error(`Refusing mismatched coverage ownership: ${path}`);
  }
  return owner;
}

function createOwnedDirectory(path: string, project: string, role: DirectoryOwner["role"], runId: string): DirectoryOwner {
  mkdirSync(dirname(path), { recursive: true });
  mkdirSync(path); // Exclusive claim: never reuse a name that appeared after preflight.
  const owner: DirectoryOwner = {
    version: 1, role, project, ...directoryIdentity(path), runId,
    pid: process.pid, startedAt: new Date().toISOString(),
  };
  try {
    writeFileSync(join(path, OWNER_FILE), JSON.stringify(owner), { flag: "wx" });
  } catch (error) {
    try {
      const current = directoryIdentity(path);
      if (current.path !== owner.path || current.device !== owner.device || current.inode !== owner.inode) throw new Error("Claim changed");
      rmdirSync(path); // Only an empty, still-identical claim can be retired without a marker.
    } catch {
      process.stderr.write(`Coverage ownership allocation incomplete: ${path}; owner=${JSON.stringify(owner)}\n`);
    }
    throw error;
  }
  return owner;
}

export function openCoverageRun(projectRoot: string, workDir: string, coverageDir: string): CoverageRunStorage {
  const project = realpathSync(projectRoot);
  if (lstatSync(workDir, { throwIfNoEntry: false })) throw new Error(`Refusing to replace an existing workDir: ${workDir}`);
  if (lstatSync(coverageDir, { throwIfNoEntry: false })) {
    const owner = readOwner(coverageDir);
    if (owner.role !== "reports" || owner.project !== project) throw new Error(`Refusing foreign coverage ownership: ${coverageDir}`);
  } else {
    createOwnedDirectory(coverageDir, project, "reports", randomUUID());
  }
  const runId = randomUUID();
  const owner = createOwnedDirectory(workDir, project, "work", runId);
  const reportDir = join(coverageDir, `run-${runId}`);
  const run = { workDir: owner.path, checkoutDir: join(owner.path, "checkout"), reportDir, owner };
  try {
    mkdirSync(reportDir);
    writeFileSync(join(reportDir, "run.json"), JSON.stringify({ version: 1, runId, pid: process.pid, startedAt: owner.startedAt, status: "running" }), { flag: "wx" });
    return run;
  } catch (error) {
    releaseCoverageWork(run);
    process.stderr.write(`Coverage report allocation incomplete: ${reportDir}\n`);
    throw error;
  }
}

export function recordCoverageRun(run: CoverageRunStorage, exitCode: number | null): void {
  writeFileSync(join(run.reportDir, "run.json"), JSON.stringify({
    version: 1, runId: run.owner.runId, pid: run.owner.pid, startedAt: run.owner.startedAt,
    finishedAt: new Date().toISOString(), status: exitCode === 0 ? "complete" : "failed", exitCode,
  }));
}

function retainedBytes(root: string): number {
  let total = 0;
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) total += retainedBytes(path);
    else total += stat.size;
  }
  return total;
}

export function releaseCoverageWork(run: CoverageRunStorage): void {
  let cleanupStarted = false;
  try {
    const current = readOwner(run.workDir);
    if (JSON.stringify(current) !== JSON.stringify(run.owner)) throw new Error("Refusing changed work ownership");
    cleanupStarted = true;
    rmSync(run.workDir, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 });
  } catch (error) {
    // Never reclaim another invocation's directory, even if its PID is ours.
    // Partial cleanup can remove the marker; restore it only for the same directory.
    let bytes: number | null = null;
    try {
      const identity = directoryIdentity(run.workDir);
      if (identity.path === run.owner.path && identity.device === run.owner.device && identity.inode === run.owner.inode) {
        if (cleanupStarted && !lstatSync(join(run.workDir, OWNER_FILE), { throwIfNoEntry: false })) {
          writeFileSync(join(run.workDir, OWNER_FILE), JSON.stringify(run.owner), { flag: "wx" });
        }
        bytes = retainedBytes(run.workDir);
      }
    } catch { /* Ownership cannot be proved; retain without further mutation. */ }
    process.stderr.write(`Coverage work retained for verified cleanup: ${run.workDir}; bytes=${bytes ?? "unknown"}; ${error instanceof Error ? error.message : String(error)}\n`);
  }
}
