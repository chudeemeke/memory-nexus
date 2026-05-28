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
import { EventEmitter } from "node:events";
import { DEFAULT_CONFIG } from "./config-manager.js";
import { executeSyncHook, readJsonFromStream, type HookInput } from "./sync-hook-script.js";

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

    describe("readJsonFromStream", () => {
        function createStream(): EventEmitter & {
            encoding?: BufferEncoding;
            setEncoding: (encoding: BufferEncoding) => void;
        } {
            const stream = new EventEmitter() as EventEmitter & {
                encoding?: BufferEncoding;
                setEncoding: (encoding: BufferEncoding) => void;
            };
            stream.setEncoding = (encoding) => {
                stream.encoding = encoding;
            };
            return stream;
        }

        test("parses hook input JSON from multiple chunks", async () => {
            const stream = createStream();
            const parsed = readJsonFromStream(stream);

            stream.emit("data", "{\"hook_event_name\":\"SessionEnd\",");
            stream.emit("data", "\"session_id\":\"session-abc\"}");
            stream.emit("end");

            await expect(parsed).resolves.toEqual({
                hook_event_name: "SessionEnd",
                session_id: "session-abc",
            });
            expect(stream.encoding).toBe("utf-8");
        });

        test("rejects empty hook input", async () => {
            const stream = createStream();
            const parsed = readJsonFromStream(stream);

            stream.emit("data", "  ");
            stream.emit("end");

            await expect(parsed).rejects.toThrow("Empty stdin");
        });

        test("rejects invalid hook input JSON with a stable error", async () => {
            const stream = createStream();
            const parsed = readJsonFromStream(stream);

            stream.emit("data", "{not json");
            stream.emit("end");

            await expect(parsed).rejects.toThrow("Failed to parse hook input JSON");
        });

        test("propagates stream read errors", async () => {
            const stream = createStream();
            const parsed = readJsonFromStream(stream);

            stream.emit("error", new Error("stdin failed"));

            await expect(parsed).rejects.toThrow("stdin failed");
        });
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

    describe("executeSyncHook", () => {
        function runInProcess(
            input: HookInput | Error,
            config: Partial<typeof DEFAULT_CONFIG> = {},
        ): Promise<{
            exits: number[];
            logs: Array<Record<string, unknown>>;
            spawns: string[];
            stdout: string[];
        }> {
            const exits: number[] = [];
            const logs: Array<Record<string, unknown>> = [];
            const spawns: string[] = [];
            const stdout: string[] = [];

            return executeSyncHook({
                loadConfig: () => ({ ...DEFAULT_CONFIG, ...config }),
                readInput: async () => {
                    if (input instanceof Error) {
                        throw input;
                    }
                    return input;
                },
                log: (entry) => {
                    logs.push(entry as unknown as Record<string, unknown>);
                },
                spawnSync: (sessionId) => {
                    spawns.push(sessionId);
                },
                writeStdout: (message) => {
                    stdout.push(message);
                },
                exit: (code) => {
                    exits.push(code);
                },
            }).then(() => ({ exits, logs, spawns, stdout }));
        }

        test("exits without reading input when auto sync is disabled", async () => {
            const result = await runInProcess(
                new Error("input should not be read"),
                { autoSync: false },
            );

            expect(result.exits).toEqual([0]);
            expect(result.logs).toEqual([]);
            expect(result.spawns).toEqual([]);
            expect(result.stdout).toEqual([]);
        });

        test("logs read failures and exits successfully so hooks never block Claude Code", async () => {
            const result = await runInProcess(new Error("bad json"));

            expect(result.exits).toEqual([0]);
            expect(result.logs).toEqual([
                {
                    level: "error",
                    message: "Failed to read hook input: bad json",
                },
            ]);
            expect(result.spawns).toEqual([]);
        });

        test("prints PreCompact reminder before honoring disabled compaction sync", async () => {
            const result = await runInProcess(
                { hook_event_name: "PreCompact", session_id: "session-1" },
                { syncOnCompaction: false },
            );

            expect(result.exits).toEqual([0]);
            expect(result.stdout.join("\n")).toContain("MEMORY FLUSH");
            expect(result.spawns).toEqual([]);
            expect(result.logs).toEqual([]);
        });

        test("warns and exits when hook input has no session id", async () => {
            const result = await runInProcess({ hook_event_name: "SessionEnd" });

            expect(result.exits).toEqual([0]);
            expect(result.spawns).toEqual([]);
            expect(result.logs).toEqual([
                {
                    level: "warn",
                    message: "No session_id in SessionEnd hook input",
                    hookEvent: "SessionEnd",
                },
            ]);
        });

        test("spawns background sync and logs success for valid hook input", async () => {
            const result = await runInProcess({
                hook_event_name: "SessionEnd",
                session_id: "session-123",
            });

            expect(result.exits).toEqual([0]);
            expect(result.spawns).toEqual(["session-123"]);
            expect(result.logs).toEqual([
                {
                    level: "info",
                    message: "Triggered sync for session session-123",
                    sessionId: "session-123",
                    hookEvent: "SessionEnd",
                },
            ]);
        });
    });
});
