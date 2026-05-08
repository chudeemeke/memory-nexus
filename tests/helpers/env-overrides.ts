/**
 * Test helper: scoped env-var overrides with safe restore.
 *
 * Replaces the deprecated setTestPaths()/resetTestPaths() seam in paths.ts.
 * Tests that need to redirect path resolution mutate process.env via this
 * helper; cleanup() restores ONLY the keys the test touched, not a fixed
 * list. This prevents over-restoration if a test deliberately leaves a key
 * unset, and keeps the static test-isolation gate's surface small.
 *
 * Concurrency contract:
 *   This helper mutates process.env, which is process-wide global state.
 *   Tests using this helper MUST run sequentially. They are NOT compatible
 *   with `bun test --concurrent`, `test.concurrent`, or any future config
 *   that runs test files in parallel within a single process.
 *
 * Usage:
 *   const env = installEnvOverrides();
 *   beforeEach(() => {
 *     env.set("MEMORY_HOME", tempDir);
 *   });
 *   afterEach(() => {
 *     env.cleanup();
 *   });
 *
 * Or one-shot per test:
 *   test("...", () => {
 *     const env = installEnvOverrides();
 *     try {
 *       env.set("XDG_DATA_HOME", "/tmp/xyz");
 *       // ...assertions
 *     } finally {
 *       env.cleanup();
 *     }
 *   });
 */

/**
 * Env vars consumed by paths.ts. Add to this union when paths.ts grows
 * a new env-var-driven knob; the static check then catches unknown keys
 * at type level.
 */
export type PathEnvKey =
    | "XDG_CONFIG_HOME"
    | "XDG_DATA_HOME"
    | "MEMORY_HOME"
    | "HOME"
    | "USERPROFILE";

export interface EnvOverrides {
    /**
     * Set an env var to a value. Snapshots the prior value on first touch
     * for that key; subsequent set/unset calls do not re-snapshot.
     */
    set(key: PathEnvKey, value: string): void;

    /**
     * Delete an env var. Snapshots the prior value on first touch.
     */
    unset(key: PathEnvKey): void;

    /**
     * Restore every key that was set or unset since installation, then
     * forget the snapshots. Safe to call multiple times; the second call
     * is a no-op.
     */
    cleanup(): void;
}

/**
 * Create an env-override session. Each call returns a fresh helper with
 * its own snapshot map.
 */
export function installEnvOverrides(): EnvOverrides {
    const saved = new Map<PathEnvKey, string | undefined>();

    function snapshot(key: PathEnvKey): void {
        if (!saved.has(key)) {
            saved.set(key, process.env[key]);
        }
    }

    return {
        set(key, value) {
            snapshot(key);
            process.env[key] = value;
        },
        unset(key) {
            snapshot(key);
            delete process.env[key];
        },
        cleanup() {
            for (const [key, value] of saved) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
            saved.clear();
        },
    };
}
