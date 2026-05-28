/**
 * Git Syncer Hook
 *
 * Secure, shell-less transport manager utilizing Bun's subprocess spawner
 * to synchronize machine-specific log files via a private Git repository
 * without user credential storage.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "bun";
import { getEventsDir, getAllLogFiles } from "../paths.js";

export interface SyncResult {
    success: boolean;
    rebuildNeeded: boolean;
    error?: string;
}

export interface GitCommandResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
}

export interface GitSyncerDeps {
    runGit?: (args: string[], cwd: string) => Promise<GitCommandResult>;
    existsSync?: (path: string) => boolean;
    readFileSync?: (path: string, encoding: BufferEncoding) => string;
    getAllLogFiles?: (eventsDir?: string) => string[];
    now?: () => Date;
}

const ORIGINAL_ENV = { ...process.env };

/**
 * Runs a git command securely using Bun's shell-less spawner.
 */
export async function runGit(args: string[], cwd: string): Promise<GitCommandResult> {
    const proc = spawn(["git", ...args], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: ORIGINAL_ENV,
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

/**
 * Computes simple hashes of all log files to detect changes.
 */
function getLogFilesState(
    files: string[],
    deps: Required<Pick<GitSyncerDeps, "existsSync" | "readFileSync">>,
): Record<string, string> {
    const state: Record<string, string> = {};
    for (const file of files) {
        if (deps.existsSync(file)) {
            try {
                const content = deps.readFileSync(file, "utf-8");
                state[file] = Bun.hash(content).toString();
            } catch {
                state[file] = "error";
            }
        }
    }
    return state;
}

/**
 * GitSyncer infrastructure hook.
 * Encapsulates Git transport operations for Multi-Device synchronization.
 */
export class GitSyncer {
    private readonly eventsDir: string;
    private readonly deps: Required<GitSyncerDeps>;

    constructor(eventsDir?: string, deps: GitSyncerDeps = {}) {
        this.eventsDir = eventsDir ?? getEventsDir();
        this.deps = {
            runGit,
            existsSync,
            readFileSync,
            getAllLogFiles,
            now: () => new Date(),
            ...deps,
        };
    }

    async isGitRepo(): Promise<boolean> {
        const gitDir = join(this.eventsDir, ".git");
        return this.deps.existsSync(gitDir);
    }

    async initRepo(): Promise<boolean> {
        const result = await this.deps.runGit(["init"], this.eventsDir);
        if (!result.success) return false;
        
        // Configure local git user if none exists (prevents commits from failing in sandbox/CI environments)
        const hasUser = await this.deps.runGit(["config", "user.name"], this.eventsDir);
        if (!hasUser.success || !hasUser.stdout) {
            await this.deps.runGit(["config", "user.name", "Memory Nexus"], this.eventsDir);
            await this.deps.runGit(["config", "user.email", "sync@memory-nexus.local"], this.eventsDir);
        }

        // Set default branch to main
        await this.deps.runGit(["checkout", "-b", "main"], this.eventsDir);

        return true;
    }

    async configureRemote(remoteUrl: string): Promise<boolean> {
        if (!remoteUrl.trim()) {
            return false;
        }

        // Remove origin if it already exists
        await this.deps.runGit(["remote", "remove", "origin"], this.eventsDir);
        const result = await this.deps.runGit(["remote", "add", "origin", remoteUrl], this.eventsDir);
        return result.success;
    }

    async removeRemote(): Promise<boolean> {
        const result = await this.deps.runGit(["remote", "remove", "origin"], this.eventsDir);
        return result.success || result.stderr.includes("No such remote");
    }

    async getRemoteUrl(): Promise<string | null> {
        const result = await this.deps.runGit(["remote", "get-url", "origin"], this.eventsDir);
        return result.success ? result.stdout : null;
    }

    async sync(machineId: string, remoteUrl: string, autoPull = true, autoPush = true): Promise<SyncResult> {
        try {
            // 1. Ensure git repo exists
            const isRepo = await this.isGitRepo();
            if (!isRepo) {
                const initOk = await this.initRepo();
                if (!initOk) {
                    return { success: false, rebuildNeeded: false, error: "Failed to initialize Git repository in events directory" };
                }
            }

            // 2. Ensure remote is configured correctly
            const currentRemote = await this.getRemoteUrl();
            if (currentRemote !== remoteUrl) {
                const remoteOk = await this.configureRemote(remoteUrl);
                if (!remoteOk) {
                    return { success: false, rebuildNeeded: false, error: "Failed to configure Git remote repository URL" };
                }
            }

            // Record initial state of all log files
            const initialFiles = this.deps.getAllLogFiles(this.eventsDir);
            const initialState = getLogFilesState(initialFiles, this.deps);

            // 3. Stage and commit local machine's log file
            const localLogName = `events-${machineId}.jsonl`;
            const localLogPath = join(this.eventsDir, localLogName);
            
            if (this.deps.existsSync(localLogPath)) {
                await this.deps.runGit(["add", localLogName], this.eventsDir);
                // Commit (ignore exit code since it might have no changes)
                await this.deps.runGit(["commit", "-m", `sync: ${machineId} observed at ${this.deps.now().toISOString()}`], this.eventsDir);
            }

            let pullSuccess = true;
            // 4. Pull remote changes (rebase to keep linear history)
            if (autoPull) {
                // Fetch first to see what's on the remote
                await this.deps.runGit(["fetch", "origin"], this.eventsDir);
                
                // Check if origin/main remote branch exists
                const remoteBranchExists = await this.deps.runGit(["rev-parse", "--verify", "origin/main"], this.eventsDir);
                
                if (remoteBranchExists.success) {
                    const pullResult = await this.deps.runGit(["pull", "--rebase", "origin", "main"], this.eventsDir);
                    if (!pullResult.success) {
                        pullSuccess = false;
                        // Rebasing might leave git in a conflict state.
                        // Since multiple devices ONLY write to their own events-<machineId>.jsonl,
                        // conflicts should be 0%. But if a rebase failure happens (e.g. user manually changed something),
                        // abort the rebase to leave the worktree clean.
                        await this.deps.runGit(["rebase", "--abort"], this.eventsDir);
                        return {
                            success: false,
                            rebuildNeeded: false,
                            error: `Git pull failed: ${pullResult.stderr}`,
                        };
                    }
                }
            }


            // 5. Push local changes
            if (autoPush && pullSuccess) {
                const pushResult = await this.deps.runGit(["push", "-u", "origin", "main"], this.eventsDir);
                if (!pushResult.success) {
                    return {
                        success: false,
                        rebuildNeeded: false,
                        error: `Git push failed: ${pushResult.stderr}`,
                    };
                }
            }

            // Record post-sync state of all log files
            const finalFiles = this.deps.getAllLogFiles(this.eventsDir);
            const finalState = getLogFilesState(finalFiles, this.deps);

            // Detect if anything changed or if new files appeared
            let rebuildNeeded = false;
            if (initialFiles.length !== finalFiles.length) {
                rebuildNeeded = true;
            } else {
                for (const file of finalFiles) {
                    if (initialState[file] !== finalState[file]) {
                        rebuildNeeded = true;
                        break;
                    }
                }
            }

            return {
                success: true,
                rebuildNeeded,
            };
        } catch (err: any) {
            return {
                success: false,
                rebuildNeeded: false,
                error: err?.message || String(err),
            };
        }
    }
}
