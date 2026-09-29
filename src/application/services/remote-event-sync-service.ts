import { unknownErrorMessage } from "../../domain/errors/unknown-error.js";

export type RemoteValidationResult = { valid: true } | { valid: false; error: string };

export interface RemoteTransportCommandResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
}

export interface RemoteGitIdentity {
  machineId: string;
  userName: string;
  userEmail: string;
}

export interface RemoteEventTransport {
  isRepository(): Promise<boolean>;
  initRepository(identity: RemoteGitIdentity): Promise<RemoteTransportCommandResult>;
  getRemoteUrl(): Promise<string | null>;
  setRemoteUrl(remoteUrl: string): Promise<RemoteTransportCommandResult>;
  listEventLogFingerprints(): Promise<Record<string, string>>;
  hasEventLog(machineId: string): Promise<boolean>;
  commitEventLog(machineId: string, message: string): Promise<RemoteTransportCommandResult>;
  fetch(remoteName: string): Promise<RemoteTransportCommandResult>;
  hasRemoteRef(remoteName: string, ref: string): Promise<boolean>;
  pullRebase(remoteName: string, ref: string): Promise<RemoteTransportCommandResult>;
  abortRebase(): Promise<RemoteTransportCommandResult>;
  push(remoteName: string, ref: string): Promise<RemoteTransportCommandResult>;
}

export interface RemotePrivacyPreflightPort {
  audit(): Promise<{ eventLogFindings: number }>;
}

export interface RemoteProjectionRebuilderPort {
  rebuild(): Promise<void>;
  recover?(): Promise<{ rebuilt: boolean; pending: boolean }>;
}

export interface RemoteEventSyncServiceDeps {
  transport: RemoteEventTransport;
  privacyPreflight?: RemotePrivacyPreflightPort;
  projectionRebuilder?: RemoteProjectionRebuilderPort;
  now?: () => Date;
}

export interface RemoteEventSyncRequest {
  machineId: string;
  repositoryUrl: string;
  branch?: string;
  remoteName?: string;
  autoPull?: boolean;
  autoPush?: boolean;
  allowLocalPathRemote?: boolean;
}

export interface RemoteEventSyncResult {
  success: boolean;
  status: "synced" | "blocked" | "failed";
  rebuildNeeded: boolean;
  projectionRebuilt: boolean;
  /** Present when receipt recovery was attempted or the working tree is unsettled. */
  projectionPending?: boolean;
  pulled: boolean;
  pushed: boolean;
  configuredRemote: boolean;
  initializedRepository: boolean;
  error: string | undefined;
}

const DEFAULT_REMOTE_NAME = "origin";
const DEFAULT_BRANCH = "main";
const UNSAFE_REF_CHARS = /[\s~^:?*[\]\\;]/;
const SAFE_MACHINE_ID = /^[A-Za-z0-9._-]+$/;

export function validateRemoteRepositoryUrl(
  value: string,
  options: { allowLocalPathRemote?: boolean } = {},
): RemoteValidationResult {
  const remoteUrl = value.trim();
  if (!remoteUrl) {
    return { valid: false, error: "Remote URL is required" };
  }
  if (hasControlCharacter(remoteUrl)) {
    return { valid: false, error: "Remote URL contains control characters" };
  }
  if (isLocalPathRemote(remoteUrl)) {
    return options.allowLocalPathRemote
      ? { valid: true }
      : { valid: false, error: "Local path remotes require explicit allowLocalPathRemote consent" };
  }
  if (/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:[^\s]+$/.test(remoteUrl)) {
    return { valid: true };
  }

  try {
    const parsed = new URL(remoteUrl);
    if (parsed.protocol === "https:" || parsed.protocol === "ssh:") {
      return { valid: true };
    }
    return { valid: false, error: "Remote URL protocol is not supported" };
  } catch {
    return { valid: false, error: "Remote URL is not a supported Git remote" };
  }
}

export function validateRemoteRef(ref: string): RemoteValidationResult {
  const value = ref.trim();
  if (!value) {
    return { valid: false, error: "Remote ref is required" };
  }
  if (UNSAFE_REF_CHARS.test(value)) {
    return { valid: false, error: "Remote ref contains unsafe characters" };
  }
  if (
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.startsWith(".") ||
    value.includes("..") ||
    value.includes("//") ||
    value.endsWith(".") ||
    value.endsWith(".lock")
  ) {
    return { valid: false, error: "Remote ref is not a valid branch name" };
  }
  return { valid: true };
}

export function validateMachineIdentity(machineId: string): RemoteValidationResult {
  const value = machineId.trim();
  if (!value) {
    return { valid: false, error: "Machine identity is required" };
  }
  if (value === "local" || value === "legacy") {
    return { valid: false, error: "Machine identity must come from durable config, not a fallback value" };
  }
  if (!SAFE_MACHINE_ID.test(value)) {
    return { valid: false, error: "Machine identity contains unsafe characters" };
  }
  if (value.length > 128) {
    return { valid: false, error: "Machine identity is too long" };
  }
  return { valid: true };
}

