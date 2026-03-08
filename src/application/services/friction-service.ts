/**
 * FrictionService
 *
 * Application service for friction logging operations.
 * Orchestrates business rules around friction entries using
 * constructor-injected IFrictionRepository.
 *
 * Business rules enforced here (not in entity or repository):
 * - Default severity/category when logging
 * - Entry existence validation before resolve/wontFix
 * - Status guard: cannot resolve/wontFix already-closed entries
 * - wontFix flow: resolve() then updateStatus() for correct final state
 */

import type {
    IFrictionRepository,
    FrictionStats,
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
    context?: string;
    sourceProject?: string;
}

/**
 * Options for listing friction entries.
 */
export interface ListFrictionOptions {
    all?: boolean;
    status?: string;
    category?: string;
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
     * Creates a FrictionEntry with status "open", loggedAt = now,
     * severity defaults to "medium", category defaults to "cli".
     *
     * @param params Friction entry parameters
     * @returns The saved entry with database id
     */
    async log(params: LogFrictionParams): Promise<FrictionEntry> {
        const entry = FrictionEntry.create({
            description: params.description,
            severity: params.severity ?? "medium",
            category: params.category ?? "cli",
            status: "open",
            context: params.context,
            sourceProject: params.sourceProject,
            loggedAt: new Date(),
        });

        return this.repository.save(entry);
    }

    /**
     * List friction entries.
     *
     * By default returns only open entries. Pass `all: true` to include
     * resolved and wont-fix entries. Optional status/category/limit filters.
     *
     * @param options Listing options
     * @returns Array of matching friction entries
     */
    async list(options?: ListFrictionOptions): Promise<FrictionEntry[]> {
        if (options?.all) {
            return this.repository.findAll({
                status: options.status as FrictionEntry["status"] | undefined,
                category: options.category as FrictionEntry["category"] | undefined,
                limit: options.limit,
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
}
