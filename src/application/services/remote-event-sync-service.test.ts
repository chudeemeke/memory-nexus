import { describe, expect, it, mock } from "bun:test";

import {
  RemoteEventSyncService,
  validateMachineIdentity,
  validateRemoteRef,
  validateRemoteRepositoryUrl,
  type RemoteEventTransport,
  type RemoteTransportCommandResult,
} from "./remote-event-sync-service.js";

function ok(extra: Partial<RemoteTransportCommandResult> = {}): RemoteTransportCommandResult {
  return { success: true, ...extra };
}

function fail(error: string): RemoteTransportCommandResult {
  return { success: false, error };
}

function createTransport(options: {
  isRepository?: boolean;
  currentRemote?: string | null;
  remoteRefExists?: boolean;
  snapshots?: Array<Record<string, string>>;
  failures?: Partial<Record<keyof RemoteEventTransport, RemoteTransportCommandResult>>;
} = {}): { transport: RemoteEventTransport; calls: string[] } {
  const calls: string[] = [];
  const snapshots = [...(options.snapshots ?? [{ "events-machine-1234.jsonl": "a" }])];
  const nextSnapshot = () => snapshots.shift() ?? snapshots[snapshots.length - 1] ?? {};

  const resultFor = (name: keyof RemoteEventTransport) => options.failures?.[name] ?? ok();

  const transport: RemoteEventTransport = {
    isRepository: mock(async () => {
      calls.push("isRepository");
      return options.isRepository ?? true;
    }),
    initRepository: mock(async () => {
      calls.push("initRepository");
      return resultFor("initRepository");
    }),
    getRemoteUrl: mock(async () => {
      calls.push("getRemoteUrl");
      return options.currentRemote ?? null;
    }),
    setRemoteUrl: mock(async () => {
      calls.push("setRemoteUrl");
      return resultFor("setRemoteUrl");
    }),
    listEventLogFingerprints: mock(async () => {
      calls.push("listEventLogFingerprints");
      return nextSnapshot();
    }),
    hasEventLog: mock(async () => {
      calls.push("hasEventLog");
      return true;
    }),
    commitEventLog: mock(async () => {
      calls.push("commitEventLog");
      return resultFor("commitEventLog");
    }),
    fetch: mock(async () => {
      calls.push("fetch");
      return resultFor("fetch");
    }),
    hasRemoteRef: mock(async () => {
      calls.push("hasRemoteRef");
      return options.remoteRefExists ?? true;
    }),
    pullRebase: mock(async () => {
      calls.push("pullRebase");
      return resultFor("pullRebase");
    }),
    abortRebase: mock(async () => {
      calls.push("abortRebase");
      return resultFor("abortRebase");
    }),
    push: mock(async () => {
      calls.push("push");
      return resultFor("push");
    }),
  };

  return { transport, calls };
}

describe("remote sync validation", () => {
  it("accepts https, ssh, and scp-style Git remotes", () => {
    expect(validateRemoteRepositoryUrl("https://github.com/chude/memory-events.git")).toEqual({ valid: true });
    expect(validateRemoteRepositoryUrl("ssh://git@github.com/chude/memory-events.git")).toEqual({ valid: true });
    expect(validateRemoteRepositoryUrl("git@github.com:chude/memory-events.git")).toEqual({ valid: true });
  });

  it("rejects unsupported protocols and local paths unless explicitly allowed", () => {
    expect(validateRemoteRepositoryUrl("git://github.com/chude/memory-events.git")).toEqual({
      valid: false,
      error: "Remote URL protocol is not supported",
    });
    expect(validateRemoteRepositoryUrl("C:\\tmp\\memory-events.git")).toEqual({
      valid: false,
      error: "Local path remotes require explicit allowLocalPathRemote consent",
    });
    expect(validateRemoteRepositoryUrl("C:\\tmp\\memory-events.git", { allowLocalPathRemote: true })).toEqual({ valid: true });
  });

  it("rejects unsafe refs and non-durable machine identities", () => {
    expect(validateRemoteRef("main")).toEqual({ valid: true });
    expect(validateRemoteRef("feature/sync")).toEqual({ valid: true });
    expect(validateRemoteRef("main;rm -rf")).toEqual({ valid: false, error: "Remote ref contains unsafe characters" });
    expect(validateRemoteRef("../main")).toEqual({ valid: false, error: "Remote ref is not a valid branch name" });

    expect(validateMachineIdentity("machine-1234")).toEqual({ valid: true });
    expect(validateMachineIdentity("local")).toEqual({ valid: false, error: "Machine identity must come from durable config, not a fallback value" });
    expect(validateMachineIdentity("bad/id")).toEqual({ valid: false, error: "Machine identity contains unsafe characters" });
  });
});

