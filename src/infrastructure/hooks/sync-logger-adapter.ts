/**
 * Domain Port Adapter for Sync Logging
 *
 * Wraps the logSync() free function from log-writer into a
 * class-based adapter implementing the ISyncLogger domain port.
 */

import type { ISyncLogger } from "../../domain/ports/signals.js";
import { logSync } from "./log-writer.js";

type SyncLogEntry = Parameters<ISyncLogger["log"]>[0];

/**
 * Adapter wrapping the file-based structured logger.
 */
export class FileSyncLogger implements ISyncLogger {
  constructor(private readonly writeLog: (entry: SyncLogEntry) => void = logSync) {}

  log(entry: SyncLogEntry): void {
    this.writeLog(entry);
  }
}
