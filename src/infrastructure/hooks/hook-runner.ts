/**
 * Hook Runner
 *
 * Background process spawner for sync operations.
 * Spawns detached processes that survive parent termination.
 *
 * Also provides entity extraction for SessionStop hooks.
 *
 * Design:
 * - Detached process runs in own process group
 * - Parent can exit without waiting (unref)
 * - Output redirected to sync.log for debugging
 * - MEMORY_NEXUS_HOOK env var allows sync to detect hook invocation
 * - Entity extraction runs after session sync when hook is triggered
 */

import { spawn, type ChildProcess } from "node:child_process";
import { openSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import type { Message } from "../../domain/entities/message.js";
import { LlmExtractor, type ExtractionResult } from "../../application/services/llm-extractor.js";
import { SqliteEntityRepository } from "../database/repositories/entity-repository.js";
import { SqliteMessageRepository } from "../database/repositories/message-repository.js";
import { LogWriter } from "../config/log-writer.js";

/**
 * Options for spawnBackgroundSync
 */
export interface SpawnOptions {
    /** Override CLI command (default: "aidev") */
    command?: string;
    /** Include --quiet flag (default: true) */
    quiet?: boolean;
    /** Override log directory (for testing) */
    logDir?: string;
}

/**
 * Result of spawn operation
 */
export interface SpawnResult {
    /** Process ID of spawned child, or undefined if spawn failed */
    pid: number | undefined;
}

/**
 * Get the path to the sync log file
 *
 * @returns Path to ~/.memory-nexus/logs/sync.log
 */
export function getLogPath(): string {
    return join(homedir(), ".memory-nexus", "logs", "sync.log");
}

/**
 * Ensure the log directory exists
 *
 * Creates the directory recursively if it doesn't exist.
 * Safe to call multiple times.
 *
 * @param logDir Optional custom log directory path
 */
export function ensureLogDirectory(logDir?: string): void {
    const dir = logDir ?? join(homedir(), ".memory-nexus", "logs");
    mkdirSync(dir, { recursive: true });
}

/**
 * Spawn a background sync process for the given session
 *
 * Creates a detached child process that:
 * - Runs independently of the parent process
 * - Survives parent termination
 * - Logs output to sync.log
 *
 * The spawned command runs:
 * `aidev memory sync --session <sessionId> [--quiet]`
 *
 * Key implementation details:
 * - detached: true - Process runs in own process group
 * - stdio: Redirect stdout/stderr to log file (stdin ignored)
 * - unref() - Parent can exit without waiting
 * - MEMORY_NEXUS_HOOK=1 - Sync can detect hook invocation
 *
 * @param sessionId Session identifier to sync
 * @param options Configuration options
 * @returns Spawn result with PID (if successful)
 */
export function spawnBackgroundSync(
    sessionId: string,
    options: SpawnOptions = {}
): SpawnResult {
    const { command = "aidev", quiet = true, logDir } = options;

    // Ensure log directory exists
    const logDirPath = logDir ?? join(homedir(), ".memory-nexus", "logs");
    ensureLogDirectory(logDirPath);

    // Open log file for append (stdout and stderr)
    const logPath = join(logDirPath, "sync.log");
    const out = openSync(logPath, "a");
    const err = openSync(logPath, "a");

    // Build command arguments
    const args = ["memory", "sync", "--session", sessionId];
    if (quiet) {
        args.push("--quiet");
    }

    // Spawn detached process
    const subprocess: ChildProcess = spawn(command, args, {
        detached: true,
        stdio: ["ignore", out, err],
        env: { ...process.env, MEMORY_NEXUS_HOOK: "1" },
    });

    // Allow parent to exit without waiting for child
    subprocess.unref();

    return { pid: subprocess.pid };
}

/**
 * Result of entity extraction operation
 */
export interface EntityExtractionResult {
    /** Number of entities extracted and saved */
    entitiesExtracted: number;
    /** Whether extraction succeeded */
    success: boolean;
    /** Error message if extraction failed */
    error?: string;
    /** Session summary text (if extracted) */
    summary?: string;
}

/**
 * Options for entity extraction
 */
export interface EntityExtractionOptions {
    /** Log writer for debug output (optional) */
    logWriter?: LogWriter;
}

/**
 * Extract entities from a session using LLM.
 *
 * This function is called during SessionStop hook processing after
 * messages have been synced. It:
 * 1. Retrieves messages for the session
 * 2. Uses LlmExtractor to extract entities
 * 3. Persists entities via EntityRepository
 * 4. Links entities to the session
 *
 * LLM extraction failures are logged but don't fail the sync.
 *
 * @param sessionId Session identifier
 * @param db Database instance
 * @param options Optional configuration
 * @returns Extraction result with entity count
 */
export async function extractEntitiesFromSession(
    sessionId: string,
    db: Database,
    options: EntityExtractionOptions = {}
): Promise<EntityExtractionResult> {
    const { logWriter } = options;

    try {
        // Get messages for the session
        const messageRepo = new SqliteMessageRepository(db);
        const messages = await messageRepo.findBySession(sessionId);

        // Skip extraction if no messages
        if (messages.length === 0) {
            logWriter?.debug(`Skipping LLM extraction for ${sessionId}: no messages`);
            return {
                entitiesExtracted: 0,
                success: true,
            };
        }

        // Run LLM extraction
        const extractionResult = await LlmExtractor.extract({
            sessionId,
            messages,
        });

        // Collect all entities
        const allEntities = [
            ...extractionResult.topics,
            ...extractionResult.terms,
            ...extractionResult.decisions,
        ];

        // If no entities extracted (e.g., in unit test mode), return early
        if (allEntities.length === 0 && !extractionResult.summary) {
            logWriter?.debug(`LLM extraction returned no entities for ${sessionId}`);
            return {
                entitiesExtracted: 0,
                success: true,
                summary: extractionResult.summary || undefined,
            };
        }

        // Persist extracted entities
        const entityRepo = new SqliteEntityRepository(db);

        for (const entity of allEntities) {
            const saved = await entityRepo.save(entity);
            await entityRepo.linkToSession(saved.id!, sessionId);
        }

        logWriter?.debug(`Extracted ${allEntities.length} entities from session ${sessionId}`);

        return {
            entitiesExtracted: allEntities.length,
            success: true,
            summary: extractionResult.summary || undefined,
        };
    } catch (error) {
        // LLM extraction failure should not block sync
        const errorMessage = error instanceof Error ? error.message : String(error);
        logWriter?.warn(`LLM extraction failed for ${sessionId}: ${errorMessage}`);

        return {
            entitiesExtracted: 0,
            success: false,
            error: errorMessage,
        };
    }
}

/**
 * Check if the current process was invoked by a hook.
 *
 * The hook runner sets MEMORY_NEXUS_HOOK=1 when spawning sync processes.
 * This allows the sync command to detect hook invocation and enable
 * additional processing like LLM extraction.
 *
 * @returns true if invoked by hook, false otherwise
 */
export function isInvokedByHook(): boolean {
    return process.env.MEMORY_NEXUS_HOOK === "1";
}
