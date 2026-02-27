/**
 * Reciprocal Rank Fusion
 *
 * Pure function implementing RRF to combine ranked result lists
 * from FTS5 and vector search. Uses rank positions (not raw scores)
 * to avoid score normalization problems between rankers.
 *
 * Formula: score(d) = sum(1 / (k + rank_i(d))) for each ranker i
 * Reference: Cormack, Clarke, Buettcher (2009)
 */

/**
 * A candidate from a single ranker with its rank position.
 */
export interface RankedCandidate {
    /** The message rowid */
    rowid: number;
    /** Rank position (1 = best match) */
    rank: number;
    /** Which ranker produced this candidate */
    source: "fts" | "vector";
    /** Raw score from the ranker (BM25 or cosine distance) */
    rawScore: number;
}

/**
 * A fused result after RRF combining multiple ranker outputs.
 */
export interface FusedResult {
    /** The message rowid */
    rowid: number;
    /** Raw RRF score (sum of 1/(k+rank) across rankers) */
    rrfScore: number;
    /** Normalized score (0-1, highest RRF maps to 1.0) */
    normalizedScore: number;
    /** Sources that contributed to this result with their rank and raw score */
    sources: Array<{ source: "fts" | "vector"; rank: number; rawScore: number }>;
}

/** RRF k parameter (from original paper) */
const RRF_K = 60;

/** Minimum RRF score threshold to filter noise */
const MIN_SCORE_THRESHOLD = 0.001;

/**
 * Combine ranked result lists using Reciprocal Rank Fusion.
 *
 * Takes pre-ranked candidates from FTS5 and vector search,
 * computes RRF scores, filters noise, normalizes to 0-1,
 * and returns the top results.
 *
 * @param ftsResults Ranked candidates from FTS5 (rank 1 = best BM25)
 * @param vectorResults Ranked candidates from vector search (rank 1 = lowest distance)
 * @param limit Maximum number of results to return
 * @returns Fused results sorted by RRF score descending, normalized to 0-1
 */
export function reciprocalRankFusion(
    ftsResults: RankedCandidate[],
    vectorResults: RankedCandidate[],
    limit: number
): FusedResult[] {
    const scores = new Map<number, FusedResult>();

    for (const r of ftsResults) {
        const existing = scores.get(r.rowid) ?? {
            rowid: r.rowid,
            rrfScore: 0,
            normalizedScore: 0,
            sources: [],
        };
        existing.rrfScore += 1 / (RRF_K + r.rank);
        existing.sources.push({
            source: "fts",
            rank: r.rank,
            rawScore: r.rawScore,
        });
        scores.set(r.rowid, existing);
    }

    for (const r of vectorResults) {
        const existing = scores.get(r.rowid) ?? {
            rowid: r.rowid,
            rrfScore: 0,
            normalizedScore: 0,
            sources: [],
        };
        existing.rrfScore += 1 / (RRF_K + r.rank);
        existing.sources.push({
            source: "vector",
            rank: r.rank,
            rawScore: r.rawScore,
        });
        scores.set(r.rowid, existing);
    }

    // Sort by RRF score descending
    let results = Array.from(scores.values()).sort(
        (a, b) => b.rrfScore - a.rrfScore
    );

    // Apply minimum score threshold
    results = results.filter((r) => r.rrfScore >= MIN_SCORE_THRESHOLD);

    // Trim to limit
    results = results.slice(0, limit);

    // Normalize scores to 0-1 range
    if (results.length > 0) {
        const maxScore = results[0].rrfScore;
        if (maxScore > 0) {
            for (const r of results) {
                r.normalizedScore = r.rrfScore / maxScore;
            }
        }
    }

    return results;
}
