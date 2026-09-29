import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { linkSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOwnedTestDirectory } from "../../../tests/helpers/owned-test-directory.js";
import { assertDistinctHookTargets, parseHookSettings, readHookSettingsForMutation } from "./hook-settings-input.js";

describe("hook settings mutation input", () => {
  let owned: ReturnType<typeof createOwnedTestDirectory>;
  beforeEach(() => { owned = createOwnedTestDirectory("memory-hook-input-"); });
  afterEach(() => { owned.cleanup(); });

  it("preserves unrelated fields and command hooks", () => {
    const input = { other: { value: [1, null] }, hooks: { Stop: [{ matcher: "", hooks: [{ type: "command" as const, command: "echo example", timeout: 5, extra: true }] }], SessionEnd: [] } };
    expect(parseHookSettings(JSON.stringify(input))).toEqual(input);
    expect(parseHookSettings('{}')).toEqual({});
  });

  for (const input of ['{secret', 'null', '[]', '1', '"text"', '{"hooks":null}', '{"hooks":[]}', '{"hooks":false}', '{"hooks":{"SessionEnd":{}}}', '{"hooks":{"Stop":[null]}}', '{"hooks":{"Stop":[[]]}}', '{"hooks":{"Stop":[{}]}}', '{"hooks":{"Stop":[{"hooks":[null]}]}}', '{"hooks":{"Stop":[{"hooks":[{}]}]}}', '{"hooks":{"Stop":[{"hooks":[{"command":1}]}]}}']) {
    it(`refuses unsupported settings ${input}`, () => {
      expect(() => parseHookSettings(input)).toThrow();
    });
  }

  it("reads valid settings and treats only missing files as empty", () => {
    const path = join(owned.dir, "settings.json");
    expect(readHookSettingsForMutation(path)).toEqual({});
    writeFileSync(path, '{"keep":true}');
    expect(readHookSettingsForMutation(path)).toEqual({ keep: true });
    writeFileSync(path, '{secret');
    expect(() => readHookSettingsForMutation(path)).toThrow("invalid JSON");
    expect(readFileSync(path, "utf8")).toBe('{secret');
  });

  for (const error of [null, "sensitive read failure", { code: "EACCES", message: "sensitive" }, { message: "sensitive" }]) {
    it(`refuses read failures without exposing input ${JSON.stringify(error)}`, () => {
      expect(() => readHookSettingsForMutation(join(owned.dir, "missing"), () => { throw error; })).toThrow("Cannot read hook settings for mutation.");
    });
  }

  it("refuses directory and linked settings without changing their targets", () => {
    const target = join(owned.dir, "target.json"), symbolic = join(owned.dir, "symbolic.json"), hard = join(owned.dir, "hard.json");
    writeFileSync(target, '{"preserve":true}');
    symlinkSync(target, symbolic, "file");
    linkSync(target, hard);
    for (const path of [owned.dir, symbolic, hard, target]) expect(() => readHookSettingsForMutation(path)).toThrow();
    expect(readFileSync(target, "utf8")).toBe('{"preserve":true}');
  });

  it("requires distinct nonempty normalized paths with platform case policy", () => {
    const a = join(owned.dir, "a"), b = join(owned.dir, "b");
    expect(() => assertDistinctHookTargets([a, b])).not.toThrow();
    expect(() => assertDistinctHookTargets([a, join(owned.dir, "x", "..", "a")])).toThrow("distinct");
    expect(() => assertDistinctHookTargets([a, a.toUpperCase()], "win32")).toThrow("distinct");
    expect(() => assertDistinctHookTargets([a, a.toUpperCase()], "linux")).not.toThrow();
    expect(() => assertDistinctHookTargets([a, " "])).toThrow("empty");
    mkdirSync(b);
    expect(() => assertDistinctHookTargets([a, b])).toThrow();
  });
});
