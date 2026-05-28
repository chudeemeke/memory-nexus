import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkCoverageThresholds,
  formatMetrics,
  loadMetrics,
  parseArgs,
  parseCoverageSummary,
  parseLcov,
  runCoverageGate,
  type CoverageMetrics,
} from "./check-coverage-thresholds";

const passingMetrics: CoverageMetrics = {
  statements: { covered: 96, total: 100, pct: 96, available: true },
  branches: { covered: 95, total: 100, pct: 95, available: true },
  functions: { covered: 97, total: 100, pct: 97, available: true },
  lines: { covered: 98, total: 100, pct: 98, available: true },
};

describe("check-coverage-thresholds", () => {
  test("passes when all four metrics are available and above threshold", () => {
    const result = checkCoverageThresholds(passingMetrics, 95);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test("fails when any metric is below threshold", () => {
    const result = checkCoverageThresholds({
      ...passingMetrics,
      branches: { covered: 94, total: 100, pct: 94, available: true },
    }, 95);

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(["branches coverage 94.00% is below required 95.00%"]);
  });

  test("fails when a required metric is unavailable", () => {
    const result = checkCoverageThresholds({
      ...passingMetrics,
      statements: { covered: 0, total: 0, pct: 0, available: false },
    }, 95);

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(["statements coverage metric is unavailable"]);
  });

  test("parses Istanbul coverage-summary JSON for all required metrics", () => {
    const metrics = parseCoverageSummary(JSON.stringify({
      total: {
        statements: { total: 100, covered: 99, pct: 99 },
        branches: { total: 100, covered: 98, pct: 98 },
        functions: { total: 100, covered: 97, pct: 97 },
        lines: { total: 100, covered: 96, pct: 96 },
      },
    }));

    expect(metrics.statements.pct).toBe(99);
    expect(metrics.branches.pct).toBe(98);
    expect(metrics.functions.pct).toBe(97);
    expect(metrics.lines.pct).toBe(96);
  });

  test("parses LCOV line, function, and branch totals while marking statements unavailable", () => {
    const metrics = parseLcov([
      "TN:",
      "SF:src/example.ts",
      "FNF:2",
      "FNH:2",
      "BRF:4",
      "BRH:3",
      "LF:10",
      "LH:9",
      "end_of_record",
    ].join("\n"));

    expect(metrics.statements.available).toBe(false);
    expect(metrics.branches).toEqual({ covered: 3, total: 4, pct: 75, available: true });
    expect(metrics.functions).toEqual({ covered: 2, total: 2, pct: 100, available: true });
    expect(metrics.lines).toEqual({ covered: 9, total: 10, pct: 90, available: true });
  });

  test("marks branch coverage unavailable when LCOV has no branch records", () => {
    const metrics = parseLcov([
      "TN:",
      "SF:src/example.ts",
      "FNF:2",
      "FNH:2",
      "LF:10",
      "LH:9",
      "end_of_record",
    ].join("\n"));

    expect(metrics.branches.available).toBe(false);
  });

  test("parses CLI arguments with explicit paths and threshold", () => {
    const options = parseArgs([
      "--lcov",
      "coverage/lcov.info",
      "--summary",
      "coverage/coverage-summary.json",
      "--threshold",
      "97.5",
    ]);

    expect(options.lcovPath.endsWith("coverage\\lcov.info") || options.lcovPath.endsWith("coverage/lcov.info")).toBe(true);
    expect(options.summaryPath.endsWith("coverage\\coverage-summary.json") || options.summaryPath.endsWith("coverage/coverage-summary.json")).toBe(true);
    expect(options.threshold).toBe(97.5);
  });

  test("rejects invalid CLI threshold", () => {
    expect(() => parseArgs(["--threshold", "101"])).toThrow("Invalid threshold: 101");
  });

  test("loads coverage-summary JSON before LCOV when both exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "coverage-thresholds-"));
    try {
      const summaryPath = join(dir, "coverage-summary.json");
      const lcovPath = join(dir, "lcov.info");
      writeFileSync(summaryPath, JSON.stringify({
        total: {
          statements: { total: 100, covered: 99, pct: 99 },
          branches: { total: 100, covered: 98, pct: 98 },
          functions: { total: 100, covered: 97, pct: 97 },
          lines: { total: 100, covered: 96, pct: 96 },
        },
      }));
      writeFileSync(lcovPath, "LF:10\nLH:1\nFNF:10\nFNH:1\n");

      const metrics = loadMetrics({ summaryPath, lcovPath, threshold: 95 });
      expect(metrics.statements.pct).toBe(99);
      expect(metrics.lines.pct).toBe(96);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws when no coverage report exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "coverage-thresholds-"));
    try {
      expect(() => loadMetrics({
        summaryPath: join(dir, "missing-summary.json"),
        lcovPath: join(dir, "missing-lcov.info"),
        threshold: 95,
      })).toThrow("No coverage report found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("formats unavailable and available metrics", () => {
    expect(formatMetrics({
      ...passingMetrics,
      statements: { covered: 0, total: 0, pct: 0, available: false },
    })).toContain("statements: unavailable");
    expect(formatMetrics(passingMetrics)).toContain("lines: 98.00% (98/100)");
  });

  test("runs the coverage gate with pass and fail outputs", () => {
    const dir = mkdtempSync(join(tmpdir(), "coverage-thresholds-"));
    try {
      const summaryPath = join(dir, "coverage-summary.json");
      const lcovPath = join(dir, "lcov.info");
      writeFileSync(summaryPath, JSON.stringify({
        total: {
          statements: { total: 100, covered: 96, pct: 96 },
          branches: { total: 100, covered: 95, pct: 95 },
          functions: { total: 100, covered: 97, pct: 97 },
          lines: { total: 100, covered: 98, pct: 98 },
        },
      }));

      const pass = runCoverageGate({ summaryPath, lcovPath, threshold: 95 });
      expect(pass.exitCode).toBe(0);
      expect(pass.stdout.at(-1)).toBe("coverage gate: PASS (all metrics >= 95.00%)");

      const fail = runCoverageGate({ summaryPath, lcovPath, threshold: 99 });
      expect(fail.exitCode).toBe(1);
      expect(fail.stderr[0]).toBe("coverage gate: FAIL (4 issues)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
