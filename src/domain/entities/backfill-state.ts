/**
 * BackfillState Entity
 *
 * Tracks the state of backfilling a session (generating daily log via Agent SDK).
 * Enables idempotent backfill: processed sessions are skipped on re-run.
 *
 * Entity properties:
 * - Has unique identity (sessionId)
 * - Immutable after construction
 * - Two terminal states: success or error (no lifecycle transitions)
 */

interface BackfillStateParams {
    sessionId: string;
    backfilledAt: Date;
    dailyLogPath: string;
    success?: boolean | undefined;
    errorMessage?: string | undefined;
}

export class BackfillState {
    private readonly _sessionId: string;
    private readonly _backfilledAt: Date;
    private readonly _dailyLogPath: string;
    private readonly _success: boolean;
    private readonly _errorMessage?: string | undefined;

    private constructor(params: BackfillStateParams) {
        this._sessionId = params.sessionId;
        this._backfilledAt = new Date(params.backfilledAt.getTime());
        this._dailyLogPath = params.dailyLogPath;
        this._success = params.success ?? true;
        this._errorMessage = params.errorMessage;
    }

    /**
     * Create a BackfillState entity.
     * @throws Error if sessionId or dailyLogPath is empty
     */
    static create(params: BackfillStateParams): BackfillState {
        if (!params.sessionId || params.sessionId.trim() === "") {
            throw new Error("Session ID cannot be empty");
        }
        if (!params.dailyLogPath || params.dailyLogPath.trim() === "") {
            throw new Error("Daily log path cannot be empty");
        }
        return new BackfillState(params);
    }

    /**
     * The session UUID that was backfilled.
     */
    get sessionId(): string {
        return this._sessionId;
    }

    /**
     * When the backfill was performed.
     */
    get backfilledAt(): Date {
        return new Date(this._backfilledAt.getTime());
    }

    /**
     * Path to the daily log file produced by backfill.
     */
    get dailyLogPath(): string {
        return this._dailyLogPath;
    }

    /**
     * Whether the backfill succeeded.
     */
    get success(): boolean {
        return this._success;
    }

    /**
     * Error message if the backfill failed.
     */
    get errorMessage(): string | undefined {
        return this._errorMessage;
    }

    /**
     * Convenience getter: whether the backfill succeeded.
     */
    get isSuccess(): boolean {
        return this._success;
    }
}
