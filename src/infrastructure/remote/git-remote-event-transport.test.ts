import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RemoteEventSyncService } from "../../application/services/remote-event-sync-service.js";
import {
  GitRemoteEventTransport,
  runGitCommand,
  sanitizeGitEnvironment,
  type GitCommandResult,
} from "./git-remote-event-transport.js";

function gitOk(stdout = ""): GitCommandResult {
  return { success: true, stdout, stderr: "", exitCode: 0 };
}

function gitFail(stderr = "failed", exitCode = 1): GitCommandResult {
  return { success: false, stdout: "", stderr, exitCode };
}

async function removeDir(path: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!existsSync(path)) return;
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

describe("git transport environment hardening", () => {
  it("strips Git control environment while preserving process basics", () => {
    const env = sanitizeGitEnvironment({
      PATH: "C:\\bin",
      HOME: "C:\\Users\\Destiny",
      USERPROFILE: "C:\\Users\\Destiny",
      SSH_AUTH_SOCK: "agent.sock",
      GIT_DIR: "C:\\attacker\\.git",
      GIT_WORK_TREE: "C:\\attacker",
      GIT_SSH_COMMAND: "ssh -oProxyCommand=bad",
      GIT_TRACE: "1",
    });

    expect(env.PATH).toBe("C:\\bin");
    expect(env.HOME).toBe("C:\\Users\\Destiny");
    expect(env.USERPROFILE).toBe("C:\\Users\\Destiny");
    expect(env.SSH_AUTH_SOCK).toBe("agent.sock");
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.GIT_WORK_TREE).toBeUndefined();
    expect(env.GIT_SSH_COMMAND).toBeUndefined();
    expect(env.GIT_TRACE).toBeUndefined();
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env.GIT_PAGER).toBe("cat");
  });
});

