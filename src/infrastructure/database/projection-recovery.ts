import { existsSync } from "node:fs";
import type { Database } from "bun:sqlite";
import type { MemoryEventWriter } from "../../application/services/memory-governance-service.js";
import { getAllLogFiles } from "../paths.js";
import { appendMemoryEvent, rebuildProjections } from "./event-log.js";
import { captureProjectionSource, isProjectionSourceCurrent } from "./projection-source.js";
import { assertAutomaticProjectionReplay } from "./projection-state.js";
import { assertProjectionPayload } from "./projection-payload.js";

function hasReceipt(db: Database): boolean {
  using receipt = db.prepare("SELECT 1 FROM main.projection_replay_state WHERE id=1");
  return receipt.get() !== null;
}

/** One bounded recovery attempt; later appends remain explicitly pending. */
export async function recoverPendingProjections(db: Database, logPath?: string, eventsDir?: string): Promise<{ rebuilt: boolean; pending: boolean }> {
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
  await rebuildProjections(db, logPath, eventsDir, "automatic");
  return { rebuilt: true, pending: !await isProjectionSourceCurrent(db, logPath, eventsDir) };
}

/** Canonical event writer owns replay; services read back instead of reapplying. */
export function createProjectedEventWriter(db: Database, logPath?: string): MemoryEventWriter {
  return async event => {
    assertProjectionPayload(event);
    if ((await recoverPendingProjections(db, logPath)).pending) {
      throw new Error("Projection recovery remains pending; retry before writing another event");
    }
    assertAutomaticProjectionReplay(db);
    await appendMemoryEvent(event, logPath);
    try { await rebuildProjections(db, logPath, undefined, "automatic"); }
    catch (cause) { throw new Error("Event recorded; projection replay failed and remains pending", { cause }); }
    return { projectionCommitted: true };
  };
}
