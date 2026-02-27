/**
 * Temporal Decay
 *
 * Pure function applying exponential time-based decay to search scores.
 * Recent results are ranked higher than older results.
 *
 * Formula: finalScore = score * 0.5^(ageDays / halfLifeDays)
 * Inspired by OpenClaw's memory decay pattern.
 */

/**
 * A result with a score that can be decayed.
 */
export interface DecayableResult {
    /** The message rowid */
    rowid: number;
    /** The base score before decay */
    score: number;
}

/**
 * A result after temporal decay has been applied.
 */
export interface DecayedResult extends DecayableResult {
    /** The score after temporal decay */
    decayedScore: number;
}

/**
 * Apply temporal decay to search results based on message age.
 *
 * Messages closer to `now` retain more of their score.
 * Messages without a timestamp in the map are unaffected.
 * Results are re-sorted by decayed score descending.
 *
 * @param results Array of results with base scores
 * @param timestamps Map of rowid to message timestamp
 * @param halfLifeDays Number of days for score to halve (default 30)
 * @param now Reference time for age calculation (default: current time)
 * @returns Results with decayedScore, sorted descending
 */
export function applyTemporalDecay<T extends DecayableResult>(
    results: T[],
    timestamps: Map<number, Date>,
    halfLifeDays: number = 30,
    now: Date = new Date()
): Array<T & { decayedScore: number }> {
    const nowMs = now.getTime();
    const msPerDay = 1000 * 60 * 60 * 24;

    const decayed = results.map((r) => {
        const timestamp = timestamps.get(r.rowid);
        if (!timestamp) {
            return { ...r, decayedScore: r.score };
        }

        const ageDays = (nowMs - timestamp.getTime()) / msPerDay;
        const decayFactor = Math.pow(0.5, ageDays / halfLifeDays);

        return { ...r, decayedScore: r.score * decayFactor };
    });

    return decayed.sort((a, b) => b.decayedScore - a.decayedScore);
}
