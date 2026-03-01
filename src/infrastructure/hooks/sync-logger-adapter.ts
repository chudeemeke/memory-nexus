/**
 * Domain Port Adapter for Sync Logging
 *
 * Wraps the logSync() free function from log-writer into a
 * class-based adapter implementing the ISyncLogger domain port.
 */

import type { ISyncLogger } from "../../domain/ports/signals.js";
import { logSync } from "./log-writer.js";

/**
 * Adapter wrapping the file-based structured logger.
 */
export class FileSyncLogger implements ISyncLogger {
  log(entry: {
    level: "debug" | "info" | "warn" | "error";
    message: string;
    sessionId?: string;
    error?: string;
  }): void {
    logSync(entry);
  }
}