describe("GitRemoteEventTransport unit behavior", () => {
  it("initializes a repository with durable Git identity and main branch", async () => {
    const calls: string[][] = [];
    const madeDirs: Array<{ path: string; recursive: boolean | undefined }> = [];
    const transport = new GitRemoteEventTransport("C:\\events", {
      mkdirSync: (path, options) => {
        madeDirs.push({ path, recursive: options?.recursive });
      },
      runGit: async (args) => {
        calls.push(args);
        return gitOk();
      },
    });

    await expect(transport.initRepository({
      machineId: "machine-1234",
      userName: "Memory Sync",
      userEmail: "sync@memory.local",
    })).resolves.toEqual({ success: true });

    expect(madeDirs).toEqual([{ path: "C:\\events", recursive: true }]);
    expect(calls).toEqual([
      ["init"],
      ["config", "user.name", "Memory Sync"],
      ["config", "user.email", "sync@memory.local"],
      ["symbolic-ref", "HEAD", "refs/heads/main"],
    ]);
  });

  it("reports initialization failures at each Git setup step", async () => {
    const cases: Array<{ failingCall: number; expected: string }> = [
      { failingCall: 1, expected: "Failed to initialize Git repository in events directory" },
      { failingCall: 2, expected: "Failed to configure Git user.name" },
      { failingCall: 3, expected: "Failed to configure Git user.email" },
      { failingCall: 4, expected: "Failed to configure Git main branch" },
    ];

    for (const testCase of cases) {
      let call = 0;
      const transport = new GitRemoteEventTransport("C:\\events", {
        runGit: async () => {
          call += 1;
          return call === testCase.failingCall ? gitFail("", 128) : gitOk();
        },
      });

      await expect(transport.initRepository({
        machineId: "machine-1234",
        userName: "Memory Sync",
        userEmail: "sync@memory.local",
      })).resolves.toEqual({ success: false, error: testCase.expected });
    }
  });

  it("returns repository and remote status without throwing when Git has no origin yet", async () => {
    const transport = new GitRemoteEventTransport("C:\\events", {
      existsSync: (path) => path.endsWith(".git"),
      runGit: async () => gitFail("No such remote", 2),
    });

    await expect(transport.isRepository()).resolves.toBe(true);
    await expect(transport.getRemoteUrl()).resolves.toBeNull();
  });

  it("configures origin with argument-array Git calls", async () => {
    const calls: string[][] = [];
    const transport = new GitRemoteEventTransport("C:\\events", {
      runGit: async (args) => {
        calls.push(args);
        return gitOk();
      },
    });

    await expect(transport.setRemoteUrl("git@github.com:chude/memory-events.git")).resolves.toEqual({ success: true });
    expect(calls).toEqual([
      ["remote", "remove", "origin"],
      ["remote", "add", "origin", "git@github.com:chude/memory-events.git"],
    ]);
  });

  it("reports remote configuration failures using stderr, stdout, or fallback text", async () => {
    const stderrTransport = new GitRemoteEventTransport("C:\\events", {
      runGit: async (args) => args[0] === "remote" && args[1] === "add"
        ? gitFail("permission denied", 128)
        : gitOk(),
    });
    await expect(stderrTransport.setRemoteUrl("git@example.com:repo.git")).resolves.toEqual({
      success: false,
      error: "permission denied",
    });

    const stdoutTransport = new GitRemoteEventTransport("C:\\events", {
      runGit: async (args) => args[0] === "remote" && args[1] === "add"
        ? { success: false, stdout: "bad stdout", stderr: "", exitCode: 128 }
        : gitOk(),
    });
    await expect(stdoutTransport.setRemoteUrl("git@example.com:repo.git")).resolves.toEqual({
      success: false,
      error: "bad stdout",
    });

    const fallbackTransport = new GitRemoteEventTransport("C:\\events", {
      runGit: async (args) => args[0] === "remote" && args[1] === "add"
        ? { success: false, stdout: "", stderr: "", exitCode: 128 }
        : gitOk(),
    });
    await expect(fallbackTransport.setRemoteUrl("git@example.com:repo.git")).resolves.toEqual({
      success: false,
      error: "Failed to configure Git remote repository URL",
    });
  });

  it("fingerprints only event log files still present on disk", async () => {
    const transport = new GitRemoteEventTransport("C:\\events", {
      getAllLogFiles: () => [
        "C:\\events\\events-missing.jsonl",
        "C:\\events\\events-machine-1234.jsonl",
      ],
      existsSync: (path) => path.endsWith("events-machine-1234.jsonl"),
      readFileSync: () => "{\"event\":\"one\"}\n",
    });

    const fingerprints = await transport.listEventLogFingerprints();

    expect(Object.keys(fingerprints)).toEqual(["events-machine-1234.jsonl"]);
    expect(fingerprints["events-machine-1234.jsonl"]).toHaveLength(64);
  });

  it("skips commit when the machine has no event log", async () => {
    const calls: string[][] = [];
    const transport = new GitRemoteEventTransport("C:\\events", {
      existsSync: () => false,
      runGit: async (args) => {
        calls.push(args);
        return gitOk();
      },
    });

    await expect(transport.commitEventLog("machine-1234", "sync message")).resolves.toEqual({
      success: true,
      skipped: true,
    });
    expect(calls).toEqual([]);
  });

  it("treats clean staged event logs as a skipped commit", async () => {
    const calls: string[][] = [];
    const transport = new GitRemoteEventTransport("C:\\events", {
      existsSync: () => true,
      runGit: async (args) => {
        calls.push(args);
        return gitOk();
      },
    });

    const result = await transport.commitEventLog("machine-1234", "sync message");

    expect(result).toEqual({ success: true, skipped: true });
    expect(calls).toEqual([
      ["add", "--", "events-machine-1234.jsonl"],
      ["diff", "--cached", "--quiet", "--", "events-machine-1234.jsonl"],
    ]);
  });

  it("reports add, diff, and commit failures when staging local event logs", async () => {
    const addFailure = new GitRemoteEventTransport("C:\\events", {
      existsSync: () => true,
      runGit: async (args) => args[0] === "add" ? gitFail("index locked", 128) : gitOk(),
    });
    await expect(addFailure.commitEventLog("machine-1234", "sync message")).resolves.toEqual({
      success: false,
      error: "index locked",
    });

    const diffFailure = new GitRemoteEventTransport("C:\\events", {
      existsSync: () => true,
      runGit: async (args) => args[0] === "diff" ? gitFail("diff died", 2) : gitOk(),
    });
    await expect(diffFailure.commitEventLog("machine-1234", "sync message")).resolves.toEqual({
      success: false,
      error: "diff died",
    });

    const commitFailure = new GitRemoteEventTransport("C:\\events", {
      existsSync: () => true,
      runGit: async (args) => {
        if (args[0] === "diff") return gitFail("", 1);
        if (args[0] === "commit") return gitFail("commit rejected", 1);
        return gitOk();
      },
    });
    await expect(commitFailure.commitEventLog("machine-1234", "sync message")).resolves.toEqual({
      success: false,
      error: "commit rejected",
    });
  });

  it("commits when staged event log content changed", async () => {
    const calls: string[][] = [];
    const transport = new GitRemoteEventTransport("C:\\events", {
      existsSync: () => true,
      runGit: async (args) => {
        calls.push(args);
        return calls.length === 2 ? gitFail("", 1) : gitOk();
      },
    });

    const result = await transport.commitEventLog("machine-1234", "sync message");

    expect(result).toEqual({ success: true });
    expect(calls).toEqual([
      ["add", "--", "events-machine-1234.jsonl"],
      ["diff", "--cached", "--quiet", "--", "events-machine-1234.jsonl"],
      ["commit", "--no-gpg-sign", "-m", "sync message", "--", "events-machine-1234.jsonl"],
    ]);
  });

  it("reports fetch, pull, rebase abort, and push failures", async () => {
    const transport = new GitRemoteEventTransport("C:\\events", {
      runGit: async (args) => {
        switch (args[0]) {
          case "fetch":
            return gitFail("fetch denied", 128);
          case "pull":
            return gitFail("pull conflict", 1);
          case "rebase":
            return gitFail("abort denied", 1);
          case "push":
            return gitFail("push rejected", 1);
          case "rev-parse":
            return gitFail("missing ref", 128);
          default:
            return gitOk();
        }
      },
    });

    await expect(transport.fetch("origin")).resolves.toEqual({ success: false, error: "fetch denied" });
    await expect(transport.hasRemoteRef("origin", "main")).resolves.toBe(false);
    await expect(transport.pullRebase("origin", "main")).resolves.toEqual({ success: false, error: "pull conflict" });
    await expect(transport.abortRebase()).resolves.toEqual({ success: false, error: "abort denied" });
    await expect(transport.push("origin", "main")).resolves.toEqual({ success: false, error: "push rejected" });
  });

  it("treats an absent in-progress rebase as a successful cleanup", async () => {
    const transport = new GitRemoteEventTransport("C:\\events", {
      runGit: async () => gitFail("fatal: No rebase in progress?", 128),
    });

    await expect(transport.abortRebase()).resolves.toEqual({ success: true });
  });
});

