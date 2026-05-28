#!/usr/bin/env bun
/**
 * Istanbul-backed coverage runner for the Bun test suite.
 *
 * Bun's native coverage currently emits functions and lines only. This harness
 * instruments source before running Bun tests so statements and branches are
 * real Istanbul metrics, not aliases for weaker measurements.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { createCoverageMap, type CoverageMap, type CoverageMapData } from "istanbul-lib-coverage";
import { createContext } from "istanbul-lib-report";
import reports from "istanbul-reports";
import { createInstrumenter } from "istanbul-lib-instrument";

export const COVERAGE_IGNORE_PATTERNS = [
  "node_modules/",
  "dist/",
  "coverage/",
  "coverage-c8/",
  "coverage-vitest-domain/",
  ".git/",
  "tests/",
  ".planning/",
  "scratch/",
  ".coverage-work/",
  ".test.ts",
  ".coverage.test.ts",
] as const;

const COPY_IGNORE_PATTERNS = [
  "node_modules/",
  "dist/",
  "coverage/",
  "coverage-c8/",
  "coverage-vitest-domain/",
  ".git/",
  ".planning/",
  "scratch/",
  ".coverage-work/",
] as const;

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const SAFE_WORK_DIR_PREFIX = "memory-nexus-coverage-work-";
const DEFAULT_WORK_DIR = join(tmpdir(), `${SAFE_WORK_DIR_PREFIX}${process.pid}`);
const DEFAULT_COVERAGE_DIR = join(PROJECT_ROOT, "coverage");
const COVERAGE_JSON = "coverage-final.json";
const BASELINE_JSON = "coverage-baseline.json";

export interface RunnerOptions {
  projectRoot: string;
  workDir: string;
  coverageDir: string;
  testArgs: string[];
}

export interface RunnerResult {
  exitCode: number;
  coverageJsonPath: string;
  coverageSummaryPath: string;
}

export interface InstrumentedSource {
  code: string;
  coverageData: CoverageMapData[string];
}

export function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

export function isCoverageIgnored(relativePath: string, patterns: readonly string[] = COVERAGE_IGNORE_PATTERNS): boolean {
  const normalized = normalizePath(relativePath);
  return patterns.some((pattern) => normalized.includes(pattern));
}

export function instrumentTypeScript(source: string, sourcePath: string): string {
  return instrumentTypeScriptWithCoverage(source, sourcePath).code;
}

export function instrumentTypeScriptWithCoverage(source: string, sourcePath: string): InstrumentedSource {
  const instrumenter = createInstrumenter({
    esModules: true,
    produceSourceMap: false,
    compact: false,
    parserPlugins: ["typescript", "classProperties", "importMeta"],
  });
  const code = instrumenter.instrumentSync(source, sourcePath);
  return {
    code,
    coverageData: instrumenter.lastFileCoverage() as CoverageMapData[string],
  };
}

export function createCoverageSummary(data: CoverageMapData): { coverageMap: CoverageMap } {
  return { coverageMap: createCoverageMap(data) };
}

export function writeCoverageReports(coverageMap: CoverageMap, coverageDir: string): void {
  mkdirSync(coverageDir, { recursive: true });
  const context = createContext({
    dir: coverageDir,
    coverageMap,
    defaultSummarizer: "pkg",
  });

  reports.create("json-summary").execute(context);
  reports.create("lcovonly").execute(context);
  reports.create("text-summary").execute(context);
}

function copyAndInstrument(projectRoot: string, workDir: string): CoverageMapData {
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  cpSync(projectRoot, workDir, {
    recursive: true,
    dereference: false,
    filter(source) {
      const rel = normalizePath(relative(projectRoot, source));
      if (rel === "") return true;
      const suffix = statSync(source).isDirectory() ? "/" : "";
      return !isCoverageIgnored(`${rel}${suffix}`, COPY_IGNORE_PATTERNS);
    },
  });

  disableNativeBunCoverage(workDir);
  linkRuntimeArtifact(projectRoot, workDir, "node_modules");
  linkRuntimeArtifact(projectRoot, workDir, "dist");

  const baseline: CoverageMapData = {};

  for (const file of findTypeScriptFiles(join(workDir, "src"))) {
    const rel = normalizePath(relative(workDir, file));
    if (isCoverageIgnored(rel)) continue;

    const originalPath = join(projectRoot, rel);
    const source = readFileSync(file, "utf-8");
    const instrumented = instrumentTypeScriptWithCoverage(source, originalPath);
    baseline[originalPath] = instrumented.coverageData;
    writeFileSync(file, instrumented.code, "utf-8");
  }

  return baseline;
}

function linkRuntimeArtifact(projectRoot: string, workDir: string, name: string): void {
  const target = join(projectRoot, name);
  const linkPath = join(workDir, name);
  if (!existsSync(target) || existsSync(linkPath)) return;

  symlinkSync(target, linkPath, "junction");
}

function disableNativeBunCoverage(workDir: string): void {
  const bunfigPath = join(workDir, "bunfig.toml");
  if (!existsSync(bunfigPath)) return;

  const content = readFileSync(bunfigPath, "utf-8");
  writeFileSync(bunfigPath, content.replace(/^coverage\s*=\s*true$/m, "coverage = false"), "utf-8");
}

function findTypeScriptFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const name of readdirSync(current)) {
      const entry = join(current, name);
      const stat = statSync(entry);
      if (stat.isDirectory()) {
        stack.push(entry);
      } else if (entry.endsWith(".ts")) {
        files.push(entry);
      }
    }
  }

  return files;
}

function writeCoveragePreload(workDir: string, coverageJsonPath: string, baselineJsonPath: string): string {
  const preloadPath = join(workDir, "coverage-writeout.ts");
  const content = [
    'import { afterAll } from "bun:test";',
    'import { mkdirSync, readFileSync, writeFileSync } from "node:fs";',
    'import { dirname } from "node:path";',
    `const output = ${JSON.stringify(coverageJsonPath)};`,
    `const baseline = JSON.parse(readFileSync(${JSON.stringify(baselineJsonPath)}, 'utf-8')) as Record<string, unknown>;`,
    "function writeCoverage() {",
    "  const runtime = (globalThis as typeof globalThis & { __coverage__?: Record<string, unknown> }).__coverage__ ?? {};",
    "  const coverage = { ...baseline, ...runtime };",
    "  mkdirSync(dirname(output), { recursive: true });",
    "  writeFileSync(output, JSON.stringify(coverage), 'utf-8');",
    "}",
    "afterAll(writeCoverage);",
    "process.on('beforeExit', writeCoverage);",
    "process.on('exit', writeCoverage);",
    "",
  ].join("\n");
  writeFileSync(preloadPath, content, "utf-8");
  return preloadPath;
}

export function parseRunnerArgs(argv: string[]): RunnerOptions {
  const options: RunnerOptions = {
    projectRoot: PROJECT_ROOT,
    workDir: DEFAULT_WORK_DIR,
    coverageDir: DEFAULT_COVERAGE_DIR,
    testArgs: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (!arg) continue;

    if (arg === "--work-dir" && next) {
      options.workDir = resolve(PROJECT_ROOT, next);
      i++;
    } else if (arg === "--coverage-dir" && next) {
      options.coverageDir = resolve(PROJECT_ROOT, next);
      i++;
    } else if (arg === "--") {
      options.testArgs = argv.slice(i + 1);
      break;
    } else {
      options.testArgs.push(arg);
    }
  }

  return options;
}

export function runInstrumentedCoverage(options: RunnerOptions): RunnerResult {
  const projectRoot = resolve(options.projectRoot);
  const workDir = resolve(options.workDir);
  const coverageDir = resolve(options.coverageDir);
  const coverageJsonPath = join(coverageDir, COVERAGE_JSON);
  const baselineJsonPath = join(workDir, BASELINE_JSON);

  if (workDir === projectRoot || projectRoot.startsWith(`${workDir}${sep}`)) {
    throw new Error(`Refusing to use workDir that contains the project root: ${workDir}`);
  }
  if (!basename(workDir).startsWith(SAFE_WORK_DIR_PREFIX) && basename(workDir) !== ".coverage-work") {
    throw new Error(`Refusing to use unsafe workDir name: ${workDir}`);
  }
  if (!coverageDir.startsWith(projectRoot)) {
    throw new Error(`Refusing to use coverageDir outside project root: ${coverageDir}`);
  }

  rmSync(coverageDir, { recursive: true, force: true });
  const baseline = copyAndInstrument(projectRoot, workDir);
  writeFileSync(baselineJsonPath, JSON.stringify(baseline), "utf-8");
  const preloadPath = writeCoveragePreload(workDir, coverageJsonPath, baselineJsonPath);

  const result = spawnSync("bun", ["test", "--preload", preloadPath, ...options.testArgs], {
    cwd: workDir,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });

  if (existsSync(coverageJsonPath)) {
    const coverageData = JSON.parse(readFileSync(coverageJsonPath, "utf-8")) as CoverageMapData;
    const { coverageMap } = createCoverageSummary(coverageData);
    writeCoverageReports(coverageMap, coverageDir);
  }

  return {
    exitCode: typeof result.status === "number" ? result.status : 1,
    coverageJsonPath,
    coverageSummaryPath: join(coverageDir, "coverage-summary.json"),
  };
}

async function main(): Promise<number> {
  const result = runInstrumentedCoverage(parseRunnerArgs(process.argv.slice(2)));
  return result.exitCode;
}

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`instrumented coverage: ERROR ${error instanceof Error ? error.message : String(error)}`);
      process.exit(2);
    });
}
