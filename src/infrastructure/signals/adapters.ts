/**
 * Domain Port Adapters for Signal Infrastructure
 *
 * Wraps free functions from signal-handler and checkpoint-manager
 * into class-based adapters implementing domain port interfaces.
 */

import type {
  ISyncAbortSignal,
  ICheckpointManager,
  SyncCheckpoint,
} from "../../domain/ports/signals.js";
import { shouldAbort } from "./signal-handler.js";
import {
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} from "./checkpoint-manager.js";

/**
 * Adapter wrapping the process signal handler's shouldAbort() function.
 */
export class ProcessAbortSignal implements ISyncAbortSignal {
  shouldAbort(): boolean {
    return shouldAbort();
  }
}

/**
 * Adapter wrapping the filesystem checkpoint manager functions.
 */
export class FileCheckpointManager implements ICheckpointManager {
  load(): SyncCheckpoint | null {
    return loadCheckpoint();
  }

  save(checkpoint: SyncCheckpoint): void {
    saveCheckpoint(checkpoint);
  }

  clear(): void {
    clearCheckpoint();
  }
}
