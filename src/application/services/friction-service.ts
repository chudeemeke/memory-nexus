/**
 * FrictionService
 *
 * Application service for friction logging operations.
 * Orchestrates business rules around friction entries using
 * constructor-injected IFrictionRepository.
 *
 * Business rules enforced here (not in entity or repository):
 * - Default severity/category/tool when logging
 * - Entry existence validation before resolve/wontFix
 * - Status guard: cannot resolve/wontFix already-closed entries
 * - wontFix flow: resolve() then updateStatus() for correct final state
 * - Auto-ingest: reads friction.jsonl fallback file, saves entries, deletes file
 */

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import type {
    IFrictionRepository,
    FrictionStats,
    FrictionPattern,
} from "../../domain/ports/repositories.js";
import {
    FrictionEntry,
    type FrictionSeverity,
    type FrictionCategory,
} from "../../domain/entities/friction-entry.js";
import { ErrorCode, MemoryError } from "../../domain/errors/index.js";

/**
 * Parameters for logging a new friction entry.
 */
export interface LogFrictionParams {
    description: string;
    severity?: FrictionSeverity;
    category?: FrictionCategory;
    tool?: string;
    context?: string;
    sourceProject?: string;
    loggedAt?: Date;
}

/**
 * Options for listing friction entries.
 */
export interface ListFrictionOptions {
    all?: boolean;
    status?: string;
    category?: string;
    tool?: string;
    sourceProject?: string;
    limit?: number;
}

/**
 * Application service for friction logging operations.
 *
 * Constructor-injected IFrictionRepository for hexagonal architecture.
 * Enforces business rules: defaults, validation, state transitions.
 */
export class FrictionService {
    constructor(private readonly repository: IFrictionRepository) {}

    /**
     * Log a new friction entry.
     *
     * Creates a FrictionEntry with status "open", loggedAt = now (or provided),
     * severity defaults to "medium", category defaults to "cli", tool defaults to "memory".
     *
     * @param params Friction entry parameters
     * @returns The saved entry with database id
     */
    async log(params: LogFrictionParams): Promise<FrictionEntry> {
        const entry = FrictionEntry.create({
            description: params.description,
            severity: params.severity ?? "medium",
            category: params.category ?? "cli",
            tool: params.tool ?? "memory",
            status: "open",
            context: params.context,
            sourceProject: params.sourceProject,
            loggedAt: params.loggedAt ?? new Date(),
        });

        return this.repository.save(entry);
    }

    /**
     * List friction entries.
     *
     * By default returns only open entries. Pass `all: true` to include
     * resolved and wont-fix entries. Optional status/category/tool/sourceProject/limit filters.
     *
     * @param options Listing options
     * @returns Array of matching friction entries
     */
    async list(options?: ListFrictionOptions): Promise<FrictionEntry[]> {
        // Use findAll when any filter is specified (tool, category, sourceProject)
        // or when explicitly requesting all statuses
        if (options?.all || options?.tool || options?.category || options?.sourceProject) {
            return this.repository.findAll({
                status: options?.all
                    ? (options.status as FrictionEntry["status"] | undefined)
                    : "open",
                category: options?.category as FrictionEntry["category"] | undefined,
                tool: options?.tool,
                sourceProject: options?.sourceProject,
                limit: options?.limit,
            });
        }

        return this.repository.findOpen();
    }

    /**
     * Resolve a friction entry.
     *
     * Validates:
     * 1. Entry exists (throws NOT_FOUND if missing)
     * 2. Entry is open (throws INVALID_STATE if already resolved/wont-fix)
     *
     * @param id Friction entry database ID
     * @param resolution How the friction was resolved
     * @throws MemoryError with NOT_FOUND if entry doesn't exist
     * @throws MemoryError with INVALID_STATE if entry already closed
     */
    async resolve(id: number, resolution: string): Promise<void> {
        const entry = await this.repository.findById(id);

        if (!entry) {
            throw new MemoryError(
                ErrorCode.NOT_FOUND,
                `Friction entry #${id} not found`,
                { id }
            );
        }

        if (entry.status !== "open") {
            throw new MemoryError(
                ErrorCode.INVALID_STATE,
                `Friction entry #${id} is already ${entry.status}`,
                { id, currentStatus: entry.status }
            );
        }

        await this.repository.resolve(id, resolution);
    }