describe("GitRemoteEventTransport integration", () => {
  let rootDir: string;
  let remoteDir: string;
  let deviceOneDir: string;
  let deviceTwoDir: string;
  let gitHomeDir: string;
  let gitEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    rootDir = mkdtempSync(join(tmpdir(), "memory-remote-transport-"));
    remoteDir = join(rootDir, "remote.git");
    deviceOneDir = join(rootDir, "device-one");
    deviceTwoDir = join(rootDir, "device-two");
    gitHomeDir = join(rootDir, "git-home");
    mkdirSync(remoteDir, { recursive: true });
    mkdirSync(deviceOneDir, { recursive: true });
    mkdirSync(deviceTwoDir, { recursive: true });
    mkdirSync(gitHomeDir, { recursive: true });
    gitEnv = {
      ...process.env,
      HOME: gitHomeDir,
      USERPROFILE: gitHomeDir,
      XDG_CONFIG_HOME: join(gitHomeDir, ".config"),
    };

    await runGitCommand(["init", "--bare"], remoteDir, { env: gitEnv });
    await runGitCommand(["symbolic-ref", "HEAD", "refs/heads/main"], remoteDir, { env: gitEnv });
  });

  afterEach(async () => {
    await removeDir(rootDir);
  });

  it("syncs machine event logs through a temp bare repository and rebuilds after remote pulls", async () => {
    writeFileSync(join(deviceOneDir, "events-machine-one.jsonl"), "{\"event\":\"one\"}\n");
    const deviceOneRebuild = mock(async () => undefined);
    const deviceOne = new RemoteEventSyncService({
      transport: new GitRemoteEventTransport(deviceOneDir, { env: gitEnv }),
      projectionRebuilder: { rebuild: deviceOneRebuild },
      now: () => new Date("2026-06-06T08:00:00.000Z"),
    });

    const first = await deviceOne.sync({
      machineId: "machine-one",
      repositoryUrl: remoteDir,
      allowLocalPathRemote: true,
    });
    expect(first.success).toBe(true);
    expect(first.rebuildNeeded).toBe(false);

    const deviceTwoRebuild = mock(async () => undefined);
    const deviceTwo = new RemoteEventSyncService({
      transport: new GitRemoteEventTransport(deviceTwoDir, { env: gitEnv }),
      projectionRebuilder: { rebuild: deviceTwoRebuild },
      now: () => new Date("2026-06-06T08:01:00.000Z"),
    });

    const pulledOne = await deviceTwo.sync({
      machineId: "machine-two",
      repositoryUrl: remoteDir,
      allowLocalPathRemote: true,
    });
    expect(pulledOne.success).toBe(true);
    expect(pulledOne.rebuildNeeded).toBe(true);
    expect(deviceTwoRebuild).toHaveBeenCalledTimes(1);
    expect(existsSync(join(deviceTwoDir, "events-machine-one.jsonl"))).toBe(true);

    writeFileSync(join(deviceTwoDir, "events-machine-two.jsonl"), "{\"event\":\"two\"}\n");
    const pushedTwo = await deviceTwo.sync({
      machineId: "machine-two",
      repositoryUrl: remoteDir,
      allowLocalPathRemote: true,
    });
    expect(pushedTwo.success).toBe(true);

    const pulledTwo = await deviceOne.sync({
      machineId: "machine-one",
      repositoryUrl: remoteDir,
      allowLocalPathRemote: true,
    });
    expect(pulledTwo.success).toBe(true);
    expect(pulledTwo.rebuildNeeded).toBe(true);
    expect(deviceOneRebuild).toHaveBeenCalledTimes(1);
    expect(existsSync(join(deviceOneDir, "events-machine-two.jsonl"))).toBe(true);
  }, 90000);
});
