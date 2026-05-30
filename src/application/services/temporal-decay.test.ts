/**
 * Temporal Decay Tests
 *
 * Tests for the pure temporal decay function that adjusts search
 * scores based on message age.
 */

import { describe, expect, test } from "bun:test";
import {
    applyTemporalDecay,
    applyTemporalDecayWithExemptions,
    CURATED_FILE_TYPES,
    type DecayableResult,
} from "./temporal-decay.js";

describe("applyTemporalDecay()", () => {
    const now = new Date("2026-02-27T12:00:00Z");

    function daysAgo(days: number): Date {
        return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    test("message from today (age 0) has score unchanged", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 0.8 },
        ];
        const timestamps = new Map<number, Date>([
            [1, now],
        ]);

        const decayed = applyTemporalDecay(results, timestamps, 30, now);
        expect(decayed[0].decayedScore).toBeCloseTo(0.8, 5);
    });

    test("message from 30 days ago (one half-life) has score halved", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 1.0 },
        ];
        const timestamps = new Map<number, Date>([
            [1, daysAgo(30)],
        ]);

        const decayed = applyTemporalDecay(results, timestamps, 30, now);
        expect(decayed[0].decayedScore).toBeCloseTo(0.5, 5);
    });

    test("message from 60 days ago (two half-lives) has score quartered", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 1.0 },
        ];
        const timestamps = new Map<number, Date>([
            [1, daysAgo(60)],
        ]);

        const decayed = applyTemporalDecay(results, timestamps, 30, now);
        expect(decayed[0].decayedScore).toBeCloseTo(0.25, 5);
    });

    test("message from 15 days ago (half a half-life) has decay factor ~0.707", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 1.0 },
        ];
        const timestamps = new Map<number, Date>([
            [1, daysAgo(15)],
        ]);

        const decayed = applyTemporalDecay(results, timestamps, 30, now);
        const expected = Math.pow(0.5, 15 / 30); // ~0.7071
        expect(decayed[0].decayedScore).toBeCloseTo(expected, 4);
    });

    test("custom halfLifeDays=7: 7-day-old message has score halved", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 1.0 },
        ];
        const timestamps = new Map<number, Date>([
            [1, daysAgo(7)],
        ]);

        const decayed = applyTemporalDecay(results, timestamps, 7, now);
        expect(decayed[0].decayedScore).toBeCloseTo(0.5, 5);
    });

    test("result order may change after decay (newer low-score outranks older high-score)", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 1.0 },  // old, high score
            { rowid: 2, score: 0.6 },  // new, lower score
        ];
        const timestamps = new Map<number, Date>([
            [1, daysAgo(90)],  // 3 half-lives => 0.125
            [2, daysAgo(1)],   // almost today => ~0.597
        ]);

        const decayed = applyTemporalDecay(results, timestamps, 30, now);

        // Newer result should come first after decay
        expect(decayed[0].rowid).toBe(2);
        expect(decayed[1].rowid).toBe(1);
    });

    test("missing timestamp: score unchanged (no decay applied)", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 0.8 },
            { rowid: 2, score: 0.6 },
        ];
        const timestamps = new Map<number, Date>([
            [1, daysAgo(30)],
            // rowid 2 has no timestamp
        ]);

        const decayed = applyTemporalDecay(results, timestamps, 30, now);

        const r2 = decayed.find(r => r.rowid === 2)!;
        expect(r2.decayedScore).toBe(0.6);

        const r1 = decayed.find(r => r.rowid === 1)!;
        expect(r1.decayedScore).toBeCloseTo(0.4, 5);
    });

    test("returns results re-sorted by decayed score descending", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 0.9 },
            { rowid: 2, score: 0.5 },
            { rowid: 3, score: 0.7 },
        ];
        const timestamps = new Map<number, Date>([
            [1, daysAgo(60)],  // score * 0.25 = 0.225
            [2, daysAgo(0)],   // score * 1.0 = 0.5
            [3, daysAgo(15)],  // score * ~0.707 = ~0.495
        ]);

        const decayed = applyTemporalDecay(results, timestamps, 30, now);

        for (let i = 0; i < decayed.length - 1; i++) {
            expect(decayed[i].decayedScore).toBeGreaterThanOrEqual(decayed[i + 1].decayedScore);
        }
    });

    test("uses default half-life and current time when optional arguments are omitted", () => {
        const nowish = new Date();
        const results: DecayableResult[] = [
            { rowid: 1, score: 1.0 },
        ];
        const timestamps = new Map<number, Date>([
            [1, new Date(nowish.getTime() - 30 * 24 * 60 * 60 * 1000)],
        ]);

        const decayed = applyTemporalDecay(results, timestamps);

        expect(decayed[0].decayedScore).toBeGreaterThan(0.49);
        expect(decayed[0].decayedScore).toBeLessThanOrEqual(0.5);
    });
});

