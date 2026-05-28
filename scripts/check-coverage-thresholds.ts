#!/usr/bin/env bun
/**
 * Coverage threshold gate.
 *
 * Enforces WoW coverage standards: statements, branches, functions, and lines
 * must each be available and >= the configured threshold. Missing metrics fail
 * because an unmeasured release gate is not a release gate.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type CoverageMetricName = "statements" | "branches" | "functions" | "lines";

export interface CoverageMetric {
  covered: number;
  total: number;
  pct: number;
  available: boolean;
}

export type CoverageMetrics = Record<CoverageMetricName, CoverageMetric>;

export interface CoverageCheckResult {
  ok: boolean;
  failures: string[];
}

export interface CliOptions {
  lcovPath: string;
  summaryPath: string;
  threshold: number;
}

export interface CoverageGateRun {
  exitCode: number;
  stdout: string[];
  stderr: string[];
}

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const DEFAULT_OPTIONS: CliOptions = {
  lcovPath: join(PROJECT_ROOT, "coverage", "lcov.info"),
  summaryPath: join(PROJECT_ROOT, "coverage", "coverage-summary.json"),
  threshold: 95,
};

function unavailable(): CoverageMetric {
  return { covered: 0, total: 0, pct: 0, available: false };
}

function metric(covered: number, total: number): CoverageMetric {
  if (total <= 0) return unavailable();
  return {
    covered,
    total,
    pct: (covered / total) * 100,
    available: true,
  };
}

function emptyMetrics(): CoverageMetrics {
  return {
    statements: unavailable(),
    branches: unavailable(),
    functions: unavailable(),
    lines: unavailable(),
  };
}

export function parseLcov(content: string): CoverageMetrics {
  const totals = {
    functionsFound: 0,
    functionsHit: 0,
    branchesFound: 0,
    branchesHit: 0,
    linesFound: 0,
    linesHit: 0,
  };

  for (const line of content.split(/\r?\n/)) {
    const [key, rawValue] = line.split(":", 2);
    if (!key || rawValue === undefined) continue;

    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;

    switch (key) {
      case "FNF":
        totals.functionsFound += value;
        break;
      case "FNH":
        totals.functionsHit += value;
        break;
      case "BRF":
        totals.branchesFound += value;
        break;
      case "BRH":
        totals.branchesHit += value;
        break;
      case "LF":
        totals.linesFound += value;
        break;
      case "LH":
        totals.linesHit += value;
        break;
    }
  }

  return {
    statements: unavailable(),
    branches: metric(totals.branchesHit, totals.branchesFound),
    functions: metric(totals.functionsHit, totals.functionsFound),
    lines: metric(totals.linesHit, totals.linesFound),
  };
}

export function parseCoverageSummary(content: string): CoverageMetrics {
  const parsed = JSON.parse(content) as {
    total?: Record<CoverageMetricName, { total?: number; covered?: number; pct?: number }>;
  };

  const metrics = emptyMetrics();
  for (const name of Object.keys(metrics) as CoverageMetricName[]) {
    const source = parsed.total?.[name];
    if (!source) continue;

    const total = Number(source.total);
    const covered = Number(source.covered);
    const pct = Number(source.pct);
    if (!Number.isFinite(total) || !Number.isFinite(covered) || !Number.isFinite(pct) || total <= 0) {
      continue;
    }

    metrics[name] = {
      total,
      covered,
      pct,
      available: true,
    };
  }
  return metrics;
}

export function checkCoverageThresholds(metrics: CoverageMetrics, threshold: number): CoverageCheckResult {
  const failures: string[] = [];

  for (const name of Object.keys(metrics) as CoverageMetricName[]) {
    const current = metrics[name];
    if (!current.available) {
      failures.push(`${name} coverage metric is unavailable`);
      continue;
    }

    if (current.pct < threshold) {
      failures.push(`${name} coverage ${current.pct.toFixed(2)}% is below required ${threshold.toFixed(2)}%`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

export function loadMetrics(options: CliOptions): CoverageMetrics {
  if (existsSync(options.summaryPath)) {
    return parseCoverageSummary(readFileSync(options.summaryPath, "utf-8"));
  }

  if (existsSync(options.lcovPath)) {
    return parseLcov(readFileSync(options.lcovPath, "utf-8"));
  }

  throw new Error(`No coverage report found. Expected ${options.summaryPath} or ${options.lcovPath}`);
}

export function parseArgs(argv: string[]): CliOptions {
  const options = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--lcov" && next) {
      options.lcovPath = resolve(PROJECT_ROOT, next);
      i++;
    } else if (arg === "--summary" && next) {
      options.summaryPath = resolve(PROJECT_ROOT, next);
      i++;
    } else if (arg === "--threshold" && next) {
      const threshold = Number(next);
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
        throw new Error(`Invalid threshold: ${next}`);
      }
      options.threshold = threshold;
      i++;
    }
  }

  return options;
}

export function formatMetrics(metrics: CoverageMetrics): string[] {
  const lines: string[] = [];
  for (const name of Object.keys(metrics) as CoverageMetricName[]) {
    const current = metrics[name];
    if (!current.available) {
      lines.push(`${name}: unavailable`);
    } else {
      lines.push(`${name}: ${current.pct.toFixed(2)}% (${current.covered}/${current.total})`);
    }
  }
  return lines;
}

export function runCoverageGate(options: CliOptions): CoverageGateRun {
  const metrics = loadMetrics(options);
  const result = checkCoverageThresholds(metrics, options.threshold);
  const stdout = formatMetrics(metrics);
  const stderr: string[] = [];

  if (result.ok) {
    stdout.push(`coverage gate: PASS (all metrics >= ${options.threshold.toFixed(2)}%)`);
    return { exitCode: 0, stdout, stderr };
  }

  stderr.push(`coverage gate: FAIL (${result.failures.length} issue${result.failures.length === 1 ? "" : "s"})`);
  for (const failure of result.failures) {
    stderr.push(`  - ${failure}`);
  }
  return { exitCode: 1, stdout, stderr };
}

async function main(): Promise<number> {
  const run = runCoverageGate(parseArgs(process.argv.slice(2)));
  for (const line of run.stdout) {
    console.log(line);
  }
  for (const line of run.stderr) {
    console.error(line);
  }
  return run.exitCode;
}

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`coverage gate: ERROR ${error instanceof Error ? error.message : String(error)}`);
      process.exit(2);
    });
}
