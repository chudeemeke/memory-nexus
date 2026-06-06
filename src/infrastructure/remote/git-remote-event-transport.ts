import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawn } from "bun";

import type {
  RemoteEventTransport,
  RemoteGitIdentity,
  RemoteTransportCommandResult,
} from "../../application/services/remote-event-sync-service.js";
import { getAllLogFiles } from "../paths.js";

export interface GitCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunGitCommandOptions {
  env?: NodeJS.ProcessEnv;
}

export interface GitRemoteEventTransportDeps {
  runGit?: (args: string[], cwd: string) => Promise<GitCommandResult>;
  env?: NodeJS.ProcessEnv;
  existsSync?: (path: string) => boolean;
  mkdirSync?: (path: string, options?: { recursive?: boolean }) => void;
  readFileSync?: (path: string, encoding: BufferEncoding) => string;
  getAllLogFiles?: (eventsDir?: string) => string[];
}

const SAFE_ENV_KEYS = new Set([
  "PATH",
  "Path",
  "HOME",
  "USERPROFILE",
  "XDG_CONFIG_HOME",
  "SSH_AUTH_SOCK",
  "TEMP",
  "TMP",
  "TMPDIR",
  "SystemRoot",
  "WINDIR",
]);

export function sanitizeGitEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = env[key];
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  sanitized.GIT_TERMINAL_PROMPT = "0";
  sanitized.GIT_PAGER = "cat";
  sanitized.GIT_OPTIONAL_LOCKS = "0";
  return sanitized;
}

export async function runGitCommand(
  args: string[],
  cwd: string,
  options: RunGitCommandOptions = {},
): Promise<GitCommandResult> {
  const proc = spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: sanitizeGitEnvironment(options.env),
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return {
    success: exitCode === 0,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
  };
}

export class GitRemoteEventTransport implements RemoteEventTransport {
  private readonly eventsDir: string;
  private readonly runGit: (args: string[], cwd: string) => Promise<GitCommandResult>;
  private readonly deps: Required<Omit<GitRemoteEventTransportDeps, "runGit" | "env">>;

  constructor(eventsDir: string, deps: GitRemoteEventTransportDeps = {}) {
    this.eventsDir = eventsDir;
    const env = deps.env ?? process.env;
    this.runGit = deps.runGit ?? ((args, cwd) => runGitCommand(args, cwd, { env }));
    this.deps = {
      existsSync,
      mkdirSync,
      readFileSync,
      getAllLogFiles,
      ...deps,
    };
  }

  async isRepository(): Promise<boolean> {
    return this.deps.existsSync(join(this.eventsDir, ".git"));
  }

  async initRepository(identity: RemoteGitIdentity): Promise<RemoteTransportCommandResult> {
    this.deps.mkdirSync(this.eventsDir, { recursive: true });
    const init = await this.runGit(["init"], this.eventsDir);
    if (!init.success) return commandFailure(init, "Failed to initialize Git repository in events directory");

    const name = await this.runGit(["config", "user.name", identity.userName], this.eventsDir);
    if (!name.success) return commandFailure(name, "Failed to configure Git user.name");

    const email = await this.runGit(["config", "user.email", identity.userEmail], this.eventsDir);
    if (!email.success) return commandFailure(email, "Failed to configure Git user.email");

    const branch = await this.runGit(["symbolic-ref", "HEAD", "refs/heads/main"], this.eventsDir);
    if (!branch.success) return commandFailure(branch, "Failed to configure Git main branch");

    return { success: true };
  }

  async getRemoteUrl(): Promise<string | null> {
    const result = await this.runGit(["remote", "get-url", "origin"], this.eventsDir);
    return result.success ? result.stdout : null;
  }

  async setRemoteUrl(remoteUrl: string): Promise<RemoteTransportCommandResult> {
    await this.runGit(["remote", "remove", "origin"], this.eventsDir);
    const add = await this.runGit(["remote", "add", "origin", remoteUrl], this.eventsDir);
    return add.success ? { success: true } : commandFailure(add, "Failed to configure Git remote repository URL");
  }

  async listEventLogFingerprints(): Promise<Record<string, string>> {
    const fingerprints: Record<string, string> = {};
    const files = this.deps.getAllLogFiles(this.eventsDir).sort();
    for (const file of files) {
      if (this.deps.existsSync(file)) {
        fingerprints[basename(file)] = sha256(this.deps.readFileSync(file, "utf-8"));
      }
    }
    return fingerprints;
  }

  async hasEventLog(machineId: string): Promise<boolean> {
    return this.deps.existsSync(join(this.eventsDir, `events-${machineId}.jsonl`));
  }

  async commitEventLog(machineId: string, message: string): Promise<RemoteTransportCommandResult> {
    const fileName = `events-${machineId}.jsonl`;
    if (!await this.hasEventLog(machineId)) {
      return { success: true, skipped: true };
    }

    const add = await this.runGit(["add", "--", fileName], this.eventsDir);
    if (!add.success) return commandFailure(add, "Git add failed");

    const diff = await this.runGit(["diff", "--cached", "--quiet", "--", fileName], this.eventsDir);
    if (diff.success) {
      return { success: true, skipped: true };
    }
    if (diff.exitCode !== 1) {
      return commandFailure(diff, "Git diff failed");
    }

    const commit = await this.runGit(["commit", "--no-gpg-sign", "-m", message, "--", fileName], this.eventsDir);
    return commit.success ? { success: true } : commandFailure(commit, "Git commit failed");
  }

  async fetch(remoteName: string): Promise<RemoteTransportCommandResult> {
    const result = await this.runGit(["fetch", "--prune", remoteName], this.eventsDir);
    return result.success ? { success: true } : commandFailure(result, "Git fetch failed");
  }

  async hasRemoteRef(remoteName: string, ref: string): Promise<boolean> {
    const result = await this.runGit(["rev-parse", "--verify", `refs/remotes/${remoteName}/${ref}`], this.eventsDir);
    return result.success;
  }

  async pullRebase(remoteName: string, ref: string): Promise<RemoteTransportCommandResult> {
    const result = await this.runGit(["pull", "--rebase", remoteName, ref], this.eventsDir);
    return result.success ? { success: true } : commandFailure(result, "Git pull failed");
  }

  async abortRebase(): Promise<RemoteTransportCommandResult> {
    const result = await this.runGit(["rebase", "--abort"], this.eventsDir);
    if (result.success || result.stderr.includes("No rebase in progress")) {
      return { success: true };
    }
    return commandFailure(result, "Git rebase abort failed");
  }

  async push(remoteName: string, ref: string): Promise<RemoteTransportCommandResult> {
    const result = await this.runGit(["push", "-u", remoteName, ref], this.eventsDir);
    return result.success ? { success: true } : commandFailure(result, "Git push failed");
  }
}

function commandFailure(result: GitCommandResult, fallback: string): RemoteTransportCommandResult {
  return {
    success: false,
    error: result.stderr || result.stdout || fallback,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
