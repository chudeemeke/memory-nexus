/**
 * FrictionEntry Entity
 *
 * Represents a logged friction point with a tool.
 * Friction entries track tool-specific issues (search failures,
 * unhelpful output, missing features, workarounds needed) for
 * self-improvement feedback loops.
 *
 * Entity properties:
 * - Has identity (id when persisted)
 * - Immutable after construction
 * - Validated on creation via static create()
 */

/**
 * Severity levels for friction entries.
 */
export type FrictionSeverity = "low" | "medium" | "high" | "critical";

/**
 * Categories of friction. Any non-empty string is valid.
 */
export type FrictionCategory = string;

/**
 * Common friction categories. Not enforced -- any non-empty string is valid.
 */
export const COMMON_CATEGORIES = ["search", "sync", "cli", "context", "integration", "ux"] as const;

/**
 * Lifecycle status of a friction entry.
 */
export type FrictionStatus = "open" | "resolved" | "wont-fix";

const VALID_SEVERITIES: readonly FrictionSeverity[] = [
    "low",
    "medium",
    "high",
    "critical",
];

const VALID_STATUSES: readonly FrictionStatus[] = [
    "open",
    "resolved",
    "wont-fix",
];

interface FrictionEntryParams {
    id?: number | undefined;
    description: string;
    severity: FrictionSeverity;
    category: FrictionCategory;
    status: FrictionStatus;
    tool: string;
    tags?: string[] | undefined;
    lastReviewedAt?: Date | undefined;
    context?: string | undefined;
    sourceProject?: string | undefined;
    loggedAt: Date;
    resolvedAt?: Date | undefined;
    resolution?: string | undefined;
}

export class FrictionEntry {
    private readonly _id?: number | undefined;
    private readonly _description: string;
    private readonly _severity: FrictionSeverity;
    private readonly _category: FrictionCategory;
    private readonly _status: FrictionStatus;
    private readonly _tool: string;
    private readonly _tags?: string[] | undefined;
    private readonly _lastReviewedAt?: Date | undefined;
    private readonly _context?: string | undefined;
    private readonly _sourceProject?: string | undefined;
    private readonly _loggedAt: Date;
    private readonly _resolvedAt?: Date | undefined;
    private readonly _resolution?: string | undefined;

    private constructor(params: FrictionEntryParams) {
        this._id = params.id;
        this._description = params.description.trim();
        this._severity = params.severity;
        this._category = params.category;
        this._status = params.status;
        this._tool = params.tool;
        this._tags = params.tags ? [...params.tags] : undefined;
        this._lastReviewedAt = params.lastReviewedAt
            ? new Date(params.lastReviewedAt.getTime())
            : undefined;
        this._context = params.context;
        this._sourceProject = params.sourceProject;
        this._loggedAt = new Date(params.loggedAt.getTime());
        this._resolvedAt = params.resolvedAt
            ? new Date(params.resolvedAt.getTime())
            : undefined;
        this._resolution = params.resolution;
    }

    /**
     * Create a FrictionEntry entity.
     * @throws Error if description is empty or whitespace-only
     * @throws Error if severity is not a valid FrictionSeverity
     * @throws Error if category is empty or whitespace-only
     * @throws Error if status is not a valid FrictionStatus
     * @throws Error if tool is empty or whitespace-only
     * @throws Error if status is "open" but resolvedAt is provided
     */
    static create(params: FrictionEntryParams): FrictionEntry {
        if (!params.description || params.description.trim() === "") {
            throw new Error("Description cannot be empty");
        }

        if (!VALID_SEVERITIES.includes(params.severity)) {
            throw new Error(
                `Invalid severity: "${params.severity}". Must be one of: ${VALID_SEVERITIES.join(", ")}`
            );
        }

        if (!params.category || params.category.trim() === "") {
            throw new Error("Category cannot be empty");
        }

        if (!VALID_STATUSES.includes(params.status)) {
            throw new Error(
                `Invalid status: "${params.status}". Must be one of: ${VALID_STATUSES.join(", ")}`
            );
        }

        if (!params.tool || params.tool.trim() === "") {
            throw new Error("Tool cannot be empty");
        }

        if (params.status === "open" && params.resolvedAt) {
            throw new Error("Open entries cannot have a resolvedAt date");
        }

        return new FrictionEntry(params);
    }

    get id(): number | undefined {
        return this._id;
    }

    get description(): string {
        return this._description;
    }

    get severity(): FrictionSeverity {
        return this._severity;
    }

    get category(): FrictionCategory {
        return this._category;
    }

    get status(): FrictionStatus {
        return this._status;
    }

    get tool(): string {
        return this._tool;
    }

    get tags(): string[] | undefined {
        return this._tags ? [...this._tags] : undefined;
    }

    get lastReviewedAt(): Date | undefined {
        return this._lastReviewedAt
            ? new Date(this._lastReviewedAt.getTime())
            : undefined;
    }

    get context(): string | undefined {
        return this._context;
    }

    get sourceProject(): string | undefined {
        return this._sourceProject;
    }

    get loggedAt(): Date {
        return new Date(this._loggedAt.getTime());
    }

    get resolvedAt(): Date | undefined {
        return this._resolvedAt
            ? new Date(this._resolvedAt.getTime())
            : undefined;
    }

    get resolution(): string | undefined {
        return this._resolution;
    }
}
