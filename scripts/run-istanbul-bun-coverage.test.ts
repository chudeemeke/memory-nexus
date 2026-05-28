import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COVERAGE_IGNORE_PATTERNS,
  createCoverageSummary,
  instrumentTypeScript,
  instrumentTypeScriptWithCoverage,
  isCoverageIgnored,
  parseRunnerArgs,
  writeCoverageReports,
} from "./run-istanbul-bun-coverage";

describe("run-istanbul-bun-coverage", () => {
  test("ignores tests, generated output, dependency folders, and explicit coverage tests", () => {
    expect(isCoverageIgnored("src/domain/entity.ts", COVERAGE_IGNORE_PATTERNS)).toBe(false);
    expect(isCoverageIgnored("src/domain/entity.test.ts", COVERAGE_IGNORE_PATTERNS)).toBe(true);
    expect(isCoverageIgnored("src/domain/entity.coverage.test.ts", COVERAGE_IGNORE_PATTERNS)).toBe(true);
    expect(isCoverageIgnored("dist/index.js", COVERAGE_IGNORE_PATTERNS)).toBe(true);
    expect(isCoverageIgnored("node_modules/pkg/index.js", COVERAGE_IGNORE_PATTERNS)).toBe(true);
    expect(isCoverageIgnored("tests/integration/example.test.ts", COVERAGE_IGNORE_PATTERNS)).toBe(true);
  });

  test("instruments TypeScript with real statement and branch counters", () => {
    const output = instrumentTypeScript(
      "export function choose(value: boolean): number { return value ? 1 : 0; }",
      "src/example.ts",
    );

    expect(output).toContain("statementMap");
    expect(output).toContain("branchMap");
    expect(output).toContain("cov_");
    expect(output).toContain("export function choose");
  });

  test("returns zero-count baseline coverage for unexecuted instrumented files", () => {
    const output = instrumentTypeScriptWithCoverage(
      "export function choose(value: boolean): number { return value ? 1 : 0; }",
      "src/example.ts",
    );

    expect(output.coverageData.path).toBe("src/example.ts");
    expect(Object.values(output.coverageData.s)).toEqual([0]);
    expect(Object.values(output.coverageData.f)).toEqual([0]);
    expect(Object.values(output.coverageData.b)).toEqual([[0, 0]]);
  });

  test("adds the release-suite timeout to instrumented test runs by default", () => {
    const options = parseRunnerArgs(["--coverage-dir", "coverage-custom", "--", "src/example.test.ts"]);

    expect(options.coverageDir.endsWith("coverage-custom")).toBe(true);
    expect(options.testArgs).toEqual(["--timeout", "15000", "src/example.test.ts"]);
  });

  test("preserves an explicit instrumented test timeout", () => {
    const options = parseRunnerArgs(["--", "--timeout", "30000", "src/example.test.ts"]);

    expect(options.testArgs).toEqual(["--timeout", "30000", "src/example.test.ts"]);
  });

  test("writes Istanbul reports with all four coverage totals", () => {
    const root = mkdtempSync(join(tmpdir(), "memory-coverage-report-"));
    try {
      const sourcePath = join(root, "example.ts");
      writeFileSync(sourcePath, "export const value = true;\n", "utf-8");

      const summary = createCoverageSummary({
        [sourcePath]: {
          path: sourcePath,
          statementMap: {
            "0": { start: { line: 1, column: 0 }, end: { line: 1, column: 26 } },
          },
          fnMap: {},
          branchMap: {},
          s: { "0": 1 },
          f: {},
          b: {},
        },
      });
      writeCoverageReports(summary.coverageMap, join(root, "coverage"));

      const summaryPath = join(root, "coverage", "coverage-summary.json");
      expect(existsSync(summaryPath)).toBe(true);
      const report = JSON.parse(readFileSync(summaryPath, "utf-8")) as {
        total: {
          statements: { total: number; covered: number; skipped: number; pct: number };
          branches: { total: number; covered: number; skipped: number; pct: number };
          functions: { total: number; covered: number; skipped: number; pct: number };
          lines: { total: number; covered: number; skipped: number; pct: number };
        };
      };

      expect(report.total.statements).toEqual({ total: 1, covered: 1, skipped: 0, pct: 100 });
      expect(report.total.branches.total).toBe(0);
      expect(report.total.functions.total).toBe(0);
      expect(report.total.lines.total).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
