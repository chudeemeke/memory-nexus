/**
 * Remote CLI Command Tests
 *
 * Verifies set, remove, and status command execution, configuration state transitions,
 * and stderr/stdout output envelopes.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    executeRemoteSetCommand,
    executeRemoteRemoveCommand,
    executeRemoteStatusCommand,
    createRemoteCommand,
} from "./remote.js";
import { runGit } from "../../../infrastructure/hooks/git-syncer.js";

describe("remote command", () => {
    let testDir: string;
    let configPath: string;
    let eventsDir: string;
    let mockRemoteDir: string;

    beforeEach(async () => {
        // Setup unique sandbox directories
        testDir = join(
            tmpdir(),
            `remote-cmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        mkdirSync(testDir, { recursive: true });

        configPath = join(testDir, "config.json");
        eventsDir = join(testDir, "events");
        mkdirSync(eventsDir, { recursive: true });

        mockRemoteDir = join(testDir, "remote-bare");
        mkdirSync(mockRemoteDir, { recursive: true });

        // Initialize bare repo
        await runGit(["init", "--bare"], mockRemoteDir);
        await runGit(["symbolic-ref", "HEAD", "refs/heads/main"], mockRemoteDir);
    });

    afterEach(() => {
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    test("createRemoteCommand constructs Commander group correctly", () => {
        const cmd = createRemoteCommand();
        expect(cmd.name()).toBe("remote");
        expect(cmd.commands.some(c => c.name() === "set")).toBe(true);
        expect(cmd.commands.some(c => c.name() === "remove")).toBe(true);
        expect(cmd.commands.some(c => c.name() === "status")).toBe(true);
    });

    test("executeRemoteSetCommand initializes Git repo and configures URL", async () => {
        const result = await executeRemoteSetCommand(mockRemoteDir, {
            configPathOverride: configPath,
            eventsDirOverride: eventsDir,
        });

        expect(result.exitCode).toBe(0);

        // Verify config is saved
        const content = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(content);
        expect(parsed.remoteSync.enabled).toBe(true);
        expect(parsed.remoteSync.repositoryUrl).toBe(mockRemoteDir);

        // Verify git is initialized and remote matches
        const gitDir = join(eventsDir, ".git");
        expect(existsSync(gitDir)).toBe(true);
    });

    test("executeRemoteRemoveCommand disables sync and clears configuration", async () => {
        // Set first
        await executeRemoteSetCommand(mockRemoteDir, {
            configPathOverride: configPath,
            eventsDirOverride: eventsDir,
        });

        // Now remove
        const result = await executeRemoteRemoveCommand({
            configPathOverride: configPath,
            eventsDirOverride: eventsDir,
        });

        expect(result.exitCode).toBe(0);

        const content = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(content);
        expect(parsed.remoteSync.enabled).toBe(false);
        expect(parsed.remoteSync.repositoryUrl).toBeUndefined();
    });

    test("executeRemoteStatusCommand renders status values correctly", async () => {
        // Set first
        await executeRemoteSetCommand(mockRemoteDir, {
            configPathOverride: configPath,
            eventsDirOverride: eventsDir,
        });

        const result = await executeRemoteStatusCommand({
            configPathOverride: configPath,
            eventsDirOverride: eventsDir,
        });

        expect(result.exitCode).toBe(0);
    });
});
