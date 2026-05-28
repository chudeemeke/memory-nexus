/**
 * Git Syncer Tests
 *
 * Verifies secure shell-less git subprocess execution, remote URL configuration,
 * and multi-writer transport replication across isolated devices.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitSyncer, runGit, type GitCommandResult, type GitSyncerDeps } from "./git-syncer.js";

function gitOk(stdout = ""): GitCommandResult {
    return { success: true, stdout, stderr: "", exitCode: 0 };
}

function gitFail(stderr = "failed"): GitCommandResult {
    return { success: false, stdout: "", stderr, exitCode: 1 };
}

function createMockSyncer(options: {
    gitResults?: GitCommandResult[];
    exists?: (path: string) => boolean;
    files?: string[][];
    read?: (path: string) => string;
    now?: Date;
} = {}): { syncer: GitSyncer; calls: string[][] } {
    const calls: string[][] = [];
    const gitResults = [...(options.gitResults ?? [])];
    const fileResults = [...(options.files ?? [[]])];
    const deps: GitSyncerDeps = {
        runGit: async (args) => {
            calls.push(args);
            return gitResults.shift() ?? gitOk();
        },
        existsSync: options.exists ?? ((path) => path.endsWith(".git")),
        getAllLogFiles: () => fileResults.shift() ?? fileResults[fileResults.length - 1] ?? [],
        readFileSync: (path) => options.read?.(path) ?? "content",
        now: () => options.now ?? new Date("2026-05-28T12:00:00.000Z"),
    };

    return { syncer: new GitSyncer("C:\\events", deps), calls };
}

async function removeDirWithRetry(path: string): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
        if (!existsSync(path)) return;
        try {
            rmSync(path, { recursive: true, force: true });
            return;
        } catch (error) {
            if (attempt === 4) throw error;
            await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        }
    }
}

describe("git-syncer", () => {
    let testDir: string;
    let mockRemoteDir: string;
    let syncer: GitSyncer;

    beforeEach(async () => {
        // Create unique sandbox directories
        testDir = join(
            tmpdir(),
            `git-syncer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        mockRemoteDir = join(
            tmpdir(),
            `git-syncer-remote-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        mkdirSync(testDir, { recursive: true });
        mkdirSync(mockRemoteDir, { recursive: true });

        // Initialize mock remote repository as bare repo
        await runGit(["init", "--bare"], mockRemoteDir);

        // Configure default branch in remote
        await runGit(["symbolic-ref", "HEAD", "refs/heads/main"], mockRemoteDir);

        syncer = new GitSyncer(testDir);
    });

    afterEach(async () => {
        await removeDirWithRetry(testDir);
        await removeDirWithRetry(mockRemoteDir);
    });

    test("isGitRepo returns false when not a repository", async () => {
        expect(await syncer.isGitRepo()).toBe(false);
    });

    test("initRepo initializes Git repository correctly", async () => {
        expect(await syncer.isGitRepo()).toBe(false);
        const ok = await syncer.initRepo();
        expect(ok).toBe(true);
        expect(await syncer.isGitRepo()).toBe(true);
    });

    test("configureRemote sets git origin remote URL correctly", async () => {
        await syncer.initRepo();
        const ok = await syncer.configureRemote(mockRemoteDir);
        expect(ok).toBe(true);
        expect(await syncer.getRemoteUrl()).toBe(mockRemoteDir);
    });

    test("sync commits, pulls, and pushes events-log correctly", async () => {
        // Init local repo
        await syncer.initRepo();
        await syncer.configureRemote(mockRemoteDir);

        // Write local event file
        writeFileSync(
            join(testDir, "events-machine1.jsonl"),
            '{"uuid":"1","type":"decision","project":"a","content":"local","observedAt":"2026-05-25T12:00:00.000Z"}\n'
        );

        // Sync first time (commits and pushes)
        const result = await syncer.sync("machine1", mockRemoteDir);
        expect(result.success).toBe(true);
        expect(result.rebuildNeeded).toBe(false); // only local changes pushed, nothing remote fetched

        // Now setup another clone representing a different device (Device 2)
        const device2Dir = join(
            tmpdir(),
            `git-syncer-dev2-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        mkdirSync(device2Dir, { recursive: true });
        
        try {
            const syncer2 = new GitSyncer(device2Dir);
            await syncer2.initRepo();
            await syncer2.configureRemote(mockRemoteDir);

            // Pull changes to Device 2
            const result2 = await syncer2.sync("machine2", mockRemoteDir);
            expect(result2.success).toBe(true);
            expect(result2.rebuildNeeded).toBe(true); // pulled machine1's log!

            // Device 2 writes its own events
            writeFileSync(
                join(device2Dir, "events-machine2.jsonl"),
                '{"uuid":"2","type":"learning","project":"b","content":"device2","observedAt":"2026-05-25T13:00:00.000Z"}\n'
            );

            // Sync Device 2
            const result3 = await syncer2.sync("machine2", mockRemoteDir);
            expect(result3.success).toBe(true);

            // Now sync Device 1 again
            const result4 = await syncer.sync("machine1", mockRemoteDir);
            expect(result4.success).toBe(true);
            expect(result4.rebuildNeeded).toBe(true); // Device 1 pulled Device 2's log!

        } finally {
            await removeDirWithRetry(device2Dir);
        }
    }, 90000);
});

describe("git-syncer dependency seams", () => {
    test("initRepo returns false when git init fails", async () => {
        const { syncer, calls } = createMockSyncer({
            gitResults: [gitFail("init failed")],
        });

        await expect(syncer.initRepo()).resolves.toBe(false);
        expect(calls).toEqual([["init"]]);
    });

    test("initRepo skips local user configuration when user.name already exists", async () => {
        const { syncer, calls } = createMockSyncer({
            gitResults: [gitOk(), gitOk("Chude"), gitOk()],
        });

        await expect(syncer.initRepo()).resolves.toBe(true);
        expect(calls).toEqual([
            ["init"],
            ["config", "user.name"],
            ["checkout", "-b", "main"],
        ]);
    });

    test("configureRemote rejects blank remote URLs", async () => {
        const { syncer, calls } = createMockSyncer();

        await expect(syncer.configureRemote("   ")).resolves.toBe(false);
        expect(calls).toEqual([]);
    });

    test("removeRemote treats missing origin as already removed", async () => {
        const { syncer } = createMockSyncer({
            gitResults: [gitFail("No such remote: 'origin'")],
        });

        await expect(syncer.removeRemote()).resolves.toBe(true);
    });

    test("getRemoteUrl returns null when origin is not configured", async () => {
        const { syncer } = createMockSyncer({
            gitResults: [gitFail("missing")],
        });

        await expect(syncer.getRemoteUrl()).resolves.toBeNull();
    });

    test("sync reports init failure when events directory is not a git repo", async () => {
        const { syncer } = createMockSyncer({
            exists: () => false,
            gitResults: [gitFail("init failed")],
        });

        const result = await syncer.sync("machine1", "git@example/repo.git");

        expect(result).toEqual({
            success: false,
            rebuildNeeded: false,
            error: "Failed to initialize Git repository in events directory",
        });
    });

    test("sync reports remote configuration failure", async () => {
        const { syncer, calls } = createMockSyncer({
            gitResults: [
                gitOk("git@example/old.git"),
                gitOk(),
                gitFail("remote add failed"),
            ],
        });

        const result = await syncer.sync("machine1", "git@example/new.git");

        expect(result).toEqual({
            success: false,
            rebuildNeeded: false,
            error: "Failed to configure Git remote repository URL",
        });
        expect(calls).toEqual([
            ["remote", "get-url", "origin"],
            ["remote", "remove", "origin"],
            ["remote", "add", "origin", "git@example/new.git"],
        ]);
    });

    test("sync skips pull and push when both automation flags are disabled", async () => {
        const { syncer, calls } = createMockSyncer({
            exists: (path) => path.endsWith(".git"),
            gitResults: [gitOk("git@example/repo.git")],
            files: [["C:\\events\\events-machine1.jsonl"], ["C:\\events\\events-machine1.jsonl"]],
        });

        const result = await syncer.sync("machine1", "git@example/repo.git", false, false);

        expect(result).toEqual({ success: true, rebuildNeeded: false });
        expect(calls).toEqual([["remote", "get-url", "origin"]]);
    });

    test("sync fetches but skips pull when origin main does not exist yet", async () => {
        const { syncer, calls } = createMockSyncer({
            exists: (path) => path.endsWith(".git"),
            gitResults: [
                gitOk("git@example/repo.git"),
                gitOk(),
                gitFail("missing origin/main"),
                gitOk(),
            ],
        });

        const result = await syncer.sync("machine1", "git@example/repo.git");

        expect(result).toEqual({ success: true, rebuildNeeded: false });
        expect(calls).toContainEqual(["fetch", "origin"]);
        expect(calls).toContainEqual(["rev-parse", "--verify", "origin/main"]);
        expect(calls).not.toContainEqual(["pull", "--rebase", "origin", "main"]);
    });

    test("sync aborts rebase and reports pull failures", async () => {
        const { syncer, calls } = createMockSyncer({
            exists: (path) => path.endsWith(".git"),
            gitResults: [
                gitOk("git@example/repo.git"),
                gitOk(),
                gitOk("origin/main"),
                gitFail("conflict"),
                gitOk(),
            ],
        });

        const result = await syncer.sync("machine1", "git@example/repo.git");

        expect(result).toEqual({
            success: false,
            rebuildNeeded: false,
            error: "Git pull failed: conflict",
        });
        expect(calls).toContainEqual(["rebase", "--abort"]);
    });

    test("sync reports push failures", async () => {
        const { syncer } = createMockSyncer({
            exists: (path) => path.endsWith(".git"),
            gitResults: [
                gitOk("git@example/repo.git"),
                gitOk(),
                gitFail("missing origin/main"),
                gitFail("push rejected"),
            ],
        });

        const result = await syncer.sync("machine1", "git@example/repo.git");

        expect(result).toEqual({
            success: false,
            rebuildNeeded: false,
            error: "Git push failed: push rejected",
        });
    });

    test("sync marks rebuild needed when remote adds log files", async () => {
        const { syncer } = createMockSyncer({
            exists: (path) => path.endsWith(".git"),
            gitResults: [gitOk("git@example/repo.git")],
            files: [["C:\\events\\events-machine1.jsonl"], ["C:\\events\\events-machine1.jsonl", "C:\\events\\events-machine2.jsonl"]],
        });

        const result = await syncer.sync("machine1", "git@example/repo.git", false, false);

        expect(result).toEqual({ success: true, rebuildNeeded: true });
    });

    test("sync marks rebuild needed when log file content changes", async () => {
        let readCount = 0;
        const { syncer } = createMockSyncer({
            exists: (path) => path.endsWith(".git") || path.endsWith(".jsonl"),
            gitResults: [gitOk("git@example/repo.git")],
            files: [["C:\\events\\events-machine1.jsonl"], ["C:\\events\\events-machine1.jsonl"]],
            read: () => readCount++ === 0 ? "before" : "after",
        });

        const result = await syncer.sync("machine1", "git@example/repo.git", false, false);

        expect(result).toEqual({ success: true, rebuildNeeded: true });
    });

    test("sync reports thrown transport errors without leaking exceptions", async () => {
        const deps: GitSyncerDeps = {
            existsSync: () => true,
            runGit: async () => {
                throw new Error("transport exploded");
            },
            getAllLogFiles: () => [],
            readFileSync: () => "",
            now: () => new Date("2026-05-28T12:00:00.000Z"),
        };
        const syncer = new GitSyncer("C:\\events", deps);

        const result = await syncer.sync("machine1", "git@example/repo.git");

        expect(result).toEqual({
            success: false,
            rebuildNeeded: false,
            error: "transport exploded",
        });
    });
});
