import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { discoverInventory, sourceHash, validateInventory } from "./quality-inventory";

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "memory-quality-inventory-"));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}

test("discovers both tracked and new source with the nearest package boundary", () => {
  const root = fixture({
    "package.json": '{"name":"root-package"}',
    ".gitignore": "node_modules/\n",
    "src/index.ts": "export const value = 1;",
    "nested/package.json": '{"name":"nested-package"}',
    "nested/cli.js": "console.log('fixture');",
    "node_modules/ignored.js": "throw new Error('must not inspect dependency');",
  });
  try {
    execFileSync("git", ["add", "package.json", ".gitignore", "src/index.ts"], { cwd: root });
    const catalog = discoverInventory(root);
    expect(catalog.files.map(file => file.path)).toEqual(["nested/cli.js", "src/index.ts"]);
    expect(catalog.files.map(file => file.package)).toEqual(["nested/package.json", "package.json"]);
    expect(catalog.packages.map(pkg => pkg.name)).toEqual(["nested-package", "root-package"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("includes unfamiliar executable modes and shebangs without pretending they are instrumentable JavaScript", () => {
  const root = fixture({ "package.json": '{"name":"fixture"}', "tools/task": "echo fixture", "tools/probe.custom": "#!/usr/bin/env python\nprint('fixture')" });
  try {
    execFileSync("git", ["add", "tools/task"], { cwd: root });
    execFileSync("git", ["update-index", "--chmod=+x", "tools/task"], { cwd: root });
    expect(discoverInventory(root).files.map(file => [file.path, file.syntax])).toEqual([["tools/probe.custom", "unsupported"], ["tools/task", "unsupported"]]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("declaration suffixes cannot hide executable content", () => {
  const root = fixture({ "package.json": '{"name":"fixture"}', "real.d.ts": "export declare function run(): void;", "deceptive.d.ts": "console.log('runtime');" });
  try {
    expect(discoverInventory(root).files.map(file => [file.path, file.syntax])).toEqual([["deceptive.d.ts", "executable"], ["real.d.ts", "no-local-code"]]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects an omitted executable even when every listed classification looks valid", () => {
  const root = fixture({ "package.json": '{"name":"fixture"}', "src/a.ts": "export const a = 1;", "src/b.ts": "export const b = 2;" });
  try {
    const catalog = discoverInventory(root);
    const manifest = { schemaVersion: 1, packages: catalog.packages, files: [{ ...catalog.files[0], tier: "A", rationale: "Exports the fixture value", applicability: { mode: "measure", reason: "Executable value initialization" } }] };
    expect(validateInventory(catalog, manifest)).toContain("Missing classification: src/b.ts");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("classifies actual syntax rather than index, types or test-support names", () => {
  const root = fixture({
    "package.json": '{"name":"fixture"}',
    "src/ports.ts": "export interface Port { run(): void }",
    "src/types.ts": "export const schema = { validate: (v: string) => v.length > 0 };",
    "src/index.ts": "export const timestamp = Date.now();",
    "src/import-only.ts": 'import { value } from "effectful-module"; export interface Marker {}',
    "src/barrel.ts": 'export { schema } from "./types"; export type { Port } from "./ports";',
    "tests/support.ts": 'import { afterEach } from "bun:test"; export function install() { afterEach(() => {}); }',
    "tests/suite.ts": 'import { test as check, expect } from "bun:test"; check("case", () => expect(1).toBe(1));',
    "report.html": '<html><script>document.title = "fixture";</script></html>',
  });
  try {
    expect(Object.fromEntries(discoverInventory(root).files.map(file => [file.path, file.syntax]))).toEqual({
      "report.html": "browser-code", "src/barrel.ts": "re-export", "src/index.ts": "executable",
      "src/import-only.ts": "executable",
      "src/ports.ts": "no-local-code", "src/types.ts": "executable",
      "tests/suite.ts": "test-driver", "tests/support.ts": "executable",
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("manifest admission rejects stale, duplicate, malformed, misplaced and falsely exempt code", () => {
  const root = fixture({ "package.json": '{"name":"fixture"}', "src/main.ts": "export const value = 1;", "doc.html": '<script src="fixture.js"></script>' });
  try {
    const catalog = discoverInventory(root);
    const good = { schemaVersion: 1, packages: catalog.packages, files: catalog.files.map(file => ({
      ...file, tier: "A", rationale: "Fixture behavior for admission checks", applicability: { mode: file.syntax === "browser-code" ? "external-runtime" : "measure", reason: "Measure in the actual execution runtime" },
    })) };
    expect(validateInventory(catalog, good)).toEqual([]);
    const corruptions: Array<[string, (value: any) => void]> = [
      ["Malformed inventory manifest", m => { m.schemaVersion = 2; }],
      ["Malformed inventory manifest", m => { m.files = null; }],
      ["Malformed classification entry", m => { m.files.push(null); }],
      ["Duplicate classification: src/main.ts", m => { m.files.push(m.files[1]); }],
      ["Unknown classification: ../outside.ts", m => { m.files.push({ path: "../outside.ts" }); }],
      ["Stale classification: src/main.ts", m => { m.files[1].sourceHash = "0"; }],
      ["Wrong package boundary: src/main.ts", m => { m.files[1].package = "foreign/package.json"; }],
      ["Unknown risk tier: src/main.ts", m => { m.files[1].tier = "unclassified"; }],
      ["Missing risk rationale: src/main.ts", m => { m.files[1].rationale = " "; }],
      ["Missing or invalid applicability: src/main.ts", m => { m.files[1].applicability = []; }],
      ["Missing or invalid applicability: src/main.ts", m => { m.files[1].applicability.reason = ""; }],
      ["Missing or invalid applicability: src/main.ts", m => { m.files[1].applicability.mode = "waived"; }],
      ["Executable cannot claim no local code: src/main.ts", m => { m.files[1].applicability.mode = "no-local-code"; }],
      ["Separate runtime measurement required: doc.html", m => { m.files[0].applicability.mode = "measure"; }],
      ["Missing package: package.json", m => { m.packages = []; }],
      ["Stale package: package.json", m => { m.packages[0].sourceHash = "stale"; }],
      ["Wrong package name: package.json", m => { m.packages[0].name = "wrong"; }],
    ];
    for (const [message, corrupt] of corruptions) {
      const candidate = structuredClone(good);
      corrupt(candidate);
      expect(validateInventory(catalog, candidate), message).toContain(message);
    }
    for (const malformed of [null, [], false, 1]) expect(validateInventory(catalog, malformed)).toEqual(["Malformed inventory manifest"]);
    writeFileSync(join(root, "src/main.ts"), "export const value = 2;");
    expect(validateInventory(discoverInventory(root), good)).toContain("Stale classification: src/main.ts");
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30000);

test("source directory links fail closed while a canonical repository-root alias works", () => {
  const root = fixture({ "package.json": '{"name":"fixture"}', "src/value.ts": "export const value = 1;" });
  const outside = mkdtempSync(join(tmpdir(), "memory-quality-outside-"));
  const alias = join(outside, "repo-alias");
  try {
    symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");
    expect(discoverInventory(alias).files.map(file => file.path)).toEqual(["src/value.ts"]);
    writeFileSync(join(outside, "sentinel.ts"), "export const valuable = true;");
    symlinkSync(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    // Git reports a directory link itself rather than traversing its target.
    expect(() => discoverInventory(root)).toThrow("linked or special files");
    const cli = spawnSync(process.execPath, [resolve(import.meta.dir, "check-quality-inventory.ts"), "--catalog"], { cwd: root, encoding: "utf8" });
    expect(cli.status).toBe(2);
    expect(cli.stderr).not.toContain("Filename too long");
    expect(cli.stderr).not.toContain("linked/repo-alias/");
    expect(readFileSync(join(outside, "sentinel.ts"), "utf8")).toBe("export const valuable = true;");
  } finally {
    // Remove the aliases first; both real roots were exclusively created by this test.
    rmSync(alias, { recursive: true, force: true });
    rmSync(join(root, "linked"), { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}, 30000);

test.each([
  ["package.json", "[]", "Invalid package manifest"],
  ["src/broken.ts", "export function {", "Cannot classify invalid source"],
])("invalid input cannot produce an apparently complete catalog: %s", (path, value, message) => {
  const root = fixture({ "package.json": '{"name":"fixture"}', [path]: value });
  try { expect(() => discoverInventory(root)).toThrow(message); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("a subdirectory cannot silently omit the rest of its repository", () => {
  const root = fixture({ "package.json": '{"name":"fixture"}', "src/value.ts": "export const value = 1;" });
  try { expect(() => discoverInventory(join(root, "src"))).toThrow("requires the repository root"); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("the actual inventory CLI emits a catalog and rejects omitted classifications", () => {
  const root = fixture({ "package.json": '{"name":"fixture"}', "src/value.ts": "export const value = 1;" });
  const cli = resolve(import.meta.dir, "check-quality-inventory.ts");
  try {
    const catalogRun = spawnSync(process.execPath, [cli, "--catalog"], { cwd: root, encoding: "utf8" });
    expect(catalogRun.status, catalogRun.stderr).toBe(0);
    const catalog = JSON.parse(catalogRun.stdout);
    expect(catalog.files.map((file: {path: string}) => file.path)).toEqual(["src/value.ts"]);
    writeFileSync(join(root, "inventory.json"), JSON.stringify({ schemaVersion: 1, packages: catalog.packages, files: [] }));
    const check = spawnSync(process.execPath, [cli, "--check", "inventory.json"], { cwd: root, encoding: "utf8" });
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("Missing classification: src/value.ts");
    writeFileSync(join(root, "inventory.json"), JSON.stringify({ schemaVersion: 1, packages: catalog.packages, files: catalog.files.map((file: object) => ({ ...file, tier: "A", rationale: "Fixture value", applicability: { mode: "measure", reason: "Executable initialization" } })) }));
    const valid = spawnSync(process.execPath, [cli, "--check", "inventory.json"], { cwd: root, encoding: "utf8" });
    expect(valid.status, valid.stderr).toBe(0);
    expect(valid.stdout).toContain("Independent review remains required");
    const invalidFlag = spawnSync(process.execPath, [cli, "--unknown"], { cwd: root, encoding: "utf8" });
    expect(invalidFlag.status).toBe(2);
    expect(invalidFlag.stderr).toContain("Usage:");
    writeFileSync(join(root, "inventory.json"), "not json");
    const malformed = spawnSync(process.execPath, [cli, "--check", "inventory.json"], { cwd: root, encoding: "utf8" });
    expect(malformed.status).toBe(2);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30000);

test("nested ignore rules preserve tracked source and omit ignored untracked trees", () => {
  const root = fixture({ "package.json": '{"name":"fixture"}', ".gitignore": "tracked.ts\n", "tracked.ts": "export const kept = 1;",
    "nested/package.json": '{"name":"nested"}', "nested/.gitignore": "generated/\n", "nested/main.ts": "export const main = 1;", "nested/generated/ignored.ts": "invalid TypeScript ignored intentionally" });
  try {
    execFileSync("git", ["add", "--force", "tracked.ts"], { cwd: root });
    expect(discoverInventory(root).files.map(file => file.path)).toEqual(["nested/main.ts", "tracked.ts"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test.skipIf(process.platform === "win32")("case-colliding paths fail before producing a Windows-incompatible catalog", () => {
  const root = fixture({ "package.json": '{"name":"fixture"}', "Case.ts": "export const a = 1;", "case.ts": "export const b = 1;" });
  try { expect(() => discoverInventory(root)).toThrow("Case-colliding inventory path"); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("source binding tolerates checkout line endings but rejects changed content", () => {
  expect(sourceHash("export const value = 1;\r\n")).toBe(sourceHash("export const value = 1;\n"));
  expect(sourceHash("export const value = 1;\n")).not.toBe(sourceHash("export const value = 2;\n"));
});
