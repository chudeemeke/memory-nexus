import { createHash } from "node:crypto";
import { lstatSync, openSync, fstatSync, readSync, closeSync, type BigIntStats } from "node:fs";
import { open } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { getAllLogFiles, getEventsDir } from "../paths.js";
import type { Database } from "bun:sqlite";

export interface ProjectionSourceManifest {
  version: 1;
  scope: { kind: "file" | "directory"; path: string };
  files: { path: string; bytes: number; sha256: string }[];
}
export interface ProjectionSourceSnapshot {
  manifest: ProjectionSourceManifest;
  identities: string[];
}
function signature(stat: BigIntStats): string {
  if (!stat.isFile()) throw new Error("Projection source must be a regular file");
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
}
function selected(scope: ProjectionSourceManifest["scope"]): string[] {
  return scope.kind === "file" ? [scope.path] : getAllLogFiles(scope.path).map(path => resolve(path)).sort();
}
function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right);
}
function assertCompleteSelection(scope: ProjectionSourceManifest["scope"]): void {
  if (scope.kind === "file" && getAllLogFiles(dirname(scope.path)).some(path => !samePath(path, scope.path))) {
    throw new Error("Projection source selection omits sibling event logs; select their directory");
  }
}
function changed(): never { throw new Error("Projection source changed during rebuild; retry with current sources"); }
function requireMetadata(path: string, identity: string): void {
  try { if (signature(lstatSync(path, { bigint: true })) !== identity) changed(); }
  catch { changed(); }
}

/** Read only the initial byte cutoffs. Never chase a continuously appended log. */
export async function captureProjectionSource(logPath: string | undefined, eventsDir: string | undefined,
  consume: (line: string, path: string, lineNumber: number) => void): Promise<ProjectionSourceSnapshot> {
  const scope: ProjectionSourceManifest["scope"] = logPath
    ? { kind: "file", path: resolve(logPath) } : { kind: "directory", path: resolve(eventsDir ?? getEventsDir()) };
  assertCompleteSelection(scope);
  const paths = selected(scope);
  if (paths.length === 0) throw new Error("No event log files available for projection rebuild");
  const identities: string[] = [];
  const files = paths.map(path => {
    let stat: BigIntStats;
    try { stat = lstatSync(path, { bigint: true }); }
    catch { throw new Error(`Event log unavailable for projection rebuild: ${path}`); }
    identities.push(signature(stat));
    const bytes = Number(stat.size);
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Projection source size is unsupported");
    return { path, bytes, sha256: "" };
  });
  for (const [index, file] of files.entries()) {
    let handle;
    try { handle = await open(file.path, "r"); } catch { changed(); }
    try {
      if (signature(await handle.stat({ bigint: true })) !== identities[index]) changed();
      const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024), decoder = new TextDecoder("utf-8", { fatal: true });
      let position = 0, tail = "", lineNumber = 0;
      while (position < file.bytes) {
        const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, file.bytes - position), position);
        if (bytesRead === 0) changed();
        const chunk = buffer.subarray(0, bytesRead); hash.update(chunk); position += bytesRead;
        try { tail += decoder.decode(chunk, { stream: true }); } catch { throw new Error("Projection source contains invalid UTF-8"); }
        let newline: number;
        while ((newline = tail.indexOf("\n")) !== -1) {
          consume(tail.slice(0, newline), file.path, ++lineNumber); tail = tail.slice(newline + 1);
        }
      }
      try { tail += decoder.decode(); } catch { throw new Error("Projection source contains incomplete UTF-8"); }
      if (tail.length > 0) consume(tail, file.path, ++lineNumber);
      file.sha256 = hash.digest("hex");
      if (signature(await handle.stat({ bigint: true })) !== identities[index]) changed();
      requireMetadata(file.path, identities[index]!);
    } finally { await handle.close(); }
  }
  const snapshot: ProjectionSourceSnapshot = { manifest: { version: 1, scope, files }, identities };
  assertProjectionSource(snapshot);
  return snapshot;
}

