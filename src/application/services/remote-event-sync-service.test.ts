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

function failWithoutError(): RemoteTransportCommandResult {
  return { success: false };
}

function createTransport(options: {
  isRepository?: boolean;
  currentRemote?: string | null;
  hasEventLog?: boolean;
  remoteRefExists?: boolean;
  snapshots?: Array<Record<string, string>>;
  failures?: Partial<Record<keyof RemoteEventTransport, RemoteTransportCommandResult>>;
  throwOn?: keyof RemoteEventTransport;
} = {}): { transport: RemoteEventTransport; calls: string[] } {
  const calls: string[] = [];
  const snapshots = [...(options.snapshots ?? [{ "events-machine-1234.jsonl": "a" }])];
  const nextSnapshot = () => snapshots.shift() ?? snapshots[snapshots.length - 1] ?? {};

  const beforeCall = (name: keyof RemoteEventTransport) => {
    calls.push(name);
    if (options.throwOn === name) {
      throw new Error(`${name} exploded`);
    }
  };

  const resultFor = (name: keyof RemoteEventTransport) => options.failures?.[name] ?? ok();

  const transport: RemoteEventTransport = {
    isRepository: mock(async () => {
      beforeCall("isRepository");
      return options.isRepository ?? true;
    }),
    initRepository: mock(async () => {
      beforeCall("initRepository");
      return resultFor("initRepository");
    }),
    getRemoteUrl: mock(async () => {
      beforeCall("getRemoteUrl");
      return options.currentRemote ?? null;
    }),
    setRemoteUrl: mock(async () => {
      beforeCall("setRemoteUrl");
      return resultFor("setRemoteUrl");
    }),
    listEventLogFingerprints: mock(async () => {
      beforeCall("listEventLogFingerprints");
      return nextSnapshot();
    }),
    hasEventLog: mock(async () => {
      beforeCall("hasEventLog");
      return options.hasEventLog ?? true;
    }),
    commitEventLog: mock(async () => {
      beforeCall("commitEventLog");
      return resultFor("commitEventLog");
    }),
    fetch: mock(async () => {
      beforeCall("fetch");
      return resultFor("fetch");
    }),
    hasRemoteRef: mock(async () => {
      beforeCall("hasRemoteRef");
      return options.remoteRefExists ?? true;
    }),
    pullRebase: mock(async () => {
      beforeCall("pullRebase");
      return resultFor("pullRebase");
    }),
    abortRebase: mock(async () => {
      beforeCall("abortRebase");
      return resultFor("abortRebase");
    }),
    push: mock(async () => {
      beforeCall("push");
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

  it("rejects empty, control-character, malformed, and unsupported remote URLs", () => {
    expect(validateRemoteRepositoryUrl("   ")).toEqual({ valid: false, error: "Remote URL is required" });
    expect(validateRemoteRepositoryUrl("https://github.com/chude/repo.git\nbad")).toEqual({
      valid: false,
      error: "Remote URL contains control characters",
    });
    expect(validateRemoteRepositoryUrl("not a git remote")).toEqual({
      valid: false,
      error: "Remote URL is not a supported Git remote",
    });
    expect(validateRemoteRepositoryUrl("ftp://example.com/repo.git")).toEqual({
      valid: false,
      error: "Remote URL protocol is not supported",
    });
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

  it("requires explicit consent for every local-path remote shape", () => {
    const localRemotes = [
      "/tmp/memory-events.git",
      "./memory-events.git",
      "../memory-events.git",
      "~/memory-events.git",
      "file:///tmp/memory-events.git",
      "D:/memory-events.git",
    ];

    for (const remote of localRemotes) {
      expect(validateRemoteRepositoryUrl(remote)).toEqual({
        valid: false,
        error: "Local path remotes require explicit allowLocalPathRemote consent",
      });
      expect(validateRemoteRepositoryUrl(remote, { allowLocalPathRemote: true })).toEqual({ valid: true });
    }
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

  it("rejects branch names that Git treats as ambiguous or unsafe", () => {
    for (const ref of ["", "/main", "main/", ".main", "main..next", "main//next", "main.", "main.lock", "main name"]) {
      expect(validateRemoteRef(ref).valid).toBe(false);
    }
  });

  it("rejects blank, fallback, unsafe, and oversized machine identities", () => {
    expect(validateMachineIdentity("")).toEqual({ valid: false, error: "Machine identity is required" });
    expect(validateMachineIdentity("legacy")).toEqual({
      valid: false,
      error: "Machine identity must come from durable config, not a fallback value",
    });
    expect(validateMachineIdentity("machine 1234")).toEqual({
      valid: false,
      error: "Machine identity contains unsafe characters",
    });
    expect(validateMachineIdentity("m".repeat(129))).toEqual({
      valid: false,
      error: "Machine identity is too long",
    });
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

  it("fails when repository initialization or remote configuration fails", async () => {
    const init = createTransport({
      isRepository: false,
      failures: { initRepository: fail("git init denied") },
    });
    const initResult = await new RemoteEventSyncService({ transport: init.transport }).sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    });

    expect(initResult).toMatchObject({
      success: false,
      status: "failed",
      initializedRepository: false,
      error: "git init denied",
    });
    expect(init.calls).toEqual(["isRepository", "initRepository"]);

    const configure = createTransport({
      isRepository: false,
      failures: { setRemoteUrl: fail("remote add denied") },
    });
    const configureResult = await new RemoteEventSyncService({ transport: configure.transport }).sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    });

    expect(configureResult).toMatchObject({
      success: false,
      status: "failed",
      initializedRepository: true,
      configuredRemote: false,
      error: "remote add denied",
    });
    expect(configure.calls).toContain("setRemoteUrl");
  });

  it("skips remote reconfiguration and local commit when already configured with no local event log", async () => {
    const { transport, calls } = createTransport({
      currentRemote: "git@github.com:chude/memory-events.git",
      hasEventLog: false,
      remoteRefExists: false,
      snapshots: [
        { "events-machine-1234.jsonl": "same" },
        { "events-machine-1234.jsonl": "same" },
      ],
    });
    const service = new RemoteEventSyncService({ transport });

    const result = await service.sync({
      machineId: "machine-1234",
      repositoryUrl: " git@github.com:chude/memory-events.git ",
    });

    expect(result).toMatchObject({
      success: true,
      configuredRemote: false,
      initializedRepository: false,
      pulled: false,
      pushed: true,
      rebuildNeeded: false,
      projectionRebuilt: false,
    });
    expect(calls).not.toContain("setRemoteUrl");
    expect(calls).not.toContain("commitEventLog");
    expect(calls).not.toContain("pullRebase");
  });

  it("reports commit and fetch failures without continuing to unsafe network mutation", async () => {
    const commit = createTransport({
      failures: { commitEventLog: fail("nothing can be committed") },
    });
    const commitResult = await new RemoteEventSyncService({ transport: commit.transport }).sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    });

    expect(commitResult).toMatchObject({
      success: false,
      status: "failed",
      error: "Git commit failed: nothing can be committed",
    });
    expect(commit.calls).not.toContain("fetch");

    const fetch = createTransport({
      failures: { fetch: fail("network unavailable") },
    });
    const fetchResult = await new RemoteEventSyncService({ transport: fetch.transport }).sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    });

    expect(fetchResult).toMatchObject({
      success: false,
      status: "failed",
      error: "Git fetch failed: network unavailable",
    });
    expect(fetch.calls).not.toContain("push");
  });

  it("uses stable fallback errors when transport failures omit provider details", async () => {
    const init = createTransport({
      isRepository: false,
      failures: { initRepository: failWithoutError() },
    });
    await expect(new RemoteEventSyncService({ transport: init.transport }).sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    })).resolves.toMatchObject({
      success: false,
      status: "failed",
      error: "Failed to initialize Git repository in events directory",
    });

    const configure = createTransport({
      failures: { setRemoteUrl: failWithoutError() },
    });
    await expect(new RemoteEventSyncService({ transport: configure.transport }).sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    })).resolves.toMatchObject({
      success: false,
      status: "failed",
      error: "Failed to configure Git remote repository URL",
    });

    const commit = createTransport({
      failures: { commitEventLog: failWithoutError() },
    });
    await expect(new RemoteEventSyncService({ transport: commit.transport }).sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    })).resolves.toMatchObject({
      success: false,
      status: "failed",
      error: "Git commit failed: unknown error",
    });

    const fetch = createTransport({
      failures: { fetch: failWithoutError() },
    });
    await expect(new RemoteEventSyncService({ transport: fetch.transport }).sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    })).resolves.toMatchObject({
      success: false,
      status: "failed",
      error: "Git fetch failed: unknown error",
    });

    const pull = createTransport({
      failures: { pullRebase: failWithoutError() },
    });
    await expect(new RemoteEventSyncService({ transport: pull.transport }).sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    })).resolves.toMatchObject({
      success: false,
      status: "failed",
      error: "Git pull failed: unknown error",
    });

    const push = createTransport({
      failures: { push: failWithoutError() },
    });
    await expect(new RemoteEventSyncService({ transport: push.transport }).sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    })).resolves.toMatchObject({
      success: false,
      status: "failed",
      error: "Git push failed: unknown error",
    });
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

  it("rebuilds projections after push failures when pulled logs changed", async () => {
    const { transport, calls } = createTransport({
      snapshots: [
        { "events-machine-1234.jsonl": "before" },
        { "events-machine-1234.jsonl": "before", "events-machine-5678.jsonl": "after" },
      ],
      failures: { push: fail("non fast-forward") },
    });
    const rebuild = mock(async () => undefined);
    const service = new RemoteEventSyncService({ transport, projectionRebuilder: { rebuild } });

    const result = await service.sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    });

    expect(result).toMatchObject({
      success: false,
      status: "failed",
      error: "Git push failed: non fast-forward",
      pulled: true,
      pushed: false,
      rebuildNeeded: true,
      projectionRebuilt: true,
    });
    expect(calls).toContain("push");
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it("marks rebuild needed without rebuilding when no projection rebuilder is configured", async () => {
    const { transport } = createTransport({
      snapshots: [
        { "events-machine-1234.jsonl": "before" },
        { "events-machine-1234.jsonl": "after" },
      ],
    });
    const service = new RemoteEventSyncService({ transport });

    const result = await service.sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    });

    expect(result).toMatchObject({
      success: true,
      rebuildNeeded: true,
      projectionRebuilt: false,
    });
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

  it("allows local path remotes only when explicit request consent is present", async () => {
    const { transport, calls } = createTransport();
    const service = new RemoteEventSyncService({ transport });

    const result = await service.sync({
      machineId: "machine-1234",
      repositoryUrl: "C:\\tmp\\memory-events.git",
      allowLocalPathRemote: true,
      autoPull: false,
      autoPush: false,
    });

    expect(result).toMatchObject({ success: true, status: "synced" });
    expect(calls).toContain("isRepository");
  });

  it("blocks invalid branch and remote alias before transport", async () => {
    const badMachine = createTransport();
    const machineResult = await new RemoteEventSyncService({ transport: badMachine.transport }).sync({
      machineId: "local",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    });

    expect(machineResult).toMatchObject({
      success: false,
      status: "blocked",
      error: "Machine identity must come from durable config, not a fallback value",
    });
    expect(badMachine.calls).toEqual([]);

    const badBranch = createTransport();
    const branchResult = await new RemoteEventSyncService({ transport: badBranch.transport }).sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
      branch: "main.lock",
    });

    expect(branchResult).toMatchObject({
      success: false,
      status: "blocked",
      error: "Remote ref is not a valid branch name",
    });
    expect(badBranch.calls).toEqual([]);

    const badRemoteName = createTransport();
    const remoteNameResult = await new RemoteEventSyncService({ transport: badRemoteName.transport }).sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
      remoteName: "origin;bad",
    });

    expect(remoteNameResult).toMatchObject({
      success: false,
      status: "blocked",
      error: "Remote name is not valid",
    });
    expect(badRemoteName.calls).toEqual([]);
  });

  it("captures unexpected transport errors with partial progress flags", async () => {
    const { transport } = createTransport({ throwOn: "push" });
    const service = new RemoteEventSyncService({ transport });

    const result = await service.sync({
      machineId: "machine-1234",
      repositoryUrl: "git@github.com:chude/memory-events.git",
    });

    expect(result).toMatchObject({
      success: false,
      status: "failed",
      configuredRemote: true,
      pulled: true,
      pushed: false,
      error: "push exploded",
    });
  });
});
