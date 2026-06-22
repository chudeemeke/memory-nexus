import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { execFileSync } from "node:child_process";

const packageSpec = process.argv[2] ?? "@chude/memory@4.0.2";
const packageName = packageSpec.replace(/@\d+\.\d+\.\d+(?:[-+].*)?$/, "");
const expectedVersion = packageSpec.match(/@(\d+\.\d+\.\d+(?:[-+][^@]+)?)$/)?.[1];

function run(command: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32" && command.endsWith(".cmd"),
  }).trim();
}

function findMemoryBinary(dirs: string[]): string {
  const names = process.platform === "win32"
    ? ["memory.exe", "memory.cmd", "memory"]
    : ["memory", "memory.exe", "memory.cmd"];

  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }

  throw new Error(`memory binary not found in: ${dirs.join(", ")}`);
}

function verifyVersion(label: string, command: string, env?: NodeJS.ProcessEnv): void {
  const actual = run(command, ["--version"], env);
  if (expectedVersion && actual !== expectedVersion) {
    throw new Error(`${label} returned version ${actual}, expected ${expectedVersion}`);
  }
  console.log(`${label}: ${actual}`);
}

const root = mkdtempSync(join(tmpdir(), "memory-published-smoke-"));

try {
  const registry = JSON.parse(run("npm", ["view", packageName, "version", "dist-tags", "--json"])) as {
    version?: string;
    "dist-tags"?: Record<string, string>;
  };
  if (expectedVersion && registry.version !== expectedVersion) {
    throw new Error(`registry returned version ${registry.version}, expected ${expectedVersion}`);
  }
  console.log(`registry: ${registry.version} latest=${registry["dist-tags"]?.latest ?? "<none>"}`);

  const npmPrefix = join(root, "npm-prefix");
  run("npm", ["install", "-g", packageSpec, "--prefix", npmPrefix]);
  const npmBinary = findMemoryBinary([npmPrefix, join(npmPrefix, "bin")]);
  verifyVersion("npm global", npmBinary);

  const bunInstall = join(root, "bun-install");
  const bunBin = join(bunInstall, "bin");
  const bunEnv = {
    BUN_INSTALL: bunInstall,
    PATH: `${bunBin}${delimiter}${process.env.PATH ?? ""}`,
  };
  run("bun", ["add", "-g", packageSpec], bunEnv);
  const resolvedBunBin = run("bun", ["pm", "bin", "-g"], bunEnv);
  const bunBinary = findMemoryBinary([resolvedBunBin, bunBin]);
  verifyVersion("bun global", bunBinary, bunEnv);

  console.log("published package smoke: PASS");
} finally {
  rmSync(root, { recursive: true, force: true });
}
