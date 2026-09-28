import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { cpSync, copyFileSync, existsSync, mkdirSync, symlinkSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createOwnedTestDirectory } from "../helpers/owned-test-directory.js";

describe("normal package hook delivery", () => {
  const root = resolve(import.meta.dir, "../..");
  let storage: ReturnType<typeof createOwnedTestDirectory>;
  let buildExit: number;
  let buildOutput: string;
  beforeAll(() => {
    storage = createOwnedTestDirectory("memory-hook-build-");
    cpSync(join(root, "src"), join(storage.dir, "src"), { recursive: true });
    mkdirSync(join(storage.dir, "scripts"));
    copyFileSync(join(root, "scripts", "clean-dist.ts"), join(storage.dir, "scripts", "clean-dist.ts"));
    for (const file of ["package.json", "tsconfig.json", "tsconfig.lib.json"]) {
      copyFileSync(join(root, file), join(storage.dir, file));
    }
    symlinkSync(join(root, "node_modules"), join(storage.dir, "node_modules"), "junction");
    const result = Bun.spawnSync([process.execPath, "run", "build"], {
      cwd: storage.dir,
      env: { ...process.env, TEMP: storage.dir, TMP: storage.dir, TMPDIR: storage.dir },
      stdout: "pipe", stderr: "pipe", timeout: 120000,
    });
    buildExit = result.exitCode;
    buildOutput = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
  }, 150000);
  afterAll(() => { storage.cleanup(); });

  it("includes the runtime hook in a clean normal build", () => {
    expect(buildOutput).not.toContain("error TS");
    expect(buildExit).toBe(0);
    expect(existsSync(join(storage.dir, "dist", "sync-hook.js"))).toBe(true);
  });

  for (const entrypoint of ["cli", "library"] as const) {
  it(`${entrypoint} installs and executes its own hook from an unrelated working directory`, () => {
    const home = join(storage.dir, `home-${entrypoint}`);
    const unrelated = join(storage.dir, `unrelated-${entrypoint}`);
    mkdirSync(home);
    mkdirSync(join(home, ".claude"));
    writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ fixture: "preserved" }));
    mkdirSync(join(unrelated, "dist"), { recursive: true });
    writeFileSync(join(unrelated, "dist", "sync-hook.js"), "throw new Error('unrelated script');");
    const driver = join(unrelated, "install-library.ts");
    writeFileSync(driver, `import {executeInstallCommand} from ${JSON.stringify(join(storage.dir, "dist", "index.js").replaceAll("\\", "/"))}; process.exitCode=(await executeInstallCommand({})).exitCode;`);
    const cli = join(storage.dir, "dist", "presentation", "cli", "index.js");
    const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_DATA_HOME: join(home, "data"), XDG_CONFIG_HOME: join(home, "config"), MEMORY_HOME: join(home, "authored"), TEMP: storage.dir, TMP: storage.dir, TMPDIR: storage.dir };
    const result = Bun.spawnSync(entrypoint === "cli" ? [process.execPath, cli, "install"] : [process.execPath, driver], {
      cwd: unrelated,
      env,
      stdout: "pipe", stderr: "pipe", timeout: 30000,
    });
    expect(result.exitCode).toBe(0);
    const hookPath = join(home, "data", "memory", "hooks", "sync-hook.js");
    const installed = readFileSync(hookPath);
    expect(installed.equals(readFileSync(join(storage.dir, "dist", "sync-hook.js")))).toBe(true);
    const settings = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
    expect(settings.fixture).toBe("preserved");
    expect(settings.hooks.SessionEnd[0].hooks[0].command).toBe(`bun run "${hookPath.replaceAll("\\", "/")}"`);
    const hook = Bun.spawnSync([process.execPath, "run", hookPath], {
      cwd: unrelated, env, stdin: Buffer.from(JSON.stringify({ hook_event_name: "PreCompact" })),
      stdout: "pipe", stderr: "pipe", timeout: 30000,
    });
    expect(hook.exitCode).toBe(0);
    expect(new TextDecoder().decode(hook.stdout)).toContain("MEMORY FLUSH");
    expect(readFileSync(join(home, "data", "memory", "logs", "sync.log"), "utf8")).toContain("No session_id in PreCompact hook input");
    const uninstall = Bun.spawnSync([process.execPath, cli, "uninstall"], { cwd: unrelated, env, stdout: "pipe", stderr: "pipe", timeout: 30000 });
    expect(uninstall.exitCode).toBe(0);
    expect(existsSync(hookPath)).toBe(false);
    const restored = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
    expect(restored.fixture).toBe("preserved");
    expect(restored.hooks?.SessionEnd).toBeUndefined();
  });
  }
});
