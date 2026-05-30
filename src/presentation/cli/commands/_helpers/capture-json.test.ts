import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { cleanupTempPaths, captureStreams, makeTempDbPath } from "./capture-json.js";

describe("capture-json test helpers", () => {
  const tempPaths: string[] = [];

  afterEach(() => {
    cleanupTempPaths(tempPaths);
  });

  it("captures stdout, stderr, non-string arguments, and returned exit code", async () => {
    const captured = await captureStreams(async () => {
      console.log("status", 200, { ok: true });
      console.error("warning", false);
      return { exitCode: 7 };
    });

    expect(captured).toEqual({
      stdout: "status 200 [object Object]",
      stderr: "warning false",
      exitCode: 7,
    });
  });

  it("omits exitCode when the command returns undefined", async () => {
    const captured = await captureStreams(async () => {
      console.log("done");
      return undefined;
    });

    expect(captured.stdout).toBe("done");
    expect(captured.stderr).toBe("");
    expect("exitCode" in captured).toBe(false);
  });

  it("restores console methods after a captured command throws", async () => {
    const originalLog = console.log;
    const originalError = console.error;

    await expect(captureStreams(async () => {
      console.log("before throw");
      throw new Error("boom");
    })).rejects.toThrow("boom");

    expect(console.log).toBe(originalLog);
    expect(console.error).toBe(originalError);
  });

  it("tracks and cleans database sidecar paths", () => {
    const dbPath = makeTempDbPath("helper", tempPaths);
    writeFileSync(dbPath, "");
    writeFileSync(`${dbPath}-wal`, "");
    writeFileSync(`${dbPath}-shm`, "");

    expect(tempPaths).toEqual([dbPath]);

    cleanupTempPaths(tempPaths);

    expect(tempPaths).toEqual([]);
    expect(existsSync(dbPath)).toBe(false);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
  });
});