describe("RemoteEventSyncService", () => {
  it("orchestrates sync through transport ports and rebuilds projections when pulled logs change", async () => {
    const { transport, calls } = createTransport({
      isRepository: false,
      currentRemote: "git@github.com:old/repo.git",
      snapshots: [
        { "events-machine-1234.jsonl": "before" },
        { "events-machine-1234.jsonl": "before", "events-machine-5678.jsonl": "after" },
      ],
    });
    const rebuild = mock(async () => undefined);
    const service = new RemoteEventSyncService({ transport, projectionRebuilder: { rebuild } });

    const result = await service.sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    });

    expect(result).toEqual({
      success: true,
      status: "synced",
      rebuildNeeded: true,
      projectionRebuilt: true,
      pulled: true,
      pushed: true,
      configuredRemote: true,
      initializedRepository: true,
      error: undefined,
    });
    expect(calls).toEqual([
      "isRepository",
      "initRepository",
      "getRemoteUrl",
      "setRemoteUrl",
      "listEventLogFingerprints",
      "hasEventLog",
      "commitEventLog",
      "fetch",
      "hasRemoteRef",
      "pullRebase",
      "push",
      "listEventLogFingerprints",
    ]);
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it("blocks before transport when privacy preflight finds active event-log secrets", async () => {
    const { transport, calls } = createTransport();
    const service = new RemoteEventSyncService({
      transport,
      privacyPreflight: { audit: mock(async () => ({ eventLogFindings: 2 })) },
    });

    const result = await service.sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.error).toContain("active event logs contain 2 likely secret finding(s)");
    expect(calls).toEqual([]);
  });

  it("aborts rebase and reports pull failures without pushing", async () => {
    const { transport, calls } = createTransport({
      failures: { pullRebase: fail("conflict") },
    });
    const service = new RemoteEventSyncService({ transport });

    const result = await service.sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    });

    expect(result).toMatchObject({
      success: false,
      status: "failed",
      rebuildNeeded: false,
      pulled: false,
      pushed: false,
      error: "Git pull failed: conflict",
    });
    expect(calls).toContain("abortRebase");
    expect(calls).not.toContain("push");
  });

  it("does not fetch or push when auto flags are disabled", async () => {
    const { transport, calls } = createTransport({ currentRemote: "git@github.com:chude/memory-events.git" });
    const service = new RemoteEventSyncService({ transport });

    const result = await service.sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
      autoPull: false,
      autoPush: false,
    });

    expect(result).toMatchObject({ success: true, pulled: false, pushed: false });
    expect(calls).not.toContain("fetch");
    expect(calls).not.toContain("push");
  });

  it("rejects local path remotes before transport unless explicitly allowed", async () => {
    const { transport, calls } = createTransport();
    const service = new RemoteEventSyncService({ transport });

    const result = await service.sync({
      machineId: "machine-1234",
      repositoryUrl: "C:\\tmp\\memory-events.git",
    });

    expect(result).toMatchObject({
      success: false,
      status: "blocked",
      error: "Local path remotes require explicit allowLocalPathRemote consent",
    });
    expect(calls).toEqual([]);
  });
});
