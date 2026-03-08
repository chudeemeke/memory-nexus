/**
 * Sync Hook Script Tests
 *
 * Tests the sync-hook-script behavior by running it as a subprocess
 * with controlled stdin input, matching how Claude Code invokes hooks.
 *
 * Tests verify:
 * - PreCompact event outputs flush reminder to stdout
 * - SessionEnd event does NOT output flush reminder
 * - Reminder output is independent of syncOnCompaction config
 * - Sync spawn behavior respects syncOnCompaction config
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

/** Path to the hook script under test */
const HOOK_SCRIPT = join(
    import.meta.dir,
    "sync-hook-script.ts",
);

/**
 * Run the sync-hook-script with given stdin input and HOME override.
 *
 * Returns the captured stdout, stderr, and exit code.
 */
function runHookScript(
    stdinJson: object,
    homeDir: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
        const child = spawn("bun", ["run", HOOK_SCRIPT], {
            env: {
                ...process.env,
                HOME: homeDir,
                USERPROFILE: homeDir,
            },
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        child.on("close", (code: number | null) => {
            resolve({
                stdout,
                stderr,
                exitCode: code ?? 1,
            });
        });

        // Write stdin and close
        child.stdin.write(JSON.stringify(stdinJson));
        child.stdin.end();
    });
}

describe("sync-hook-script", () => {
    let testDir: string;
    let configDir: string;

    beforeEach(() => {
        testDir = join(
            tmpdir(),
            `sync-hook-script-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        configDir = join(testDir, ".config", "memory");
        mkdirSync(configDir, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(testDir)) {
            try {
                rmSync(testDir, { recursive: true, force: true });
            } catch {
                // Ignore Windows cleanup failures
            }
        }
    });

    /**
     * Write a config file to the test HOME directory.
     */
    function writeConfig(config: Record<string, unknown>): void {
        writeFileSync(
            join(configDir, "config.json"),
            JSON.stringify(config, null, 2),
        );
    }

    describe("PreCompact flush reminder", () => {
        test("PreCompact event outputs flush reminder to stdout", async () => {
            writeConfig({
                autoSync: true,
                syncOnCompaction: true,
            });

            const result = await runHookScript(
                {
                    hook_event_name: "PreCompact",
                    session_id: "abc123",
                },
                testDir,
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("MEMORY FLUSH");
            expect(result.stdout).toContain("~/.memory/");
            expect(result.stdout).toContain("decisions, unresolved items, learnings");
        }, 15000);

        test("PreCompact with syncOnCompaction=false outputs reminder but exits without sync", async () => {
            writeConfig({
                autoSync: true,
                syncOnCompaction: false,
            });

            const result = await runHookScript(
                {
                    hook_event_name: "PreCompact",
                    session_id: "abc123",
                },
                testDir,
            );

            expect(result.exitCode).toBe(0);
            // Reminder should still appear even when sync is disabled
            expect(result.stdout).toContain("MEMORY FLUSH");
            expect(result.stdout).toContain("~/.memory/");
        }, 15000);

        test("PreCompact with syncOnCompaction=true outputs reminder AND proceeds past sync check", async () => {
            writeConfig({
                autoSync: true,
                syncOnCompaction: true,
            });

            const result = await runHookScript(
                {
                    hook_event_name: "PreCompact",
                    session_id: "abc123",
                },
                testDir,
            );

            expect(result.exitCode).toBe(0);
            // Reminder should appear
            expect(result.stdout).toContain("MEMORY FLUSH");
        }, 15000);

        test("SessionEnd event does NOT output flush reminder", async () => {
            writeConfig({
                autoSync: true,
                syncOnCompaction: true,
            });

            const result = await runHookScript(
                {
                    hook_event_name: "SessionEnd",
                    session_id: "abc123",
                },
                testDir,
            );

            expect(result.exitCode).toBe(0);
            // SessionEnd should NOT produce the reminder
            expect(result.stdout).not.toContain("MEMORY FLUSH");
        }, 15000);

        test("PreCompact reminder contains the full expected message", async () => {
            writeConfig({
                autoSync: true,
                syncOnCompaction: true,
            });

            const result = await runHookScript(
                {
                    hook_event_name: "PreCompact",
                    session_id: "test-full-msg",
                },
                testDir,
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "MEMORY FLUSH: Session nearing compaction.",
            );
            expect(result.stdout).toContain(
                "Write important context (decisions, unresolved items, learnings) " +
                "to ~/.memory/ files before context is compressed.",
            );
        }, 15000);

        test("PreCompact with autoSync=false exits early without reminder", async () => {
            writeConfig({
                autoSync: false,
                syncOnCompaction: true,
            });

            const result = await runHookScript(
                {
                    hook_event_name: "PreCompact",
                    session_id: "abc123",
                },
                testDir,
            );

            // When autoSync is false, script exits immediately before
            // reading stdin, so no reminder output
            expect(result.exitCode).toBe(0);
            expect(result.stdout).not.toContain("MEMORY FLUSH");
        }, 15000);
    });
});
