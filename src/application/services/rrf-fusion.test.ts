/**
 * Reciprocal Rank Fusion Tests
 *
 * Tests for the pure RRF function that combines ranked result lists
 * from FTS5 and vector search.
 */

import { describe, expect, test } from "bun:test";
import {
    reciprocalRankFusion,
    type RankedCandidate,
    type FusedResult,
} from "./rrf-fusion.js";

describe("reciprocalRankFusion()", () => {
    test("returns 6 results from 3 FTS + 3 vector with no overlap", () => {
        const fts: RankedCandidate[] = [
            { rowid: 1, rank: 1, source: "fts", rawScore: -2.5 },
            { rowid: 2, rank: 2, source: "fts", rawScore: -3.1 },
            { rowid: 3, rank: 3, source: "fts", rawScore: -4.0 },
        ];
        const vec: RankedCandidate[] = [
            { rowid: 4, rank: 1, source: "vector", rawScore: 0.1 },
            { rowid: 5, rank: 2, source: "vector", rawScore: 0.3 },
            { rowid: 6, rank: 3, source: "vector", rawScore: 0.5 },
        ];

        const result = reciprocalRankFusion(fts, vec, 10);
        expect(result).toHaveLength(6);

        // Each has single-source RRF score 1/(60+rank)
        const rowid1Result = result.find(r => r.rowid === 1)!;
        expect(rowid1Result.rrfScore).toBeCloseTo(1 / (60 + 1), 10);
    });

    test("overlapping results get boosted score", () => {
        const fts: RankedCandidate[] = [
            { rowid: 1, rank: 1, source: "fts", rawScore: -2.0 },
            { rowid: 2, rank: 2, source: "fts", rawScore: -3.0 },
        ];
        const vec: RankedCandidate[] = [
            { rowid: 1, rank: 2, source: "vector", rawScore: 0.2 },
            { rowid: 3, rank: 1, source: "vector", rawScore: 0.1 },
        ];

        const result = reciprocalRankFusion(fts, vec, 10);

        const rowid1Result = result.find(r => r.rowid === 1)!;
        const expectedScore = 1 / (60 + 1) + 1 / (60 + 2);
        expect(rowid1Result.rrfScore).toBeCloseTo(expectedScore, 10);

        // Overlapping result should be higher than single-source
        const rowid2Result = result.find(r => r.rowid === 2)!;
        expect(rowid1Result.rrfScore).toBeGreaterThan(rowid2Result.rrfScore);
    });

    test("output is sorted by RRF score descending", () => {
        const fts: RankedCandidate[] = [
            { rowid: 1, rank: 1, source: "fts", rawScore: -1.0 },
            { rowid: 2, rank: 2, source: "fts", rawScore: -2.0 },
            { rowid: 3, rank: 3, source: "fts", rawScore: -3.0 },
        ];
        const vec: RankedCandidate[] = [
            { rowid: 4, rank: 1, source: "vector", rawScore: 0.1 },
            { rowid: 5, rank: 2, source: "vector", rawScore: 0.2 },
        ];

        const result = reciprocalRankFusion(fts, vec, 10);

        for (let i = 0; i < result.length - 1; i++) {
            expect(result[i].rrfScore).toBeGreaterThanOrEqual(result[i + 1].rrfScore);
        }
    });

    test("limit truncates output", () => {
        const fts: RankedCandidate[] = [
            { rowid: 1, rank: 1, source: "fts", rawScore: -1.0 },
            { rowid: 2, rank: 2, source: "fts", rawScore: -2.0 },
            { rowid: 3, rank: 3, source: "fts", rawScore: -3.0 },
        ];
        const vec: RankedCandidate[] = [
            { rowid: 4, rank: 1, source: "vector", rawScore: 0.1 },
            { rowid: 5, rank: 2, source: "vector", rawScore: 0.2 },
        ];

        const result = reciprocalRankFusion(fts, vec, 3);
        expect(result).toHaveLength(3);
    });

    test("minimum score threshold filters very low-ranked single-source results", () => {
        const fts: RankedCandidate[] = [
            { rowid: 1, rank: 1, source: "fts", rawScore: -1.0 },
        ];
        // rank 1000 gives score 1/(60+1000) = ~0.000943 which is below any reasonable threshold
        const vec: RankedCandidate[] = [
            { rowid: 2, rank: 1000, source: "vector", rawScore: 1.9 },
        ];

        const result = reciprocalRankFusion(fts, vec, 10);

        // The rank-1000 result should be filtered out
        const rowid2 = result.find(r => r.rowid === 2);
        expect(rowid2).toBeUndefined();

        // The rank-1 result should remain
        expect(result.find(r => r.rowid === 1)).toBeDefined();
    });

    test("empty FTS results with 3 vector results returns vector-only", () => {
        const fts: RankedCandidate[] = [];
        const vec: RankedCandidate[] = [
            { rowid: 1, rank: 1, source: "vector", rawScore: 0.1 },
            { rowid: 2, rank: 2, source: "vector", rawScore: 0.2 },
            { rowid: 3, rank: 3, source: "vector", rawScore: 0.3 },
        ];

        const result = reciprocalRankFusion(fts, vec, 10);
        expect(result).toHaveLength(3);
        for (const r of result) {
            expect(r.sources).toHaveLength(1);
            expect(r.sources[0].source).toBe("vector");
        }
    });

    test("3 FTS results with empty vector results returns FTS-only", () => {
        const fts: RankedCandidate[] = [
            { rowid: 1, rank: 1, source: "fts", rawScore: -1.0 },
            { rowid: 2, rank: 2, source: "fts", rawScore: -2.0 },
            { rowid: 3, rank: 3, source: "fts", rawScore: -3.0 },
        ];
        const vec: RankedCandidate[] = [];

        const result = reciprocalRankFusion(fts, vec, 10);
        expect(result).toHaveLength(3);
        for (const r of result) {
            expect(r.sources).toHaveLength(1);
            expect(r.sources[0].source).toBe("fts");
        }
    });

    test("both empty returns empty array", () => {
        const result = reciprocalRankFusion([], [], 10);
        expect(result).toHaveLength(0);
    });

    test("score normalization: highest score maps to 1.0, others scale proportionally", () => {
        const fts: RankedCandidate[] = [
            { rowid: 1, rank: 1, source: "fts", rawScore: -1.0 },
            { rowid: 2, rank: 2, source: "fts", rawScore: -2.0 },
        ];
        const vec: RankedCandidate[] = [
            { rowid: 1, rank: 1, source: "vector", rawScore: 0.1 },
        ];

        const result = reciprocalRankFusion(fts, vec, 10);

        // First result (highest RRF) should have normalizedScore = 1.0
        expect(result[0].normalizedScore).toBe(1.0);

        // Other results should be proportionally scaled
        for (const r of result) {
            expect(r.normalizedScore).toBeGreaterThan(0);
            expect(r.normalizedScore).toBeLessThanOrEqual(1.0);
        }
    });

    test("single result normalizes to 1.0", () => {
        const fts: RankedCandidate[] = [
            { rowid: 1, rank: 1, source: "fts", rawScore: -1.0 },
        ];

        const result = reciprocalRankFusion(fts, [], 10);
        expect(result).toHaveLength(1);
        expect(result[0].normalizedScore).toBe(1.0);
    });

    test("each result has sources array indicating contributing rankers", () => {
        const fts: RankedCandidate[] = [
            { rowid: 1, rank: 1, source: "fts", rawScore: -1.0 },
        ];
        const vec: RankedCandidate[] = [
            { rowid: 1, rank: 2, source: "vector", rawScore: 0.2 },
            { rowid: 2, rank: 1, source: "vector", rawScore: 0.1 },
        ];

        const result = reciprocalRankFusion(fts, vec, 10);

        // rowid 1 appears in both rankers
        const r1 = result.find(r => r.rowid === 1)!;
        expect(r1.sources).toHaveLength(2);
        const sourceNames = r1.sources.map(s => s.source);
        expect(sourceNames).toContain("fts");
        expect(sourceNames).toContain("vector");

        // rowid 2 appears only in vector
        const r2 = result.find(r => r.rowid === 2)!;
        expect(r2.sources).toHaveLength(1);
        expect(r2.sources[0].source).toBe("vector");
    });
});
