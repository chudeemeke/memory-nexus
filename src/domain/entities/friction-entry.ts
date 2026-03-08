/**
 * FrictionEntry Entity
 *
 * Represents a logged friction point with the memory tool.
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
 * Categories of friction (tool-specific, not general development).
 */
export type FrictionCategory =
    | "search"
    | "sync"
    | "cli"
    | "context"
    | "integration"
    | "ux";

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

const VALID_CATEGORIES: readonly FrictionCategory[] = [
    "search",
    "sync",
    "cli",
    "context",
    "integration",
    "ux",
];

const VALID_STATUSES: readonly FrictionStatus[] = [
    "open",
    "resolved",
    "wont-fix",
];

interface FrictionEntryParams {
    id?: number;
    description: string;
    severity: FrictionSeverity;
    category: FrictionCategory;
    status: FrictionStatus;
    context?: string;
    sourceProject?: string;
    loggedAt: Date;
    resolvedAt?: Date;
    resolution?: string;
}

export class FrictionEntry {
    private readonly _id?: number;
    private readonly _description: string;
    private readonly _severity: FrictionSeverity;
    private readonly _category: FrictionCategory;
    private readonly _status: FrictionStatus;
    private readonly _context?: string;
    private readonly _sourceProject?: string;
    private readonly _loggedAt: Date;
    private readonly _resolvedAt?: Date;
    private readonly _resolution?: string;

    private constructor(params: FrictionEntryParams) {
        this._id = params.id;
        this._description = params.description.trim();
        this._severity = params.severity;
        this._category = params.category;
        this._status = params.status;
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
     * @throws Error if category is not a valid FrictionCategory
     * @throws Error if status is not a valid FrictionStatus
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

        if (!VALID_CATEGORIES.includes(params.category)) {
            throw new Error(
                `Invalid category: "${params.category}". Must be one of: ${VALID_CATEGORIES.join(", ")}`
            );
        }

        if (!VALID_STATUSES.includes(params.status)) {
            throw new Error(
                `Invalid status: "${params.status}". Must be one of: ${VALID_STATUSES.join(", ")}`
            );
        }

        if (params.status === "open" && params.resolvedAt) {
            throw new Error("Open entries cannot have a resolvedAt date");
        }

        return new FrictionEntry(params);
    }

    /**
     * The database identifier (undefined until persisted).
     */
    get id(): number | undefined {
        return this._id;
    }

    /**
     * Description of the friction point.
     */
    get description(): string {
        return this._description;
    }

    /**
     * Severity level of the friction.
     */
    get severity(): FrictionSeverity {
        return this._severity;
    }

    /**
     * Category of the friction.
     */
    get category(): FrictionCategory {
        return this._category;
    }

    /**
     * Lifecycle status.
     */
    get status(): FrictionStatus {
        return this._status;
    }

    /**
     * Additional context about the friction (project, session, task).
     */
    get context(): string | undefined {
        return this._context;
    }

    /**
     * Which project this friction was logged from.
     */
    get sourceProject(): string | undefined {
        return this._sourceProject;
    }

    /**
     * When this friction was logged (defensive copy).
     */
    get loggedAt(): Date {
        return new Date(this._loggedAt.getTime());
    }

    /**
     * When this friction was resolved (defensive copy), or undefined if open.
     */
    get resolvedAt(): Date | undefined {
        return this._resolvedAt
            ? new Date(this._resolvedAt.getTime())
            : undefined;
    }

    /**
     * How the friction was resolved, or undefined if open.
     */
    get resolution(): string | undefined {
        return this._resolution;
    }
}
