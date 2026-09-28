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

describe("receipt-based remote projection recovery", () => {
  const request = { machineId: "machine-1234", repositoryUrl: "https://example.invalid/events.git" };

  it("recovers retained source before unchanged transport and verifies again afterward", async () => {
    const { transport, calls } = createTransport({ snapshots: [{ a: "same" }, { a: "same" }] });
    const rebuild = mock(async () => {});
    const recover = mock(async () => {
      calls.push("recover");
      return { rebuilt: calls.length === 1, pending: false };
    });
    const result = await new RemoteEventSyncService({ transport, projectionRebuilder: { rebuild, recover } }).sync(request);
    expect(result).toMatchObject({ success: true, rebuildNeeded: true, projectionRebuilt: true, projectionPending: false });
    expect(calls[0]).toBe("recover");
    expect(calls.at(-1)).toBe("recover");
    expect(recover).toHaveBeenCalledTimes(2);
    expect(rebuild).not.toHaveBeenCalled();
  });

  it("recovers local work despite offline fetch and retains the transport failure", async () => {
    const { transport, calls } = createTransport({ failures: { fetch: fail("offline") } });
    const recover = mock(async () => ({ rebuilt: true, pending: false }));
    const result = await new RemoteEventSyncService({ transport, projectionRebuilder: { rebuild: async () => {}, recover } }).sync(request);
    expect(result).toMatchObject({ success: false, configuredRemote: true, pulled: false,
      error: "Git fetch failed: offline", rebuildNeeded: true, projectionRebuilt: true, projectionPending: false });
    expect(recover).toHaveBeenCalledTimes(2);
    expect(calls).not.toContain("push");
  });

  it.each(["pending", "throws", "malformed"])("stops transport when pre-recovery %s", async mode => {
    const { transport, calls } = createTransport();
    const recover = mock(async () => {
      if (mode === "throws") throw new Error("content diverged");
      return mode === "pending" ? { rebuilt: true, pending: true } : {} as { rebuilt: boolean; pending: boolean };
    });
    const result = await new RemoteEventSyncService({ transport, projectionRebuilder: { rebuild: async () => {}, recover } }).sync(request);
    expect(result).toMatchObject({ success: false, status: "failed", rebuildNeeded: true,
      projectionRebuilt: mode === "pending", projectionPending: true });
    expect(result.error).toBeTruthy();
    expect(calls).toEqual([]);
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("retains completed progress when final recovery fails (transport fails: %s)", async transportFails => {
    const { transport } = createTransport({ failures: transportFails ? { push: fail("offline") } : {} });
    let attempts = 0;
    const recover = mock(async () => {
      if (++attempts === 2) throw new Error("projection write failed");
      return { rebuilt: true, pending: false };
    });
    const result = await new RemoteEventSyncService({ transport, projectionRebuilder: { rebuild: async () => {}, recover } }).sync(request);
    expect(result).toMatchObject({ success: false, pulled: true, pushed: !transportFails,
      configuredRemote: true, rebuildNeeded: true, projectionRebuilt: true, projectionPending: true });
    expect(result.error).toContain("projection write failed");
    if (transportFails) expect(result.error).toContain("Git push failed: offline");
  });

  it("does not recover or transport before validation and privacy admission", async () => {
    const { transport, calls } = createTransport();
    const recover = mock(async () => ({ rebuilt: false, pending: false }));
    const audit = mock(async () => ({ eventLogFindings: 1 }));
    const service = new RemoteEventSyncService({ transport, privacyPreflight: { audit }, projectionRebuilder: { rebuild: async () => {}, recover } });
    expect((await service.sync({ ...request, machineId: "local" })).status).toBe("blocked");
    expect(audit).not.toHaveBeenCalled();
    expect((await service.sync(request)).status).toBe("blocked");
    expect(recover).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it.each(["failed", "throws", "pull throws"])("does not replay an unsettled rebase (%s)", async mode => {
    const { transport, calls } = createTransport({
      failures: { pullRebase: fail("conflict"), abortRebase: fail("abort failed") },
      ...(mode === "throws" ? { throwOn: "abortRebase" as const } : mode === "pull throws" ? { throwOn: "pullRebase" as const } : {}),
    });
    const recover = mock(async () => ({ rebuilt: false, pending: false }));
    const result = await new RemoteEventSyncService({ transport, projectionRebuilder: { rebuild: async () => {}, recover } }).sync(request);
    expect(result).toMatchObject({ success: false, pulled: false, pushed: false, rebuildNeeded: true, projectionPending: true });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(calls).not.toContain("push");
  });

  it("retains a legacy replay requirement after a throwing rebuild", async () => {
    const { transport } = createTransport({ snapshots: [{ a: "before" }, { a: "after" }] });
    const result = await new RemoteEventSyncService({ transport, projectionRebuilder: {
      rebuild: async () => { throw new Error("replay failed"); },
    } }).sync(request);
    expect(result).toMatchObject({ success: false, pulled: true, pushed: true,
      rebuildNeeded: true, projectionRebuilt: false, error: "replay failed" });
  });

  it("preserves both legacy push and projection errors", async () => {
    const { transport } = createTransport({ failures: { push: fail("offline") }, snapshots: [{ a: "before" }, { a: "after" }] });
    const result = await new RemoteEventSyncService({ transport, projectionRebuilder: {
      rebuild: async () => { throw new Error("replay failed"); },
    } }).sync(request);
    expect(result).toMatchObject({ success: false, pulled: true, pushed: false, rebuildNeeded: true, projectionRebuilt: false });
    expect(result.error).toContain("Git push failed: offline");
    expect(result.error).toContain("replay failed");
  });

  it("retains a completed replay and pending status at the final cutoff", async () => {
    const { transport } = createTransport();
    let attempt = 0;
    const recover = async () => ++attempt === 1 ? { rebuilt: false, pending: false } : { rebuilt: true, pending: true };
    const result = await new RemoteEventSyncService({ transport, projectionRebuilder: { rebuild: async () => {}, recover } }).sync(request);
    expect(result).toMatchObject({ success: false, pulled: true, pushed: true,
      rebuildNeeded: true, projectionRebuilt: true, projectionPending: true });
    expect(result.error).toContain("remains pending");
  });

  it("fails closed on a throwing privacy audit before recovery or transport", async () => {
    const { transport, calls } = createTransport();
    const recover = mock(async () => ({ rebuilt: false, pending: false }));
    const result = await new RemoteEventSyncService({ transport,
      privacyPreflight: { audit: async () => { throw new Error("audit unavailable"); } },
      projectionRebuilder: { rebuild: async () => {}, recover },
    }).sync(request);
    expect(result).toMatchObject({ success: false, error: "audit unavailable" });
    expect(calls).toEqual([]);
    expect(recover).not.toHaveBeenCalled();
  });

  it("reports failed pull and abort even without transport error messages", async () => {
    const { transport } = createTransport({ failures: { pullRebase: failWithoutError(), abortRebase: failWithoutError() } });
    const result = await new RemoteEventSyncService({ transport }).sync(request);
    expect(result).toMatchObject({ success: false, projectionPending: true,
      error: "Git pull failed: unknown error; Git rebase abort failed: unknown error" });
  });
});

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
