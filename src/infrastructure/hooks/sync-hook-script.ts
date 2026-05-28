#!/usr/bin/env bun
/**
 * Sync Hook Script
 *
 * Entry point for Claude Code hooks (SessionEnd, PreCompact).
 * Reads hook input from stdin, checks configuration, and spawns
 * background sync process.
 *
 * Design:
 * - Always exits 0 (never blocks Claude Code)
 * - Logs all operations for debugging
 * - Checks config before processing
 * - Graceful handling of missing session_id
 * - Hook event name tracked in logs
 *
 * Usage in settings.json:
 * ```json
 * {
 *   "hooks": {
 *     "SessionEnd": [{
 *       "hooks": [{
 *         "type": "command",
 *         "command": "bun ~/.local/share/memory/hooks/sync-hook.js",
 *         "timeout": 5
 *       }]
 *     }]
 *   }
 * }
 * ```
 */

import { loadConfig } from "./config-manager.js";
import type { MemoryConfig } from "./config-manager.js";
import { logSync } from "./log-writer.js";
import { spawnBackgroundSync } from "./hook-runner.js";

/**
 * Hook input from Claude Code
 *
 * Sent via stdin as JSON when hooks fire.
 * Fields vary by hook event type.
 */
export interface HookInput {
    /** Session identifier */
    session_id?: string;
    /** Path to session JSONL transcript */
    transcript_path?: string;
    /** Which hook event fired */
    hook_event_name: string;
    /** SessionEnd reason: "clear", "logout", "prompt_input_exit", "other" */
    reason?: string;
    /** PreCompact trigger: "manual" or "auto" */
    trigger?: string;
    /** Current working directory */
    cwd?: string;
    /** Permission mode ("default", etc.) */
    permission_mode?: string;
}

export interface SyncHookDeps {
    loadConfig: () => MemoryConfig;
    readInput: () => Promise<HookInput>;
    log: typeof logSync;
    spawnSync: typeof spawnBackgroundSync;
    writeStdout: (message: string) => void;
    exit: (code: number) => void;
}

/**
 * Read JSON from stdin
 *
 * Collects all chunks until EOF, then parses as JSON.
 * Handles errors gracefully.
 *
 * @returns Parsed hook input
 * @throws Error if stdin is empty or JSON is invalid
 */
type HookInputStream = Pick<NodeJS.ReadStream, "setEncoding" | "on">;

export async function readJsonFromStream(stream: HookInputStream): Promise<HookInput> {
    return new Promise((resolve, reject) => {
        let input = "";

        stream.setEncoding("utf-8");

        stream.on("data", (chunk) => {
            input += chunk;
        });

        stream.on("end", () => {
            if (!input.trim()) {
                reject(new Error("Empty stdin"));
                return;
            }
            try {
                const parsed = JSON.parse(input) as HookInput;
                resolve(parsed);
            } catch (err) {
                reject(new Error("Failed to parse hook input JSON"));
            }
        });

        stream.on("error", (err) => {
            reject(err);
        });
    });
}

export async function readStdinJson(): Promise<HookInput> {
    return readJsonFromStream(process.stdin);
}

export async function executeSyncHook(deps: SyncHookDeps): Promise<void> {
    const config = deps.loadConfig();

    // Check if auto-sync is enabled
    if (!config.autoSync) {
        deps.exit(0); // Disabled by config
        return;
    }

    // Read hook input from stdin
    let hookInput: HookInput;
    try {
        hookInput = await deps.readInput();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        deps.log({
            level: "error",
            message: `Failed to read hook input: ${message}`,
        });
        deps.exit(0); // Never block user
        return;
    }

    // Output flush reminder for PreCompact (before sync check)
    if (hookInput.hook_event_name === "PreCompact") {
        deps.writeStdout(
            "MEMORY FLUSH: Session nearing compaction. " +
            "Write important context (decisions, unresolved items, learnings) " +
            "to ~/.memory/ files before context is compressed."
        );
    }

    // Check if this hook type is enabled
    if (hookInput.hook_event_name === "PreCompact" && !config.syncOnCompaction) {
        deps.exit(0);
        return;
    }

    // Extract session ID
    const sessionId = hookInput.session_id;
    if (!sessionId) {
        deps.log({
            level: "warn",
            message: `No session_id in ${hookInput.hook_event_name} hook input`,
            hookEvent: hookInput.hook_event_name,
        });
        deps.exit(0); // Fail gracefully
        return;
    }

    // Spawn background sync
    deps.spawnSync(sessionId);

    deps.log({
        level: "info",
        message: `Triggered sync for session ${sessionId}`,
        sessionId,
        hookEvent: hookInput.hook_event_name,
    });

    deps.exit(0);
}

/**
 * Main entry point
 *
 * Executes the hook logic:
 * 1. Load configuration
 * 2. Check if auto-sync is enabled
 * 3. Read hook input from stdin
 * 4. Check if this hook type is enabled
 * 5. Extract and validate session_id
 * 6. Spawn background sync
 * 7. Log and exit
 */
async function main(): Promise<void> {
    await executeSyncHook({
        loadConfig,
        readInput: readStdinJson,
        log: logSync,
        spawnSync: spawnBackgroundSync,
        writeStdout: console.log,
        exit: process.exit,
    });
}

// Run only when executed directly
if (import.meta.main) {
    main().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        logSync({
            level: "error",
            message: `Hook error: ${message}`,
            error: stack,
        });
        process.exit(0); // Never block user
    });
}
