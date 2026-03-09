/**
 * Budget Allocator Tests
 *
 * Tests for the pure function that distributes a token budget
 * across prioritized sections. Covers allocation, priority ordering,
 * edge cases, token estimation, and truncation behavior.
 */

import { describe, expect, test } from "bun:test";
import {
    allocateBudget,
    type BudgetSection,
    type AllocatedSection,
    type BudgetAllocationResult,
} from "./budget-allocator.js";

describe("allocateBudget", () => {
    describe("basic allocation", () => {
        test("returns all sections untruncated when budget fits all", () => {
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: "Hello" },        // 5 chars = ~2 tokens
                { key: "b", priority: 2, content: "World" },        // 5 chars = ~2 tokens
                { key: "c", priority: 3, content: "Test" },         // 4 chars = ~1 token
            ];

            const result = allocateBudget(sections, 100); // 100 tokens = 400 chars, plenty of room

            expect(result.sections).toHaveLength(3);
            expect(result.budgetExceeded).toBe(false);
            for (const s of result.sections) {
                expect(s.truncated).toBe(false);
                expect(s.truncatedContent).toBe(s.content);
            }
        });

        test("truncates third section when budget fits only first two", () => {
            // Each section = 40 chars = 10 tokens at 4 chars/token
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: "A".repeat(40) },
                { key: "b", priority: 2, content: "B".repeat(40) },
                { key: "c", priority: 3, content: "C".repeat(40) },
            ];

            const result = allocateBudget(sections, 20); // 20 tokens = 80 chars, fits first 2 only

            const sectionA = result.sections.find(s => s.key === "a")!;
            const sectionB = result.sections.find(s => s.key === "b")!;
            const sectionC = result.sections.find(s => s.key === "c")!;

            expect(sectionA.truncated).toBe(false);
            expect(sectionB.truncated).toBe(false);
            expect(sectionC.truncated).toBe(true);
            expect(sectionC.truncatedContent).toBe("");
            expect(result.budgetExceeded).toBe(true);
        });

        test("partially truncates when budget fits some of third section", () => {
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: "A".repeat(40) },  // 10 tokens
                { key: "b", priority: 2, content: "B".repeat(40) },  // 10 tokens
                { key: "c", priority: 3, content: "C".repeat(40) },  // 10 tokens
            ];

            const result = allocateBudget(sections, 25); // 25 tokens = 100 chars, fits 2.5 sections

            const sectionC = result.sections.find(s => s.key === "c")!;
            expect(sectionC.truncated).toBe(true);
            expect(sectionC.truncatedContent.length).toBe(20); // 100 - 40 - 40 = 20 chars remaining
            expect(result.budgetExceeded).toBe(true);
        });

        test("all sections truncated when budget is tiny", () => {
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: "A".repeat(40) },
                { key: "b", priority: 2, content: "B".repeat(40) },
                { key: "c", priority: 3, content: "C".repeat(40) },
            ];

            const result = allocateBudget(sections, 5); // 5 tokens = 20 chars, partial first section

            const sectionA = result.sections.find(s => s.key === "a")!;
            const sectionB = result.sections.find(s => s.key === "b")!;
            const sectionC = result.sections.find(s => s.key === "c")!;

            expect(sectionA.truncated).toBe(true);
            expect(sectionA.truncatedContent.length).toBe(20);
            expect(sectionB.truncated).toBe(true);
            expect(sectionB.truncatedContent).toBe("");
            expect(sectionC.truncated).toBe(true);
            expect(sectionC.truncatedContent).toBe("");
        });
    });

    describe("priority ordering", () => {
        test("fills sections in priority order (1 first, then 2, then 3)", () => {
            // Put higher priority last in input to verify sorting
            const sections: BudgetSection[] = [
                { key: "low", priority: 3, content: "L".repeat(40) },
                { key: "high", priority: 1, content: "H".repeat(40) },
                { key: "mid", priority: 2, content: "M".repeat(40) },
            ];

            const result = allocateBudget(sections, 20); // fits 2 sections

            const high = result.sections.find(s => s.key === "high")!;
            const mid = result.sections.find(s => s.key === "mid")!;
            const low = result.sections.find(s => s.key === "low")!;

            expect(high.truncated).toBe(false);
            expect(mid.truncated).toBe(false);
            expect(low.truncated).toBe(true);
            expect(low.truncatedContent).toBe("");
        });

        test("lower-priority sections truncated before higher-priority", () => {
            const sections: BudgetSection[] = [
                { key: "decisions", priority: 1, content: "D".repeat(100) },
                { key: "learnings", priority: 2, content: "L".repeat(100) },
                { key: "friction", priority: 6, content: "F".repeat(100) },
            ];

            const result = allocateBudget(sections, 30); // 120 chars, fits first + part of second

            const decisions = result.sections.find(s => s.key === "decisions")!;
            const learnings = result.sections.find(s => s.key === "learnings")!;
            const friction = result.sections.find(s => s.key === "friction")!;

            expect(decisions.truncated).toBe(false);
            expect(learnings.truncated).toBe(true);
            expect(learnings.truncatedContent.length).toBe(20); // 120 - 100 = 20
            expect(friction.truncated).toBe(true);
            expect(friction.truncatedContent).toBe("");
        });

        test("sections with same priority preserve input order", () => {
            const sections: BudgetSection[] = [
                { key: "first", priority: 1, content: "A".repeat(40) },
                { key: "second", priority: 1, content: "B".repeat(40) },
                { key: "third", priority: 1, content: "C".repeat(40) },
            ];

            const result = allocateBudget(sections, 20); // fits first 2

            // Same priority sections maintain stable sort
            const keys = result.sections.map(s => s.key);
            expect(keys.indexOf("first")).toBeLessThan(keys.indexOf("second"));
            expect(keys.indexOf("second")).toBeLessThan(keys.indexOf("third"));
        });
    });

    describe("edge cases", () => {
        test("budget 0 means no constraint, all returned untruncated", () => {
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: "A".repeat(1000) },
                { key: "b", priority: 2, content: "B".repeat(2000) },
            ];

            const result = allocateBudget(sections, 0);

            expect(result.budgetExceeded).toBe(false);
            for (const s of result.sections) {
                expect(s.truncated).toBe(false);
                expect(s.truncatedContent).toBe(s.content);
            }
            expect(result.totalTokensUsed).toBeGreaterThan(0);
        });

        test("negative budget means no constraint, all returned untruncated", () => {
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: "A".repeat(500) },
            ];

            const result = allocateBudget(sections, -1);

            expect(result.budgetExceeded).toBe(false);
            expect(result.sections[0].truncated).toBe(false);
            expect(result.sections[0].truncatedContent).toBe(sections[0].content);
        });

        test("empty sections array returns empty result", () => {
            const result = allocateBudget([], 100);

            expect(result.sections).toHaveLength(0);
            expect(result.totalTokensUsed).toBe(0);
            expect(result.budgetExceeded).toBe(false);
        });

        test("single section gets full budget", () => {
            const sections: BudgetSection[] = [
                { key: "only", priority: 1, content: "X".repeat(80) },
            ];

            const result = allocateBudget(sections, 20); // 80 chars = 20 tokens, exact fit

            expect(result.sections).toHaveLength(1);
            expect(result.sections[0].truncated).toBe(false);
            expect(result.sections[0].truncatedContent).toBe(sections[0].content);
        });

        test("section with empty content is skipped with 0 allocation and not truncated", () => {
            const sections: BudgetSection[] = [
                { key: "empty", priority: 1, content: "" },
                { key: "full", priority: 2, content: "Content here" },
            ];

            const result = allocateBudget(sections, 100);

            const empty = result.sections.find(s => s.key === "empty")!;
            expect(empty.allocated).toBe(0);
            expect(empty.truncated).toBe(false);
            expect(empty.truncatedContent).toBe("");
        });

        test("budget exactly equal to total content: all fit, none truncated", () => {
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: "A".repeat(40) },
                { key: "b", priority: 2, content: "B".repeat(40) },
            ];

            // 80 chars total / 4 chars per token = 20 tokens exactly
            const result = allocateBudget(sections, 20);

            expect(result.budgetExceeded).toBe(false);
            for (const s of result.sections) {
                expect(s.truncated).toBe(false);
            }
        });
    });

    describe("token estimation", () => {
        test("default charsPerToken is 4", () => {
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: "A".repeat(100) },
            ];

            const result = allocateBudget(sections, 0); // no budget constraint to get token estimate

            expect(result.sections[0].allocated).toBe(25); // 100 / 4 = 25
        });

        test("custom charsPerToken is respected", () => {
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: "A".repeat(100) },
            ];

            const result = allocateBudget(sections, 0, 2); // 2 chars per token

            expect(result.sections[0].allocated).toBe(50); // 100 / 2 = 50
        });

        test("allocated field reflects token count (chars / charsPerToken)", () => {
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: "A".repeat(13) }, // 13 / 4 = 3.25 -> ceil -> 4
            ];

            const result = allocateBudget(sections, 0);

            expect(result.sections[0].allocated).toBe(4); // Math.ceil(13 / 4)
        });

        test("totalTokensUsed is sum of all allocated tokens", () => {
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: "A".repeat(40) },  // 10 tokens
                { key: "b", priority: 2, content: "B".repeat(40) },  // 10 tokens
                { key: "c", priority: 3, content: "C".repeat(40) },  // 10 tokens
            ];

            const result = allocateBudget(sections, 0);

            expect(result.totalTokensUsed).toBe(30);
        });
    });

    describe("truncation behavior", () => {
        test("truncated content is a prefix of the original", () => {
            const original = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; // 26 chars
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: original },
            ];

            // Budget: 3 tokens at 4 chars/token = 12 chars
            const result = allocateBudget(sections, 3);

            expect(result.sections[0].truncated).toBe(true);
            expect(result.sections[0].truncatedContent).toBe("ABCDEFGHIJKL");
            expect(original.startsWith(result.sections[0].truncatedContent)).toBe(true);
        });

        test("fully excluded sections have empty truncatedContent", () => {
            const sections: BudgetSection[] = [
                { key: "a", priority: 1, content: "A".repeat(80) },  // 20 tokens, takes all budget
                { key: "b", priority: 2, content: "B".repeat(80) },
            ];

            const result = allocateBudget(sections, 20);

            const sectionB = result.sections.find(s => s.key === "b")!;
            expect(sectionB.truncatedContent).toBe("");
            expect(sectionB.allocated).toBe(0);
        });
    });
});