describe("applyTemporalDecayWithExemptions()", () => {
    const now = new Date("2026-02-27T12:00:00Z");

    function daysAgo(days: number): Date {
        return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    test("exempt rowids retain original score (no decay applied)", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 0.9 },
            { rowid: 2, score: 0.8 },
        ];
        const timestamps = new Map<number, Date>([
            [1, daysAgo(60)],
            [2, daysAgo(60)],
        ]);
        const exemptRowids = new Set([1, 2]);

        const decayed = applyTemporalDecayWithExemptions(
            results, timestamps, exemptRowids, 30, now
        );

        expect(decayed[0].decayedScore).toBe(0.9);
        expect(decayed[1].decayedScore).toBe(0.8);
    });

    test("non-exempt rowids are decayed normally", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 1.0 },
        ];
        const timestamps = new Map<number, Date>([
            [1, daysAgo(30)],
        ]);
        const exemptRowids = new Set<number>();

        const decayed = applyTemporalDecayWithExemptions(
            results, timestamps, exemptRowids, 30, now
        );

        expect(decayed[0].decayedScore).toBeCloseTo(0.5, 5);
    });

    test("results with no timestamp retain original score", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 0.7 },
        ];
        const timestamps = new Map<number, Date>();
        const exemptRowids = new Set<number>();

        const decayed = applyTemporalDecayWithExemptions(
            results, timestamps, exemptRowids, 30, now
        );

        expect(decayed[0].decayedScore).toBe(0.7);
    });

    test("mixed exempt and non-exempt results re-sorted by final score", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 0.6 },   // exempt, keeps 0.6
            { rowid: 2, score: 1.0 },   // non-exempt, 90 days old -> 0.125
            { rowid: 3, score: 0.5 },   // non-exempt, today -> 0.5
        ];
        const timestamps = new Map<number, Date>([
            [1, daysAgo(90)],
            [2, daysAgo(90)],
            [3, daysAgo(0)],
        ]);
        const exemptRowids = new Set([1]);

        const decayed = applyTemporalDecayWithExemptions(
            results, timestamps, exemptRowids, 30, now
        );

        // Expected order: rowid 1 (0.6), rowid 3 (0.5), rowid 2 (0.125)
        expect(decayed[0].rowid).toBe(1);
        expect(decayed[0].decayedScore).toBe(0.6);
        expect(decayed[1].rowid).toBe(3);
        expect(decayed[1].decayedScore).toBeCloseTo(0.5, 5);
        expect(decayed[2].rowid).toBe(2);
        expect(decayed[2].decayedScore).toBeCloseTo(0.125, 3);
    });

    test("empty exemptRowids set behaves identically to applyTemporalDecay", () => {
        const results: DecayableResult[] = [
            { rowid: 1, score: 0.9 },
            { rowid: 2, score: 0.7 },
        ];
        const timestamps = new Map<number, Date>([
            [1, daysAgo(30)],
            [2, daysAgo(15)],
        ]);

        const withExemptions = applyTemporalDecayWithExemptions(
            results, timestamps, new Set(), 30, now
        );
        const without = applyTemporalDecay(results, timestamps, 30, now);

        expect(withExemptions.length).toBe(without.length);
        for (let i = 0; i < withExemptions.length; i++) {
            expect(withExemptions[i].rowid).toBe(without[i].rowid);
            expect(withExemptions[i].decayedScore).toBeCloseTo(without[i].decayedScore, 10);
        }
    });

    test("empty results array returns empty array", () => {
        const decayed = applyTemporalDecayWithExemptions(
            [], new Map(), new Set(), 30, now
        );
        expect(decayed).toEqual([]);
    });

    test("uses default half-life and current time when optional arguments are omitted", () => {
        const nowish = new Date();
        const results: DecayableResult[] = [
            { rowid: 1, score: 1.0 },
        ];
        const timestamps = new Map<number, Date>([
            [1, new Date(nowish.getTime() - 30 * 24 * 60 * 60 * 1000)],
        ]);

        const decayed = applyTemporalDecayWithExemptions(results, timestamps, new Set());

        expect(decayed[0].decayedScore).toBeGreaterThan(0.49);
        expect(decayed[0].decayedScore).toBeLessThanOrEqual(0.5);
    });
});

describe("CURATED_FILE_TYPES", () => {
    test("contains exactly decisions, learnings, user_prefs", () => {
        expect(CURATED_FILE_TYPES).toEqual(["decisions", "learnings", "user_prefs"]);
    });

    test("is a readonly array", () => {
        // Type-level check: readonly arrays have readonly modifier
        const arr: readonly string[] = CURATED_FILE_TYPES;
        expect(arr.length).toBe(3);
    });
});
