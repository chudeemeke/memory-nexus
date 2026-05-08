/**
 * Tests for the env-overrides helper.
 *
 * Verifies the load-bearing properties:
 *  - cleanup() restores ONLY keys touched by set()/unset() (not a fixed list)
 *  - set() then cleanup() restores the original value, including "was unset"
 *  - unset() then cleanup() restores the original value, including "was set"
 *  - Repeated set() on the same key does not corrupt the snapshot
 *  - cleanup() is idempotent
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { installEnvOverrides, type PathEnvKey } from "./env-overrides.js";

const KEYS_UNDER_TEST: readonly PathEnvKey[] = [
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "MEMORY_HOME",
];

describe("installEnvOverrides", () => {
    // Outer save/restore: protect the surrounding env from these tests
    // (which deliberately mutate the very keys the helper manages).
    let outerSaved: Partial<Record<PathEnvKey, string | undefined>> = {};

    beforeEach(() => {
        outerSaved = {};
        for (const key of KEYS_UNDER_TEST) {
            outerSaved[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of KEYS_UNDER_TEST) {
            const v = outerSaved[key];
            if (v === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = v;
            }
        }
    });

    test("set() then cleanup() restores prior unset state", () => {
        const env = installEnvOverrides();
        env.set("MEMORY_HOME", "/tmp/x");
        expect(process.env.MEMORY_HOME).toBe("/tmp/x");

        env.cleanup();
        expect(process.env.MEMORY_HOME).toBeUndefined();
    });

    test("set() then cleanup() restores prior set value", () => {
        process.env.XDG_CONFIG_HOME = "/original";

        const env = installEnvOverrides();
        env.set("XDG_CONFIG_HOME", "/override");
        expect(process.env.XDG_CONFIG_HOME).toBe("/override");

        env.cleanup();
        expect(process.env.XDG_CONFIG_HOME).toBe("/original");
    });

    test("unset() then cleanup() restores prior set value", () => {
        process.env.XDG_DATA_HOME = "/original";

        const env = installEnvOverrides();
        env.unset("XDG_DATA_HOME");
        expect(process.env.XDG_DATA_HOME).toBeUndefined();

        env.cleanup();
        expect(process.env.XDG_DATA_HOME).toBe("/original");
    });

    test("repeated set() on same key snapshots only once (original preserved)", () => {
        process.env.MEMORY_HOME = "/start";

        const env = installEnvOverrides();
        env.set("MEMORY_HOME", "/mid");
        env.set("MEMORY_HOME", "/end");
        expect(process.env.MEMORY_HOME).toBe("/end");

        env.cleanup();
        expect(process.env.MEMORY_HOME).toBe("/start");
    });

    test("cleanup() restores ONLY keys touched (untouched keys unaffected)", () => {
        process.env.XDG_CONFIG_HOME = "/cfg-original";
        process.env.XDG_DATA_HOME = "/data-original";

        const env = installEnvOverrides();
        env.set("XDG_CONFIG_HOME", "/cfg-override");
        // Note: XDG_DATA_HOME is NEVER touched by `env`.

        // Some other code mutates XDG_DATA_HOME outside the helper.
        process.env.XDG_DATA_HOME = "/data-mutated-externally";

        env.cleanup();

        // Touched key restored to its original.
        expect(process.env.XDG_CONFIG_HOME).toBe("/cfg-original");
        // Untouched key NOT restored — helper has no knowledge of it.
        expect(process.env.XDG_DATA_HOME).toBe("/data-mutated-externally");
    });

    test("cleanup() is idempotent (second call is no-op)", () => {
        const env = installEnvOverrides();
        env.set("MEMORY_HOME", "/tmp/y");

        env.cleanup();
        expect(process.env.MEMORY_HOME).toBeUndefined();

        // Mutate after cleanup; second cleanup must not undo it.
        process.env.MEMORY_HOME = "/tmp/z";
        env.cleanup();
        expect(process.env.MEMORY_HOME).toBe("/tmp/z");
    });

    test("set() then unset() then cleanup() restores prior value", () => {
        process.env.XDG_CONFIG_HOME = "/seed";

        const env = installEnvOverrides();
        env.set("XDG_CONFIG_HOME", "/intermediate");
        env.unset("XDG_CONFIG_HOME");
        expect(process.env.XDG_CONFIG_HOME).toBeUndefined();

        env.cleanup();
        expect(process.env.XDG_CONFIG_HOME).toBe("/seed");
    });

    test("two independent helper sessions do not share state", () => {
        const a = installEnvOverrides();
        const b = installEnvOverrides();

        a.set("MEMORY_HOME", "/a");
        b.set("XDG_DATA_HOME", "/b");

        a.cleanup();
        expect(process.env.MEMORY_HOME).toBeUndefined();
        // b's mutations untouched.
        expect(process.env.XDG_DATA_HOME).toBe("/b");

        b.cleanup();
        expect(process.env.XDG_DATA_HOME).toBeUndefined();
    });
});
