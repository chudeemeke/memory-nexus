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
 *         "command": "bun ~/.memory-nexus/hooks/sync-hook.js",
 *         "timeout": 5
 *       }]
 *     }]
 *   }
 * }
 * ```
 */

import { loadConfig } from "./config-manager.js";
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

/**
 * Read JSON from stdin
 *
 * Collects all chunks until EOF, then parses as JSON.
 * Handles errors gracefully.
 *
 * @returns Parsed hook input
 * @throws Error if stdin is empty or JSON is invalid
 */
export async function readStdinJson(): Promise<HookInput> {
    return new Promise((resolve, reject) => {
        let input = "";

        process.stdin.setEncoding("utf-8");

        process.stdin.on("data", (chunk) => {
            input += chunk;
        });

        process.stdin.on("end", () => {
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

        process.stdin.on("error", (err) => {
            reject(err);
        });
    });
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
    const config = loadConfig();

    // Check if auto-sync is enabled
    if (!config.autoSync) {
        process.exit(0); // Disabled by config
    }

    // Read hook input from stdin
    let hookInput: HookInput;
    try {
        hookInput = await readStdinJson();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logSync({
            level: "error",
            message: `Failed to read hook input: ${message}`,
        });
        process.exit(0); // Never block user
    }

    // Check if this hook type is enabled
    if (hookInput.hook_event_name === "PreCompact" && !config.syncOnCompaction) {
        process.exit(0);
    }

    // Extract session ID
    const sessionId = hookInput.session_id;
    if (!sessionId) {
        logSync({
            level: "warn",
            message: `No session_id in ${hookInput.hook_event_name} hook input`,
            hookEvent: hookInput.hook_event_name,
        });
        process.exit(0); // Fail gracefully
    }

    // Spawn background sync
    const result = spawnBackgroundSync(sessionId);

    logSync({
        level: "info",
        message: `Triggered sync for session ${sessionId}`,
        sessionId,
        hookEvent: hookInput.hook_event_name,
    });

    process.exit(0);
}

// Run
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
