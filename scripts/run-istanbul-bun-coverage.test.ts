import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COVERAGE_IGNORE_PATTERNS,
  createCoverageSummary,
  instrumentTypeScript,
  instrumentTypeScriptWithCoverage,
  isCoverageIgnored,
  parseRunnerArgs,
  runInstrumentedCoverage,
  writeCoverageReports,
} from "./run-istanbul-bun-coverage";

function expectCoverageRejection(selectOutput: (projectRoot: string) => string): void {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "memory-coverage-boundary-"));
  const projectRoot = join(fixtureRoot, "project");
  const workDir = join(fixtureRoot, "memory-nexus-coverage-work-fixture");
  mkdirSync(projectRoot);
  mkdirSync(workDir);
  const sourceSentinel = join(projectRoot, "source.txt");
  const workSentinel = join(workDir, "previous-run.txt");
  writeFileSync(sourceSentinel, "source must survive");
  writeFileSync(workSentinel, "previous run must survive");
  // Invalid source stops a broken guard before it can launch a child test process.
  mkdirSync(join(projectRoot, "src"));
  writeFileSync(join(projectRoot, "src", "invalid.ts"), "export const = ;");
  const coverageDir = selectOutput(projectRoot);
  mkdirSync(coverageDir, { recursive: true });
  const outputSentinel = join(coverageDir, "output-must-survive.txt");
  writeFileSync(outputSentinel, "existing output must survive");
  try {
    let error: unknown;
    try {
      runInstrumentedCoverage({ projectRoot, workDir, coverageDir, testArgs: [] });
    } catch (caught) {
      error = caught;
    }
    expect(existsSync(sourceSentinel)).toBe(true);
    expect(existsSync(outputSentinel)).toBe(true);
    expect(readFileSync(outputSentinel, "utf-8")).toBe("existing output must survive");
    expect(readFileSync(sourceSentinel, "utf-8")).toBe("source must survive");
    expect(readFileSync(workSentinel, "utf-8")).toBe("previous run must survive");
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Refusing to use coverageDir");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

describe("run-istanbul-bun-coverage", () => {
  test("rejects the project root as coverage output before deleting any files", () => {
    expectCoverageRejection((projectRoot) => projectRoot);
  });

  test("rejects a sibling with the project-name prefix before deleting any files", () => {
    expectCoverageRejection((projectRoot) => `${projectRoot}-neighbor`);
  });

  test("rejects an ancestor before deleting any files", () => {
    expectCoverageRejection((projectRoot) => join(projectRoot, ".."));
  });

  test("rejects an output that resolves back to the project root", () => {
    expectCoverageRejection((projectRoot) => join(projectRoot, "coverage", ".."));
  });

  test("rejects traversal into a sibling before deleting any files", () => {
    expectCoverageRejection((projectRoot) => join(projectRoot, "coverage", "..", "..", "project-neighbor"));
  });

  test("rejects a separate directory outside the project", () => {
    expectCoverageRejection((projectRoot) => join(projectRoot, "..", "outside"));
  });

  test("runs real instrumented tests in a strict descendant whose name begins with dots", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "memory-coverage-success-"));
    const projectRoot = join(fixtureRoot, "project");
    const workDir = join(fixtureRoot, "memory-nexus-coverage-work-fixture");
    const coverageDir = join(projectRoot, "..reports");
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    const sourcePath = join(projectRoot, "src", "choose.ts");
    const source = "export function choose(value: boolean) { return value ? 1 : 0; }\n";
    writeFileSync(sourcePath, source);
    writeFileSync(join(projectRoot, "src", "choose.test.ts"), [
      'import { test, expect } from "bun:test";',
      'import { choose } from "./choose";',
      'test("both outcomes", () => { expect(choose(true)).toBe(1); expect(choose(false)).toBe(0); });',
    ].join("\n"));
    try {
      const result = runInstrumentedCoverage({ projectRoot, workDir, coverageDir, testArgs: ["src/choose.test.ts"] });
      expect(result.exitCode).toBe(0);
      expect(result.coverageJsonPath).toBe(join(coverageDir, "coverage-final.json"));
      expect(readFileSync(sourcePath, "utf-8")).toBe(source);
      const summary = JSON.parse(readFileSync(result.coverageSummaryPath, "utf-8"));
      for (const metric of ["statements", "branches", "functions", "lines"]) {
        expect(summary[sourcePath][metric].total).toBeGreaterThan(0);
        expect(summary[sourcePath][metric].pct).toBe(100);
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("ignores tests, generated output, dependency folders, and explicit coverage tests", () => {
    expect(isCoverageIgnored("src/domain/entity.ts", COVERAGE_IGNORE_PATTERNS)).toBe(false);
    expect(isCoverageIgnored("src/domain/entity.test.ts", COVERAGE_IGNORE_PATTERNS)).toBe(true);
    expect(isCoverageIgnored("src/domain/entity.coverage.test.ts", COVERAGE_IGNORE_PATTERNS)).toBe(true);
    expect(isCoverageIgnored("dist/index.js", COVERAGE_IGNORE_PATTERNS)).toBe(true);
    expect(isCoverageIgnored("node_modules/pkg/index.js", COVERAGE_IGNORE_PATTERNS)).toBe(true);
    expect(isCoverageIgnored("tests/integration/example.test.ts", COVERAGE_IGNORE_PATTERNS)).toBe(true);
    expect(isCoverageIgnored(".claude/settings.local.json", COVERAGE_IGNORE_PATTERNS)).toBe(true);
    expect(isCoverageIgnored(".cc-guardian/state.json", COVERAGE_IGNORE_PATTERNS)).toBe(true);
    expect(isCoverageIgnored("~/scratch.ts", COVERAGE_IGNORE_PATTERNS)).toBe(true);
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

  test("defaults instrumented discovery to project test roots", () => {
    const options = parseRunnerArgs(["--coverage-dir", "coverage-custom"]);

    expect(options.testArgs).toEqual(["--timeout", "15000", "src", "tests", "scripts"]);
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
