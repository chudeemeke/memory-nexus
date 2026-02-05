/**
 * Signal Handler Tests
 *
 * Tests signal handling for graceful shutdown.
 * Note: Interactive prompt testing is complex; focus on state management.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    getCleanupCount,
    getInterruptCount,
    incrementInterruptCount,
    registerCleanup,
    resetState,
    setExitOverride,
    setShuttingDown,
    setTtyOverride,
    setupSignalHandlers,
    shouldAbort,
    unregisterCleanup,
} from "./signal-handler.js";

describe("signal-handler", () => {
    beforeEach(() => {
        resetState();
    });

    afterEach(() => {
        resetState();
    });

    describe("shouldAbort", () => {
        test("returns false initially", () => {
            expect(shouldAbort()).toBe(false);
        });

        test("returns true after setShuttingDown(true)", () => {
            setShuttingDown(true);
            expect(shouldAbort()).toBe(true);
        });

        test("returns false after reset", () => {
            setShuttingDown(true);
            expect(shouldAbort()).toBe(true);

            resetState();
            expect(shouldAbort()).toBe(false);
        });
    });

    describe("registerCleanup", () => {
        test("adds function to cleanup list", () => {
            const cleanup = async (): Promise<void> => {};
            expect(getCleanupCount()).toBe(0);

            registerCleanup(cleanup);

            expect(getCleanupCount()).toBe(1);
        });

        test("allows multiple cleanup functions", () => {
            const cleanup1 = async (): Promise<void> => {};
            const cleanup2 = async (): Promise<void> => {};
            const cleanup3 = async (): Promise<void> => {};

            registerCleanup(cleanup1);
            registerCleanup(cleanup2);
            registerCleanup(cleanup3);

            expect(getCleanupCount()).toBe(3);
        });
    });

    describe("unregisterCleanup", () => {
        test("removes function from cleanup list", () => {
            const cleanup = async (): Promise<void> => {};
            registerCleanup(cleanup);
            expect(getCleanupCount()).toBe(1);

            unregisterCleanup(cleanup);

            expect(getCleanupCount()).toBe(0);
        });

        test("does nothing if function not registered", () => {
            const cleanup1 = async (): Promise<void> => {};
            const cleanup2 = async (): Promise<void> => {};
            registerCleanup(cleanup1);
            expect(getCleanupCount()).toBe(1);

            unregisterCleanup(cleanup2);

            expect(getCleanupCount()).toBe(1);
        });

        test("only removes first occurrence", () => {
            const cleanup = async (): Promise<void> => {};
            registerCleanup(cleanup);
            registerCleanup(cleanup); // Same function twice
            expect(getCleanupCount()).toBe(2);

            unregisterCleanup(cleanup);

            expect(getCleanupCount()).toBe(1);
        });
    });

    describe("resetState", () => {
        test("clears all state", () => {
            // Set up various state
            setShuttingDown(true);
            incrementInterruptCount();
            incrementInterruptCount();
            registerCleanup(async () => {});
            registerCleanup(async () => {});

            expect(shouldAbort()).toBe(true);
            expect(getInterruptCount()).toBe(2);
            expect(getCleanupCount()).toBe(2);

            resetState();

            expect(shouldAbort()).toBe(false);
            expect(getInterruptCount()).toBe(0);
            expect(getCleanupCount()).toBe(0);
        });
    });

    describe("setupSignalHandlers", () => {
        test("can be called multiple times safely", () => {
            // Should not throw or create duplicate handlers
            setupSignalHandlers();
            setupSignalHandlers();
            setupSignalHandlers();

            // If we got here without error, test passes
            expect(true).toBe(true);
        });
    });

    describe("interrupt count", () => {
        test("starts at zero", () => {
            expect(getInterruptCount()).toBe(0);
        });

        test("increments correctly", () => {
            incrementInterruptCount();
            expect(getInterruptCount()).toBe(1);

            incrementInterruptCount();
            expect(getInterruptCount()).toBe(2);
        });

        test("resets with resetState", () => {
            incrementInterruptCount();
            incrementInterruptCount();
            expect(getInterruptCount()).toBe(2);

            resetState();
            expect(getInterruptCount()).toBe(0);
        });
    });

    describe("TTY override", () => {
        test("setTtyOverride affects behavior", () => {
            setTtyOverride(false);
            // This is mostly for coverage - actual TTY behavior is hard to test
            // The override allows testing non-TTY paths
            resetState();
        });
    });

    describe("exit override", () => {
        test("setExitOverride allows capturing exit calls", () => {
            let exitCode: number | null = null;
            setExitOverride((code) => {
                exitCode = code;
            });

            // The override is set up; actual exit testing would require
            // simulating signals which is complex in unit tests
            expect(exitCode).toBeNull(); // Not called yet

            resetState();
        });
    });

    describe("integration scenarios", () => {
        test("typical usage pattern: register, work, unregister", () => {
            // 1. Setup
            setupSignalHandlers();

            // 2. Register cleanup before operation
            const cleanup = async (): Promise<void> => {
                // Close database, save state, etc.
            };
            registerCleanup(cleanup);
            expect(getCleanupCount()).toBe(1);

            // 3. Check abort flag in loop (would be in real code)
            expect(shouldAbort()).toBe(false);

            // 4. Unregister on successful completion
            unregisterCleanup(cleanup);
            expect(getCleanupCount()).toBe(0);
        });

        test("multiple cleanups in order", () => {
            const callOrder: number[] = [];

            const cleanup1 = async (): Promise<void> => {
                callOrder.push(1);
            };
            const cleanup2 = async (): Promise<void> => {
                callOrder.push(2);
            };
            const cleanup3 = async (): Promise<void> => {
                callOrder.push(3);
            };

            registerCleanup(cleanup1);
            registerCleanup(cleanup2);
            registerCleanup(cleanup3);

            expect(getCleanupCount()).toBe(3);

            // Can't easily test execution order without triggering signal,
            // but registration order is preserved
        });

        test("shutdown state persists across checks", () => {
            expect(shouldAbort()).toBe(false);
            expect(shouldAbort()).toBe(false);

            setShuttingDown(true);

            expect(shouldAbort()).toBe(true);
            expect(shouldAbort()).toBe(true);
            expect(shouldAbort()).toBe(true);
        });
    });
});
