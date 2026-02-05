/**
 * Signal Handler
 *
 * Handles SIGINT (Ctrl+C) and SIGTERM for graceful shutdown.
 * Provides 3-option prompt on first interrupt, force exit on second.
 *
 * Usage:
 * 1. Call setupSignalHandlers() at CLI startup
 * 2. Register cleanup functions with registerCleanup()
 * 3. Check shouldAbort() in long-running loops
 * 4. Unregister cleanups on successful completion
 */

import * as readline from "node:readline";

/**
 * Signal handler state
 *
 * Tracks shutdown state and cleanup functions.
 * Module-level for process-wide coordination.
 */
interface SignalState {
    /** Whether shutdown has been requested */
    isShuttingDown: boolean;
    /** Number of interrupt signals received */
    interruptCount: number;
    /** Cleanup functions to call before exit */
    cleanupFunctions: Array<() => Promise<void>>;
    /** Whether handlers have been set up */
    handlersRegistered: boolean;
    /** TTY override for testing (null = use actual) */
    ttyOverride: boolean | null;
    /** Process exit function override for testing */
    exitOverride: ((code: number) => void) | null;
}

/**
 * Module-level state for signal handling
 */
const state: SignalState = {
    isShuttingDown: false,
    interruptCount: 0,
    cleanupFunctions: [],
    handlersRegistered: false,
    ttyOverride: null,
    exitOverride: null,
};

/**
 * Set TTY override for testing
 *
 * @param isTTY Value to use, or null to use actual stdin.isTTY
 */
export function setTtyOverride(isTTY: boolean | null): void {
    state.ttyOverride = isTTY;
}

/**
 * Set process exit override for testing
 *
 * @param exitFn Function to call instead of process.exit, or null for actual
 */
export function setExitOverride(exitFn: ((code: number) => void) | null): void {
    state.exitOverride = exitFn;
}

/**
 * Check if running in TTY mode
 *
 * @returns true if stdin is a TTY (interactive terminal)
 */
function isTTY(): boolean {
    if (state.ttyOverride !== null) {
        return state.ttyOverride;
    }
    return process.stdin.isTTY ?? false;
}

/**
 * Call process.exit or override
 *
 * @param code Exit code
 */
function exit(code: number): void {
    if (state.exitOverride !== null) {
        state.exitOverride(code);
        return;
    }
    process.exit(code);
}

/**
 * Run all registered cleanup functions
 *
 * Runs cleanups in registration order.
 * Logs errors but continues with remaining cleanups.
 */
async function runCleanups(): Promise<void> {
    for (const cleanup of state.cleanupFunctions) {
        try {
            await cleanup();
        } catch (error) {
            console.warn("Cleanup error:", (error as Error).message);
        }
    }
}

/**
 * Prompt user for action choice
 *
 * Uses readline for interactive prompt.
 * Re-prompts on invalid input.
 *
 * @returns User's choice: 1, 2, or 3
 */
async function promptUser(): Promise<1 | 2 | 3> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        const askQuestion = (): void => {
            console.log("\nInterrupt received. Choose action:");
            console.log("  1) Abort immediately");
            console.log("  2) Abort after current session (saves progress)");
            console.log("  3) Cancel abort (continue)");
            rl.question("> ", (answer) => {
                const choice = parseInt(answer.trim(), 10);
                if (choice === 1 || choice === 2 || choice === 3) {
                    rl.close();
                    resolve(choice);
                } else {
                    console.log("Invalid choice. Enter 1, 2, or 3.");
                    askQuestion();
                }
            });
        };
        askQuestion();
    });
}

/**
 * Handle user's choice from prompt
 *
 * @param choice User's selection (1, 2, or 3)
 */
async function handleChoice(choice: 1 | 2 | 3): Promise<void> {
    switch (choice) {
        case 1:
            // Abort immediately
            console.log("Aborting immediately...");
            await runCleanups();
            exit(130);
            break;
        case 2:
            // Abort after current session
            console.log("Will abort after current session...");
            state.isShuttingDown = true;
            break;
        case 3:
            // Cancel abort
            console.log("Continuing...");
            state.interruptCount = 0;
            break;
    }
}

/**
 * Handle signal (SIGINT or SIGTERM)
 *
 * First signal: prompt user or default to graceful shutdown
 * Second signal: force exit
 */
async function handleSignal(): Promise<void> {
    state.interruptCount++;

    if (state.interruptCount >= 2) {
        // Second interrupt: force exit
        console.log("\nForce exiting...");
        await runCleanups();
        exit(130);
        return;
    }

    // First interrupt
    if (isTTY()) {
        // Interactive: prompt user for choice
        const choice = await promptUser();
        await handleChoice(choice);
    } else {
        // Non-interactive: default to graceful shutdown (option 2)
        console.log("\nInterrupt received, shutting down after current operation...");
        state.isShuttingDown = true;
    }
}

/**
 * Set up signal handlers for SIGINT and SIGTERM
 *
 * Safe to call multiple times (handlers only registered once).
 * SIGINT: Ctrl+C
 * SIGTERM: Kill signal (e.g., from process manager)
 */
export function setupSignalHandlers(): void {
    if (state.handlersRegistered) {
        return;
    }

    process.on("SIGINT", () => {
        handleSignal().catch((error) => {
            console.error("Signal handler error:", error);
            exit(1);
        });
    });

    process.on("SIGTERM", () => {
        handleSignal().catch((error) => {
            console.error("Signal handler error:", error);
            exit(1);
        });
    });

    state.handlersRegistered = true;
}

/**
 * Check if shutdown has been requested
 *
 * Long-running operations should check this periodically
 * and exit gracefully when true.
 *
 * @returns true if shutdown requested
 */
export function shouldAbort(): boolean {
    return state.isShuttingDown;
}

/**
 * Register a cleanup function
 *
 * Cleanup functions are called before exit, in registration order.
 * Use for closing database connections, saving state, etc.
 *
 * @param fn Async function to call on shutdown
 */
export function registerCleanup(fn: () => Promise<void>): void {
    state.cleanupFunctions.push(fn);
}

/**
 * Unregister a cleanup function
 *
 * Call when a resource has been properly closed/released.
 *
 * @param fn Function to remove from cleanup list
 */
export function unregisterCleanup(fn: () => Promise<void>): void {
    const index = state.cleanupFunctions.indexOf(fn);
    if (index !== -1) {
        state.cleanupFunctions.splice(index, 1);
    }
}

/**
 * Reset all signal handler state
 *
 * For testing purposes only.
 * Note: Does not unregister process signal handlers.
 */
export function resetState(): void {
    state.isShuttingDown = false;
    state.interruptCount = 0;
    state.cleanupFunctions = [];
    state.ttyOverride = null;
    state.exitOverride = null;
}

/**
 * Set shutdown state directly
 *
 * For testing purposes only.
 *
 * @param shutting Whether to set shutdown state
 */
export function setShuttingDown(shutting: boolean): void {
    state.isShuttingDown = shutting;
}

/**
 * Get current interrupt count
 *
 * For testing purposes only.
 *
 * @returns Number of interrupt signals received
 */
export function getInterruptCount(): number {
    return state.interruptCount;
}

/**
 * Increment interrupt count
 *
 * For testing purposes only.
 */
export function incrementInterruptCount(): void {
    state.interruptCount++;
}

/**
 * Get cleanup function count
 *
 * For testing purposes only.
 *
 * @returns Number of registered cleanup functions
 */
export function getCleanupCount(): number {
    return state.cleanupFunctions.length;
}
