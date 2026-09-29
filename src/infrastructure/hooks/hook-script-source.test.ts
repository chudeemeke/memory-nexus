import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, parse } from "node:path";
import { createOwnedTestDirectory } from "../../../tests/helpers/owned-test-directory.js";
import { resolveHookScriptSource } from "./hook-script-source.js";

describe("package-owned hook discovery", () => {
  let storage: ReturnType<typeof createOwnedTestDirectory>;
  beforeEach(() => { storage = createOwnedTestDirectory("memory-hook-source-"); });
  afterEach(() => { storage.cleanup(); });

  function asset() {
    mkdirSync(join(storage.dir, "dist"), { recursive: true });
    const hook = join(storage.dir, "dist", "sync-hook.js");
    writeFileSync(hook, "// owned hook");
    return hook;
  }

  for (const modulePath of ["src/presentation/cli/commands", "dist/presentation/cli", "dist"]) {
    it(`finds the same package asset from ${modulePath}`, () => {
      writeFileSync(join(storage.dir, "package.json"), JSON.stringify({ name: "@chude/memory" }));
      const hook = asset(), moduleDirectory = join(storage.dir, modulePath);
      mkdirSync(moduleDirectory, { recursive: true });
      expect(resolveHookScriptSource(moduleDirectory)).toBe(hook);
    });
  }

  for (const manifest of [null, 1, {}, { name: "unrelated" }]) {
    it(`refuses invalid package identity ${JSON.stringify(manifest)}`, () => {
      asset();
      writeFileSync(join(storage.dir, "package.json"), JSON.stringify(manifest));
      expect(resolveHookScriptSource(storage.dir)).toBeNull();
    });
  }

  it("stops at a foreign nested package instead of using an ancestor asset", () => {
    asset();
    writeFileSync(join(storage.dir, "package.json"), JSON.stringify({ name: "@chude/memory" }));
    const nested = join(storage.dir, "nested");
    mkdirSync(nested);
    writeFileSync(join(nested, "package.json"), JSON.stringify({ name: "foreign" }));
    expect(resolveHookScriptSource(nested)).toBeNull();
  });

  it("refuses malformed and non-file manifests", () => {
    const malformed = join(storage.dir, "malformed"), directory = join(storage.dir, "directory");
    mkdirSync(malformed);
    writeFileSync(join(malformed, "package.json"), "{invalid");
    mkdirSync(join(directory, "package.json"), { recursive: true });
    expect(resolveHookScriptSource(malformed)).toBeNull();
    expect(resolveHookScriptSource(directory)).toBeNull();
  });

  it("refuses absent and directory-valued hook assets", () => {
    writeFileSync(join(storage.dir, "package.json"), JSON.stringify({ name: "@chude/memory" }));
    expect(resolveHookScriptSource(storage.dir)).toBeNull();
    mkdirSync(join(storage.dir, "dist", "sync-hook.js"), { recursive: true });
    expect(resolveHookScriptSource(storage.dir)).toBeNull();
  });

  it("honors only an explicit regular-file override", () => {
    const hook = asset();
    expect(resolveHookScriptSource("relative", hook)).toBe(hook);
    expect(resolveHookScriptSource(storage.dir, storage.dir)).toBeNull();
    expect(resolveHookScriptSource(storage.dir, join(storage.dir, "missing"))).toBeNull();
  });

  it("refuses relative module directories and missing ancestry", () => {
    expect(resolveHookScriptSource("relative")).toBeNull();
    expect(resolveHookScriptSource(parse(storage.dir).root, undefined, {
      stat: () => undefined,
      read: String,
    })).toBeNull();
  });

  it("refuses an unreadable manifest", () => {
    expect(resolveHookScriptSource(storage.dir, undefined, {
      stat: () => ({ isFile: () => true }),
      read: () => { throw new Error("access denied"); },
    })).toBeNull();
  });
});