export class RemoteEventSyncService {
  private readonly transport: RemoteEventTransport;
  private readonly privacyPreflight: RemotePrivacyPreflightPort | undefined;
  private readonly projectionRebuilder: RemoteProjectionRebuilderPort | undefined;
  private readonly now: () => Date;

  constructor(deps: RemoteEventSyncServiceDeps) {
    this.transport = deps.transport;
    this.privacyPreflight = deps.privacyPreflight;
    this.projectionRebuilder = deps.projectionRebuilder;
    this.now = deps.now ?? (() => new Date());
  }

  async sync(request: RemoteEventSyncRequest): Promise<RemoteEventSyncResult> {
    try {
      const validation = validateSyncRequest(request, request.branch ?? DEFAULT_BRANCH, request.remoteName ?? DEFAULT_REMOTE_NAME);
      if (!validation.valid) return blocked(validation.error);
      const privacy = await this.privacyPreflight?.audit();
      if (privacy && privacy.eventLogFindings > 0) {
        return blocked(`Remote synchronization blocked: active event logs contain ${privacy.eventLogFindings} likely secret finding(s).`);
      }
    } catch (error) {
      return failed(unknownErrorMessage(error));
    }

    if (!this.projectionRebuilder?.recover) return this.syncTransport(request);
    const progress = { rebuildNeeded: false, projectionRebuilt: false, projectionPending: true };
    try { await this.recoverProjections(progress); }
    catch (error) { return failed(unknownErrorMessage(error), progress); }

    const result = await this.syncTransport(request);
    // A failed/throwing rebase without successful abort cannot supply stable source.
    if (result.projectionPending) {
      return { ...result, ...progress, rebuildNeeded: true, projectionPending: true };
    }
    try { await this.recoverProjections(progress); }
    catch (error) {
      const recoveryError = unknownErrorMessage(error);
      return failed(result.error ? `${result.error}; ${recoveryError}` : recoveryError, { ...result, ...progress });
    }
    return { ...result, ...progress };
  }

  private async recoverProjections(progress: { rebuildNeeded: boolean; projectionRebuilt: boolean; projectionPending: boolean }): Promise<void> {
    progress.projectionPending = true;
    try {
      const recovery = await this.projectionRebuilder!.recover!();
      if (!recovery || typeof recovery.rebuilt !== "boolean" || typeof recovery.pending !== "boolean") {
        throw new Error("Projection recovery returned an invalid result");
      }
      progress.projectionRebuilt ||= recovery.rebuilt;
      progress.rebuildNeeded ||= recovery.rebuilt || recovery.pending;
      progress.projectionPending = recovery.pending;
      if (recovery.pending) throw new Error("Projection recovery remains pending; retry sync");
    } catch (error) {
      progress.rebuildNeeded = true;
      throw error;
    }
  }

  private async syncTransport(request: RemoteEventSyncRequest): Promise<RemoteEventSyncResult> {
    const remoteName = request.remoteName ?? DEFAULT_REMOTE_NAME;
    const branch = request.branch ?? DEFAULT_BRANCH;
    const autoPull = request.autoPull ?? true;
    const autoPush = request.autoPush ?? true;
    let initializedRepository = false;
    let configuredRemote = false;
    let pulled = false;
    let pushed = false;
    let rebaseUnsettled = false;
    const projection = { rebuildNeeded: false, projectionRebuilt: false };

    try {
      const isRepository = await this.transport.isRepository();
      if (!isRepository) {
        const init = await this.transport.initRepository(createGitIdentity(request.machineId));
        if (!init.success) {
          return failed(init.error ?? "Failed to initialize Git repository in events directory");
        }
        initializedRepository = true;
      }

      const currentRemote = await this.transport.getRemoteUrl();
      if (currentRemote !== request.repositoryUrl.trim()) {
        const configured = await this.transport.setRemoteUrl(request.repositoryUrl.trim());
        if (!configured.success) {
          return failed(configured.error ?? "Failed to configure Git remote repository URL", { initializedRepository });
        }
        configuredRemote = true;
      }

      const before = this.projectionRebuilder?.recover ? {} : await this.transport.listEventLogFingerprints();
      if (await this.transport.hasEventLog(request.machineId)) {
        const commit = await this.transport.commitEventLog(request.machineId, createCommitMessage(request.machineId, this.now()));
        if (!commit.success) {
          return failed(`Git commit failed: ${commit.error ?? "unknown error"}`, {
            initializedRepository,
            configuredRemote,
          });
        }
      }

      if (autoPull) {
        const fetch = await this.transport.fetch(remoteName);
        if (!fetch.success) {
          return failed(`Git fetch failed: ${fetch.error ?? "unknown error"}`, {
            initializedRepository,
            configuredRemote,
          });
        }
        if (await this.transport.hasRemoteRef(remoteName, branch)) {
          rebaseUnsettled = true;
          const pull = await this.transport.pullRebase(remoteName, branch);
          if (!pull.success) {
            let abort: RemoteTransportCommandResult;
            try { abort = await this.transport.abortRebase(); }
            catch (error) { abort = { success: false, error: unknownErrorMessage(error) }; }
            rebaseUnsettled = !abort.success;
            if (!abort.success) {
              return failed(`Git pull failed: ${pull.error ?? "unknown error"}; Git rebase abort failed: ${abort.error ?? "unknown error"}`, {
                initializedRepository, configuredRemote, rebuildNeeded: true, projectionPending: true,
              });
            }
            return failed(`Git pull failed: ${pull.error ?? "unknown error"}`, {
              initializedRepository,
              configuredRemote,
            });
          }
          rebaseUnsettled = false;
          pulled = true;
        }
      }

      if (autoPush) {
        const push = await this.transport.push(remoteName, branch);
        if (!push.success) {
          let error = `Git push failed: ${push.error ?? "unknown error"}`;
          try { await this.rebuildIfNeeded(before, projection); }
          catch (cause) { error += `; ${unknownErrorMessage(cause)}`; }
          return failed(error, {
            initializedRepository,
            configuredRemote,
            pulled,
            ...projection,
          });
        }
        pushed = true;
      }

      const rebuild = await this.rebuildIfNeeded(before, projection);
      return {
        success: true,
        status: "synced",
        rebuildNeeded: rebuild.rebuildNeeded,
        projectionRebuilt: rebuild.projectionRebuilt,
        pulled,
        pushed,
        configuredRemote,
        initializedRepository,
        error: undefined,
      };
    } catch (error) {
      return failed(unknownErrorMessage(error), {
        initializedRepository,
        configuredRemote,
        pulled,
        pushed,
        ...projection,
        ...(rebaseUnsettled ? { rebuildNeeded: true, projectionPending: true } : {}),
      });
    }
  }

