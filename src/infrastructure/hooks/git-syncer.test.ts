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
import { GitSyncer, runGit } from "./git-syncer.js";

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
    }, 45000);
});
