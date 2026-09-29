import {afterEach, beforeEach, describe, expect, it, spyOn} from "bun:test";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {createOwnedTestDirectory} from "../../../../tests/helpers/owned-test-directory.js";
import {executeInstallCommand} from "./install.js";
import {installHooks, uninstallHooks, type PathOverrides} from "../../../infrastructure/hooks/settings-manager.js";

describe("hook install admission", () => {
  let owned: ReturnType<typeof createOwnedTestDirectory>;
  let paths: Required<PathOverrides>;
  let source: string;
  let log: ReturnType<typeof spyOn>;
  let error: ReturnType<typeof spyOn>;
  beforeEach(() => {
    owned = createOwnedTestDirectory("memory-install-admission-");
    paths = {settingsPath: join(owned.dir, "settings.json"), backupPath: join(owned.dir, "backup.json"), hookScriptPath: join(owned.dir, "hook.js")};
    source = join(owned.dir, "source.js");
    writeFileSync(source, "// new script");
    writeFileSync(paths.hookScriptPath, "// old script");
    writeFileSync(paths.backupPath, "previous backup");
    log = spyOn(console, "log").mockImplementation(() => {});
    error = spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { log.mockRestore(); error.mockRestore(); owned.cleanup(); });

  it("refuses malformed settings before replacing the existing hook or backup", async () => {
    writeFileSync(paths.settingsPath, "{sensitive invalid input");
    const result = await executeInstallCommand({force: true}, {hookOverrides: paths, hookScriptSourceOverride: source});
    expect(result.exitCode).toBe(1);
    expect(readFileSync(paths.settingsPath, "utf8")).toBe("{sensitive invalid input");
    expect(readFileSync(paths.hookScriptPath, "utf8")).toBe("// old script");
    expect(readFileSync(paths.backupPath, "utf8")).toBe("previous backup");
    expect(error.mock.calls.flat().join(" ")).not.toContain("sensitive");
  });

  it("refuses a backup directory before replacing the hook", async () => {
    writeFileSync(paths.settingsPath, '{"unrelated":"keep"}');
    const backupPath = join(owned.dir, "backup-directory");
    mkdirSync(backupPath);
    const result = await executeInstallCommand({force: true}, {hookOverrides: {...paths, backupPath}, hookScriptSourceOverride: source});
    expect(result.exitCode).toBe(1);
    expect(readFileSync(paths.hookScriptPath, "utf8")).toBe("// old script");
    expect(readFileSync(paths.settingsPath, "utf8")).toBe('{"unrelated":"keep"}');
    expect(existsSync(backupPath)).toBe(true);
  });

  for (const action of [installHooks, uninstallHooks]) {
    it(`${action.name} refuses malformed input through the direct API`, () => {
      writeFileSync(paths.settingsPath, "{invalid");
      expect(() => action(paths)).toThrow();
      expect(readFileSync(paths.settingsPath, "utf8")).toBe("{invalid");
      expect(readFileSync(paths.backupPath, "utf8")).toBe("previous backup");
    });
  }

  for (const input of ['null', '[]', '{"hooks":null}', '{"hooks":{"SessionEnd":{}}}', '{"hooks":{"SessionEnd":[{"hooks":[{}]}]}}']) {
    it(`preserves every target when the settings shape is invalid: ${input}`, async () => {
      writeFileSync(paths.settingsPath, input);
      expect((await executeInstallCommand({}, {hookOverrides: paths, hookScriptSourceOverride: source})).exitCode).toBe(1);
      expect(readFileSync(paths.settingsPath, "utf8")).toBe(input);
      expect(readFileSync(paths.hookScriptPath, "utf8")).toBe("// old script");
      expect(readFileSync(paths.backupPath, "utf8")).toBe("previous backup");
      expect(log.mock.calls).toHaveLength(0);
    });
  }

  for (const key of ["backupPath", "hookScriptPath"] as const) {
    it(`refuses ${key} aliasing settings before mutation`, async () => {
      writeFileSync(paths.settingsPath, '{"keep":true}');
      const aliases = {...paths, [key]: paths.settingsPath};
      expect((await executeInstallCommand({force: true}, {hookOverrides: aliases, hookScriptSourceOverride: source})).exitCode).toBe(1);
      expect(readFileSync(paths.settingsPath, "utf8")).toBe('{"keep":true}');
      expect(readFileSync(paths.hookScriptPath, "utf8")).toBe("// old script");
      expect(readFileSync(paths.backupPath, "utf8")).toBe("previous backup");
    });
  }
});