  private async rebuildIfNeeded(before: Record<string, string>, progress: { rebuildNeeded: boolean; projectionRebuilt: boolean }): Promise<{ rebuildNeeded: boolean; projectionRebuilt: boolean }> {
    if (this.projectionRebuilder?.recover) return progress;
    const after = await this.transport.listEventLogFingerprints();
    progress.rebuildNeeded = snapshotsDiffer(before, after);
    if (progress.rebuildNeeded && this.projectionRebuilder) {
      await this.projectionRebuilder.rebuild();
      progress.projectionRebuilt = true;
    }
    return progress;
  }
}

function validateSyncRequest(request: RemoteEventSyncRequest, branch: string, remoteName: string): RemoteValidationResult {
  const machine = validateMachineIdentity(request.machineId);
  if (!machine.valid) return machine;

  const remote = validateRemoteRepositoryUrl(
    request.repositoryUrl,
    request.allowLocalPathRemote === undefined
      ? {}
      : { allowLocalPathRemote: request.allowLocalPathRemote },
  );
  if (!remote.valid) return remote;

  const ref = validateRemoteRef(branch);
  if (!ref.valid) return ref;

  const remoteAlias = validateRemoteRef(remoteName);
  if (!remoteAlias.valid) {
    return { valid: false, error: "Remote name is not valid" };
  }

  return { valid: true };
}

function createGitIdentity(machineId: string): RemoteGitIdentity {
  return {
    machineId,
    userName: "Memory Sync",
    userEmail: "sync@memory.local",
  };
}

function createCommitMessage(machineId: string, now: Date): string {
  return `sync: ${machineId} observed at ${now.toISOString()}`;
}

function blocked(error: string): RemoteEventSyncResult {
  return {
    success: false,
    status: "blocked",
    rebuildNeeded: false,
    projectionRebuilt: false,
    pulled: false,
    pushed: false,
    configuredRemote: false,
    initializedRepository: false,
    error,
  };
}

function failed(error: string, partial: Partial<RemoteEventSyncResult> = {}): RemoteEventSyncResult {
  return {
    success: false,
    status: "failed",
    rebuildNeeded: partial.rebuildNeeded ?? false,
    projectionRebuilt: partial.projectionRebuilt ?? false,
    pulled: partial.pulled ?? false,
    pushed: partial.pushed ?? false,
    configuredRemote: partial.configuredRemote ?? false,
    initializedRepository: partial.initializedRepository ?? false,
    ...(partial.projectionPending === undefined ? {} : { projectionPending: partial.projectionPending }),
    error,
  };
}

function snapshotsDiffer(before: Record<string, string>, after: Record<string, string>): boolean {
  const beforeKeys = Object.keys(before).sort();
  const afterKeys = Object.keys(after).sort();
  if (beforeKeys.length !== afterKeys.length) return true;
  for (let index = 0; index < beforeKeys.length; index += 1) {
    const key = beforeKeys[index]!;
    const afterKey = afterKeys[index]!;
    if (key !== afterKey || before[key] !== after[afterKey]) {
      return true;
    }
  }
  return false;
}

function hasControlCharacter(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

function isLocalPathRemote(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("~") ||
    value.startsWith("file://") ||
    /^[A-Za-z]:[\\/]/.test(value)
  );
}
