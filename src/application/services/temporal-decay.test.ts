/**
 * Temporal Decay Tests
 *
 * Tests for the pure temporal decay function that adjusts search
 * scores based on message age.
 */

import { describe, expect, test } from "bun:test";
import {
    applyTemporalDecay,
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
});