    /**
     * Mark a friction entry as won't fix.
     *
     * Same validation as resolve(). Implements the wont-fix flow:
     * 1. Call resolve() to set resolution text and resolved_at timestamp
     * 2. Call updateStatus() to overwrite status from "resolved" to "wont-fix"
     *
     * @param id Friction entry database ID
     * @param resolution Why it won't be fixed
     * @throws MemoryError with NOT_FOUND if entry doesn't exist
     * @throws MemoryError with INVALID_STATE if entry already closed
     */
    async wontFix(id: number, resolution: string): Promise<void> {
        const entry = await this.repository.findById(id);

        if (!entry) {
            throw new MemoryError(
                ErrorCode.NOT_FOUND,
                `Friction entry #${id} not found`,
                { id }
            );
        }

        if (entry.status !== "open") {
            throw new MemoryError(
                ErrorCode.INVALID_STATE,
                `Friction entry #${id} is already ${entry.status}`,
                { id, currentStatus: entry.status }
            );
        }

        // resolve() sets status='resolved', resolution, resolved_at
        // updateStatus() overwrites status to 'wont-fix'
        // Net result: status=wont-fix, resolved_at=set, resolution=set
        await this.repository.resolve(id, resolution);
        await this.repository.updateStatus(id, "wont-fix");
    }

    /**
     * Get friction statistics.
     *
     * @returns Aggregated friction stats
     */
    async getStats(): Promise<FrictionStats> {
        return this.repository.getStats();
    }

    /**
     * Get weekly trends for friction entries.
     *
     * @param weeks Number of weeks to include (default 4)
     * @returns Array of weekly new/resolved counts
     */
    async getWeeklyTrends(
        weeks: number = 4
    ): Promise<Array<{ week: string; newCount: number; resolvedCount: number }>> {
        return this.repository.getWeeklyTrends(weeks);
    }

    /**
     * Ingest friction entries from a fallback JSONL file.
     *
     * Reads each line as JSON, maps fields to LogFrictionParams, saves via log(),
     * then deletes the file. Malformed lines are skipped with a warning to stderr.
     *
     * Field mapping from fallback format:
     * - project -> sourceProject
     * - date -> loggedAt (as Date)
     * - tool defaults to "unknown" if missing
     * - category defaults to "cli" if missing
     *
     * @param fallbackPath Path to the friction.jsonl file
     * @returns Number of entries successfully ingested
     */
    async ingestFallbackFile(fallbackPath: string): Promise<number> {
        if (!existsSync(fallbackPath)) return 0;

        const content = readFileSync(fallbackPath, "utf-8");
        const lines = content.split("\n").filter(Boolean);
        let count = 0;

        for (const line of lines) {
            try {
                const raw = JSON.parse(line);
                await this.log({
                    description: raw.description,
                    severity: raw.severity ?? "medium",
                    category: raw.category ?? "cli",
                    tool: raw.tool ?? "unknown",
                    context: raw.context,
                    sourceProject: raw.project,
                    loggedAt: raw.date
                        ? new Date(raw.date + "T00:00:00Z")
                        : new Date(),
                });
                count++;
            } catch {
                process.stderr.write(
                    `Warning: skipping malformed friction entry in ${fallbackPath}\n`
                );
            }
        }

        try {
            unlinkSync(fallbackPath);
        } catch {
            process.stderr.write(
                `Warning: could not delete ${fallbackPath} (entries already ingested)\n`
            );
        }

        return count;
    }

    /**
     * Detect recurring friction patterns above a threshold count.
     *
     * @param threshold Minimum entry count to qualify as a pattern (default 3)
     * @returns Array of patterns grouped by tool and category
     */
    async detectPatterns(threshold: number = 3): Promise<FrictionPattern[]> {
        return this.repository.findPatterns(threshold);
    }

    /**
     * Mark all entries for a tool as reviewed at the current time.
     *
     * @param tool The tool name to mark as reviewed
     */
    async markReviewed(tool: string): Promise<void> {
        await this.repository.markReviewed(tool, new Date());
    }

    /**
     * Delete friction entries whose description matches a pattern.
     * Uses SQL LIKE matching (% for wildcard).
     * @param pattern Description pattern to match
     * @returns Number of entries deleted
     */
    async purge(pattern: string): Promise<number> {
        return this.repository.deleteByPattern(pattern);
    }
}
