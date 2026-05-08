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
 *
 * @param path Optional explicit checkpoint file path. When omitted, the
 *   production XDG-resolved path is used. Tests construct with a temp
 *   path to achieve isolation without process-wide state.
 */
export class FileCheckpointManager implements ICheckpointManager {
  constructor(private readonly path?: string) {}

  load(): SyncCheckpoint | null {
    return loadCheckpoint(this.path);
  }

  save(checkpoint: SyncCheckpoint): void {
    saveCheckpoint(checkpoint, this.path);
  }

  clear(): void {
    clearCheckpoint(this.path);
  }
}
