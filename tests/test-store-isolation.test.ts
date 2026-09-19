import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

test("an unconfigured programmatic friction test cannot create a database in the inherited user home", () => {
  const root = mkdtempSync(join(tmpdir(), "memory-test-store-proof-"));
  const inheritedHome = join(root, "user-home");
  mkdirSync(inheritedHome);
  mkdirSync(join(inheritedHome, ".claude"));
  const sentinel = "inherited friction content must remain byte-identical";
  writeFileSync(join(inheritedHome, ".claude", "friction.jsonl"), sentinel);
  const report = join(root, "child-home.json");
  const fixture = join(root, "isolated-case.test.ts");
  const commandUrl = pathToFileURL(resolve("src/presentation/cli/commands/friction/index.ts")).href;
  writeFileSync(fixture, `import { test, expect } from "bun:test";
import { writeFileSync } from "node:fs";
import { executeFrictionCommand } from ${JSON.stringify(commandUrl)};
test("default command storage", async () => {
  writeFileSync(${JSON.stringify(report)}, JSON.stringify({home: process.env.HOME}));
  const result = await executeFrictionCommand({ action: "log", description: "test isolation probe" });
  expect(result.exitCode).toBe(0);
});`);
  const env = { ...process.env, HOME: inheritedHome, USERPROFILE: inheritedHome };
  delete env.XDG_DATA_HOME;
  delete env.XDG_CONFIG_HOME;
  delete env.MEMORY_HOME;
  try {
    const child = spawnSync("bun", ["test", fixture], { cwd: resolve("."), env, encoding: "utf8", timeout: 30_000 });
    expect(child.status, child.stderr).toBe(0);
    expect(existsSync(join(inheritedHome, ".local/share/memory/memory.db"))).toBe(false);
    expect(existsSync(join(inheritedHome, ".config/memory"))).toBe(false);
    // Bun can initialize its own .bun cache before the preload executes.
    expect(readdirSync(inheritedHome).filter(name => name !== ".bun")).toEqual([".claude"]);
    expect(readFileSync(join(inheritedHome, ".claude", "friction.jsonl"), "utf8")).toBe(sentinel);
    const { home } = JSON.parse(readFileSync(report, "utf8"));
    expect(resolve(home).startsWith(join(tmpdir(), "memory-test-home-"))).toBe(true);
    if (existsSync(home)) {
      const owner = JSON.parse(readFileSync(join(home, ".memory-test-owner.json"), "utf8"));
      expect(owner.project).toBe("memory-nexus");
      expect(owner.pid).toBe(child.pid);
      // The child has exited and this exact path and owner have been verified.
      rmSync(home, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 40_000);

test("test-home ownership survives between files in the same test process", () => {
  const root = mkdtempSync(join(tmpdir(), "memory-test-lifecycle-proof-"));
  const files = ["first.test.ts", "second.test.ts"].map(name => join(root, name));
  const source = `import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
test("owned home remains available", () => {
  expect(existsSync(join(process.env.HOME!, ".memory-test-owner.json"))).toBe(true);
});`;
  try {
    for (const file of files) writeFileSync(file, source);
    const child = spawnSync("bun", ["test", ...files], { cwd: resolve("."), env: { ...process.env }, encoding: "utf8", timeout: 30_000 });
    expect(child.status, child.stderr).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 40_000);
