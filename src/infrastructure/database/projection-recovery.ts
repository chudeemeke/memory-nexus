import { existsSync } from "node:fs";
import type { Database } from "bun:sqlite";
import type { MemoryEventWriter } from "../../application/services/memory-governance-service.js";
import { getAllLogFiles, getEventsDir } from "../paths.js";
import type { OperationLease, DatabaseWriteLease } from "../../domain/ports/operation-admission.js";
import { runDatabaseWrite, assertDatabaseWriteLease } from "./database-write-admission.js";
import { createSourceOperationAdmission } from "./source-operation-admission.js";
import { appendMemoryEvent, rebuildProjections } from "./event-log.js";
import { captureProjectionSource, isProjectionSourceCurrent } from "./projection-source.js";
import { assertAutomaticProjectionReplay } from "./projection-state.js";
import { assertProjectionPayload } from "./projection-payload.js";

function hasReceipt(db: Database): boolean {
  using receipt = db.prepare("SELECT 1 FROM main.projection_replay_state WHERE id=1");
  return receipt.get() !== null;
}

/** One bounded recovery attempt; later appends remain explicitly pending. */
export async function recoverPendingProjections(db: Database, logPath?: string, eventsDir?: string, parent?: OperationLease, databaseLease?: DatabaseWriteLease): Promise<{ rebuilt: boolean; pending: boolean }> {
  const sourceDirectory = eventsDir ?? getEventsDir();
  return createSourceOperationAdmission(logPath, sourceDirectory).run(
    lease => databaseLease === undefined
      ? recoverAdmittedProjections(db, logPath, sourceDirectory, lease)
      : runDatabaseWrite(db, child => recoverAdmittedProjections(db, logPath, sourceDirectory, lease, child), databaseLease), parent);
}

async function recoverAdmittedProjections(db: Database, logPath: string | undefined, eventsDir: string, lease: OperationLease, databaseLease?: DatabaseWriteLease): Promise<{ rebuilt: boolean; pending: boolean }> {
  assertDatabaseWriteLease(db, databaseLease);
  const available = logPath ? existsSync(logPath) : getAllLogFiles(eventsDir).length > 0;
  if (!available) {
    if (hasReceipt(db)) throw new Error("Recorded projection source is unavailable; restore the source before replay");
    return { rebuilt: false, pending: false };
  }
  if (!hasReceipt(db)) {
    const source = await captureProjectionSource(logPath, eventsDir, () => {});
    if (source.manifest.files.every(file => file.bytes === 0)) return { rebuilt: false, pending: false };
  }
  assertAutomaticProjectionReplay(db);
  if (await isProjectionSourceCurrent(db, logPath, eventsDir)) return { rebuilt: false, pending: false };
  await rebuildProjections(db, logPath, eventsDir, "automatic", lease, databaseLease);
  return { rebuilt: true, pending: !await isProjectionSourceCurrent(db, logPath, eventsDir) };
}

/** Canonical event writer owns replay; services read back instead of reapplying. */
export function createProjectedEventWriter(db: Database, logPath?: string, parent?: OperationLease): MemoryEventWriter {
  return event => createSourceOperationAdmission(logPath).run(async lease => {
    assertProjectionPayload(event);
    if ((await recoverPendingProjections(db, logPath, undefined, lease)).pending) {
      throw new Error("Projection recovery remains pending; retry before writing another event");
    }
    assertAutomaticProjectionReplay(db);
    await appendMemoryEvent(event, logPath, lease);
    try { await rebuildProjections(db, logPath, undefined, "automatic", lease); }
    catch (cause) { throw new Error("Event recorded; projection replay failed and remains pending", { cause }); }
    let current: boolean;
    try { current = await isProjectionSourceCurrent(db, logPath); }
    catch (cause) { throw new Error("Event recorded and projected; source verification failed and recovery remains pending", { cause }); }
    if (!current) throw new Error("Event recorded and projected; newer source remains pending; retry the command");
    return { projectionCommitted: true as const };
  }, parent);
}
