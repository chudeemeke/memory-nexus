/**
 * BackfillState Entity Tests
 *
 * Tests for the BackfillState domain entity.
 * Verifies creation, validation, defaults, and immutability.
 */

import { describe, it, expect } from "bun:test";
import { BackfillState } from "./backfill-state.js";

describe("BackfillState", () => {
    describe("create() with valid params", () => {
        it("should create a success state with all fields", () => {
            const state = BackfillState.create({
                sessionId: "abc-123",
                backfilledAt: new Date("2026-03-08T10:00:00Z"),
                dailyLogPath: "daily/2026-03-08.md",
                success: true,
            });

            expect(state.sessionId).toBe("abc-123");
            expect(state.backfilledAt.toISOString()).toBe("2026-03-08T10:00:00.000Z");
            expect(state.dailyLogPath).toBe("daily/2026-03-08.md");
            expect(state.success).toBe(true);
            expect(state.errorMessage).toBeUndefined();
        });

        it("should create an error state with errorMessage", () => {
            const state = BackfillState.create({
                sessionId: "def-456",
                backfilledAt: new Date("2026-03-08T11:00:00Z"),
                dailyLogPath: "daily/2026-03-08.md",
                success: false,
                errorMessage: "claude -p timed out",
            });

            expect(state.sessionId).toBe("def-456");
            expect(state.backfilledAt.toISOString()).toBe("2026-03-08T11:00:00.000Z");
            expect(state.dailyLogPath).toBe("daily/2026-03-08.md");
            expect(state.success).toBe(false);
            expect(state.errorMessage).toBe("claude -p timed out");
        });
    });

    describe("create() defaults", () => {
        it("should default success to true", () => {
            const state = BackfillState.create({
                sessionId: "ghi-789",
                backfilledAt: new Date(),
                dailyLogPath: "daily/2026-03-08.md",
            });

            expect(state.success).toBe(true);
        });

        it("should default errorMessage to undefined", () => {
            const state = BackfillState.create({
                sessionId: "ghi-789",
                backfilledAt: new Date(),
                dailyLogPath: "daily/2026-03-08.md",
            });

            expect(state.errorMessage).toBeUndefined();
        });
    });

    describe("validation", () => {
        it("should throw when sessionId is empty", () => {
            expect(() =>
                BackfillState.create({
                    sessionId: "",
                    backfilledAt: new Date(),
                    dailyLogPath: "daily/2026-03-08.md",
                })
            ).toThrow("Session ID cannot be empty");
        });

        it("should throw when sessionId is whitespace only", () => {
            expect(() =>
                BackfillState.create({
                    sessionId: "   ",
                    backfilledAt: new Date(),
                    dailyLogPath: "daily/2026-03-08.md",
                })
            ).toThrow("Session ID cannot be empty");
        });

        it("should throw when dailyLogPath is empty", () => {
            expect(() =>
                BackfillState.create({
                    sessionId: "abc-123",
                    backfilledAt: new Date(),
                    dailyLogPath: "",
                })
            ).toThrow("Daily log path cannot be empty");
        });

        it("should throw when dailyLogPath is whitespace only", () => {
            expect(() =>
                BackfillState.create({
                    sessionId: "abc-123",
                    backfilledAt: new Date(),
                    dailyLogPath: "   ",
                })
            ).toThrow("Daily log path cannot be empty");
        });
    });

    describe("immutability", () => {
        it("should return the same values on repeated calls", () => {
            const backfilledAt = new Date("2026-03-08T10:00:00Z");
            const state = BackfillState.create({
                sessionId: "abc-123",
                backfilledAt,
                dailyLogPath: "daily/2026-03-08.md",
                success: true,
            });

            expect(state.sessionId).toBe(state.sessionId);
            expect(state.backfilledAt.toISOString()).toBe(state.backfilledAt.toISOString());
            expect(state.dailyLogPath).toBe(state.dailyLogPath);
            expect(state.success).toBe(state.success);
            expect(state.errorMessage).toBe(state.errorMessage);
        });

        it("should return defensive copy of backfilledAt date", () => {
            const backfilledAt = new Date("2026-03-08T10:00:00Z");
            const state = BackfillState.create({
                sessionId: "abc-123",
                backfilledAt,
                dailyLogPath: "daily/2026-03-08.md",
            });

            // Mutating the original date should not affect the entity
            backfilledAt.setFullYear(2000);
            expect(state.backfilledAt.getFullYear()).toBe(2026);

            // Mutating the getter result should not affect the entity
            const retrieved = state.backfilledAt;
            retrieved.setFullYear(2000);
            expect(state.backfilledAt.getFullYear()).toBe(2026);
        });
    });

    describe("isSuccess convenience getter", () => {
        it("should return true when success is true", () => {
            const state = BackfillState.create({
                sessionId: "abc-123",
                backfilledAt: new Date(),
                dailyLogPath: "daily/2026-03-08.md",
                success: true,
            });

            expect(state.isSuccess).toBe(true);
        });

        it("should return false when success is false", () => {
            const state = BackfillState.create({
                sessionId: "abc-123",
                backfilledAt: new Date(),
                dailyLogPath: "daily/2026-03-08.md",
                success: false,
                errorMessage: "some error",
            });

            expect(state.isSuccess).toBe(false);
        });
    });
});
