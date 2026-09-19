import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

  test("rejects a linked coverage ancestor before touching its external target", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "memory-coverage-link-"));
    const projectRoot = join(fixtureRoot, "project");
    const externalRoot = join(fixtureRoot, "external");
    const workDir = join(fixtureRoot, "memory-nexus-coverage-work-fixture");
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    mkdirSync(join(externalRoot, "reports"), { recursive: true });
    mkdirSync(workDir);
    const sentinel = join(externalRoot, "reports", "valuable.txt");
    const workSentinel = join(workDir, "previous-run.txt");
    writeFileSync(sentinel, "outside content must survive");
    writeFileSync(workSentinel, "previous run must survive");
    writeFileSync(join(projectRoot, "src", "invalid.ts"), "export const = ;");
    symlinkSync(externalRoot, join(projectRoot, "linked"), "junction");
    try {
      let error: unknown;
      try {
        runInstrumentedCoverage({ projectRoot, workDir, coverageDir: join(projectRoot, "linked", "reports"), testArgs: [] });
      } catch (caught) {
        error = caught;
      }
      expect(existsSync(sentinel)).toBe(true);
      expect(readFileSync(sentinel, "utf-8")).toBe("outside content must survive");
      expect(readFileSync(workSentinel, "utf-8")).toBe("previous run must survive");
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Refusing");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  for (const projectIsJunction of [false, true]) {
    test(`runs real instrumented tests in a dot-prefixed descendant (project junction: ${projectIsJunction})`, () => {
      const fixtureRoot = mkdtempSync(join(tmpdir(), "memory-coverage-success-"));
      const projectRoot = join(fixtureRoot, "project");
      const workDir = join(fixtureRoot, "memory-nexus-coverage-work-fixture");
      const coverageDir = join(projectRoot, "..reports");
      if (projectIsJunction) {
        const physicalRoot = join(fixtureRoot, "physical-project");
        mkdirSync(physicalRoot);
        symlinkSync(physicalRoot, projectRoot, "junction");
      }
      mkdirSync(join(projectRoot, "src"), { recursive: true });
      const dependencies = join(fixtureRoot, "dependencies");
      mkdirSync(dependencies);
      symlinkSync(dependencies, join(projectRoot, "node_modules"), "junction");
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
  }

  test("rejects copied source-directory links before rewriting external source", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "memory-coverage-source-link-"));
    const projectRoot = join(fixtureRoot, "project");
    const externalRoot = join(fixtureRoot, "external");
    const workDir = join(fixtureRoot, "memory-nexus-coverage-work-fixture");
    const coverageDir = join(projectRoot, "coverage");
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    mkdirSync(externalRoot);
    mkdirSync(coverageDir);
    const sourcePath = join(externalRoot, "valuable.ts");
    const source = "export const valuable = 42;\n";
    const reportSentinel = join(coverageDir, "previous-report.txt");
    writeFileSync(sourcePath, source);
    writeFileSync(reportSentinel, "previous report must survive");
    writeFileSync(join(projectRoot, "src", "probe.test.ts"), 'import { test, expect } from "bun:test"; test("probe", () => expect(true).toBe(true));');
    symlinkSync(externalRoot, join(projectRoot, "src", "linked"), "junction");
    try {
      let error: unknown;
      try {
        runInstrumentedCoverage({ projectRoot, workDir, coverageDir, testArgs: ["src/probe.test.ts"] });
      } catch (caught) {
        error = caught;
      }
      expect(readFileSync(sourcePath, "utf-8")).toBe(source);
      expect(readFileSync(reportSentinel, "utf-8")).toBe("previous report must survive");
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Refusing");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("rejects a linked work directory before deleting existing reports or the link", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "memory-coverage-work-link-"));
    const projectRoot = join(fixtureRoot, "project");
    const workDir = join(fixtureRoot, "memory-nexus-coverage-work-fixture");
    const coverageDir = join(projectRoot, "coverage");
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    mkdirSync(coverageDir);
    const sentinel = join(coverageDir, "valuable.txt");
    writeFileSync(sentinel, "report must survive");
    writeFileSync(join(projectRoot, "src", "invalid.ts"), "export const = ;");
    symlinkSync(projectRoot, workDir, "junction");
    try {
      let error: unknown;
      try {
        runInstrumentedCoverage({ projectRoot, workDir, coverageDir, testArgs: [] });
      } catch (caught) {
        error = caught;
      }
      expect(existsSync(sentinel)).toBe(true);
      expect(readFileSync(sentinel, "utf-8")).toBe("report must survive");
      expect(lstatSync(workDir).isSymbolicLink()).toBe(true);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Refusing");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("rejects a work-directory parent alias that resolves to the project root", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "memory-coverage-work-alias-"));
    const projectName = "memory-nexus-coverage-work-project";
    const projectRoot = join(fixtureRoot, projectName);
    const alias = join(fixtureRoot, "alias");
    const coverageDir = join(projectRoot, "coverage");
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    mkdirSync(coverageDir);
    const sourceSentinel = join(projectRoot, "src", "invalid.ts");
    const reportSentinel = join(coverageDir, "valuable.txt");
    writeFileSync(sourceSentinel, "export const = ;");
    writeFileSync(reportSentinel, "report must survive");
    symlinkSync(fixtureRoot, alias, "junction");
    try {
      let error: unknown;
      try {
        runInstrumentedCoverage({ projectRoot, workDir: join(alias, projectName), coverageDir, testArgs: [] });
      } catch (caught) {
        error = caught;
      }
      expect(existsSync(sourceSentinel)).toBe(true);
      expect(readFileSync(sourceSentinel, "utf-8")).toBe("export const = ;");
      expect(readFileSync(reportSentinel, "utf-8")).toBe("report must survive");
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Refusing");
    } finally {
      rmSync(alias, { force: true });
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  for (const layout of ["same", "output-in-work", "work-in-output", "work-in-project"] as const) {
    test(`rejects overlapping work and coverage paths: ${layout}`, () => {
      const fixtureRoot = mkdtempSync(join(tmpdir(), "memory-coverage-overlap-"));
      const projectRoot = join(fixtureRoot, "project");
      const workDir = layout === "work-in-output"
        ? join(projectRoot, "coverage", "memory-nexus-coverage-work-fixture")
        : join(projectRoot, ".coverage-work");
      const coverageDir = layout === "same" ? workDir
        : layout === "output-in-work" ? join(workDir, "reports") : join(projectRoot, "coverage");
      mkdirSync(join(projectRoot, "src"), { recursive: true });
      mkdirSync(workDir, { recursive: true });
      mkdirSync(coverageDir, { recursive: true });
      const reportSentinel = join(coverageDir, "previous-report.txt");
      const workSentinel = join(workDir, "previous-run.txt");
      writeFileSync(reportSentinel, "report must survive");
      writeFileSync(workSentinel, "work must survive");
      writeFileSync(join(projectRoot, "src", "invalid.ts"), "export const = ;");
      try {
        let error: unknown;
        try {
          runInstrumentedCoverage({ projectRoot, workDir, coverageDir, testArgs: [] });
        } catch (caught) {
          error = caught;
        }
        expect(existsSync(reportSentinel)).toBe(true);
        expect(readFileSync(reportSentinel, "utf-8")).toBe("report must survive");
        expect(readFileSync(workSentinel, "utf-8")).toBe("work must survive");
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Refusing");
      } finally {
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    });
  }

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