/** Synchronous final fence; the manifest remains an exact cutoff, not a latest-data claim. */
export function assertProjectionSource(snapshot: ProjectionSourceSnapshot): void {
  const { manifest, identities } = snapshot;
  assertCompleteSelection(manifest.scope);
  if (JSON.stringify(selected(manifest.scope)) !== JSON.stringify(manifest.files.map(file => file.path))) changed();
  for (const [index, file] of manifest.files.entries()) {
    requireMetadata(file.path, identities[index]!);
    let fd: number;
    try { fd = openSync(file.path, "r"); } catch { changed(); }
    try {
      if (signature(fstatSync(fd, { bigint: true })) !== identities[index]) changed();
      const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024);
      let position = 0;
      while (position < file.bytes) {
        const bytes = readSync(fd, buffer, 0, Math.min(buffer.length, file.bytes - position), position);
        if (bytes === 0) changed();
        hash.update(buffer.subarray(0, bytes)); position += bytes;
      }
      if (hash.digest("hex") !== file.sha256 || signature(fstatSync(fd, { bigint: true })) !== identities[index]) changed();
      requireMetadata(file.path, identities[index]!);
    } finally { closeSync(fd); }
  }
  if (JSON.stringify(selected(manifest.scope)) !== JSON.stringify(manifest.files.map(file => file.path))) changed();
}

/** Established source authority may widen from a file, but cannot silently narrow. */
export function assertProjectionSourceAuthority(db: Database, snapshot: ProjectionSourceSnapshot): void {
  using exists = db.prepare("SELECT 1 FROM main.sqlite_master WHERE type='table' AND name='projection_replay_state'");
  if (!exists.get()) return;
  using receipt = db.prepare<{ manifest: string }, []>("SELECT manifest FROM main.projection_replay_state WHERE id=1");
  const row = receipt.get();
  if (!row) return;
  let prior: ProjectionSourceManifest;
  try {
    prior = JSON.parse(row.manifest) as ProjectionSourceManifest;
    if (prior.version !== 1 || !["file", "directory"].includes(prior.scope.kind) || typeof prior.scope.path !== "string" ||
      !Array.isArray(prior.files) || prior.files.length === 0 || prior.files.some(file => typeof file.path !== "string" ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256))) throw new Error();
  } catch { throw new Error("Projection source receipt is invalid; recovery required before replacement"); }
  const next = snapshot.manifest;
  const unchanged = prior.scope.kind === next.scope.kind && samePath(prior.scope.path, next.scope.path);
  const widened = prior.scope.kind === "file" && next.scope.kind === "directory" && samePath(dirname(prior.scope.path), next.scope.path);
  if (!unchanged && !widened) throw new Error("Projection source authority cannot narrow or switch roots during rebuild");
  if (prior.files.some(file => !next.files.some(candidate => samePath(file.path, candidate.path)))) {
    throw new Error("Projection source selection omits previously applied files; restore complete sources before rebuilding");
  }
}

/** Source freshness only. Actual projection health and retry belong to callers. */
export async function isProjectionSourceCurrent(db: Database, logPath?: string, eventsDir?: string): Promise<boolean> {
  const readReceipt = () => {
    using statement = db.prepare<{ manifest: string }, []>("SELECT manifest FROM main.projection_replay_state WHERE id=1");
    return statement.get()?.manifest;
  };
  const receipt = readReceipt();
  if (!receipt) return false;
  const snapshot = await captureProjectionSource(logPath, eventsDir, () => {});
  let source: unknown;
  try {
    const { projectionState: _contentIdentity, ...manifest } = JSON.parse(receipt);
    source = manifest;
  } catch { return false; }
  return readReceipt() === receipt && JSON.stringify(snapshot.manifest) === JSON.stringify(source);
}
