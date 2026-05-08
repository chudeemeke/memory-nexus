#!/usr/bin/env bun
/**
 * Test isolation gate.
 *
 * Prevents the recurrence of process-wide test pollution patterns. Runs as a
 * static check (grep over src/) and exits non-zero on violation.
 *
 * Banned patterns in production code (src/, excluding *.test.ts):
 *   1. Module-level `let testX` mutable state
 *   2. Exported `setTest*` / `resetTest*` mutators (test escape hatches)
 *   3. Mutable `let *Fn` function seams
 *
 * Banned patterns in test code (src/**\/*.test.ts):
 *   4. First-party `mock.module()` calls (relative imports starting with ./ or ../)
 *
 * The gate is intentionally syntactic, not semantic. False positives are
 * acceptable; the architectural intent is to make these patterns impossible
 * to introduce silently.
 *
 * Usage:
 *   bun run scripts/check-test-isolation.ts
 *
 * Exit codes:
 *   0 - All checks pass
 *   1 - One or more violations found
 *   2 - Script error (file system, etc.)
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

interface Violation {
  file: string;
  line: number;
  pattern: string;
  matched: string;
  rule: string;
}

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const SRC_DIR = join(PROJECT_ROOT, "src");

/**
 * Recursively walk a directory and yield all .ts files.
 * Skips node_modules, .git, dist, and build output dirs.
 */
async function* walkTsFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === "dist" ||
        entry.name === "coverage" ||
        entry.name === ".stryker-tmp"
      ) {
        continue;
      }
      yield* walkTsFiles(full);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      yield full;
    }
  }
}

/**
 * Scan a single file for banned patterns relevant to its kind (test vs production).
 */
async function scanFile(file: string): Promise<Violation[]> {
  const content = await readFile(file, "utf-8");
  const lines = content.split("\n");
  const isTest = file.endsWith(".test.ts");
  const violations: Violation[] = [];
  const rel = relative(PROJECT_ROOT, file).replace(/\\/g, "/");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (isTest) {
      // Rule 4: first-party mock.module calls
      const mockModuleMatch = line.match(/mock\.module\(\s*["']([./].*?)["']/);
      if (mockModuleMatch) {
        violations.push({
          file: rel,
          line: lineNum,
          pattern: "mock.module() with first-party path",
          matched: mockModuleMatch[0],
          rule:
            "Test files must not mock first-party modules via mock.module() — Bun makes this process-wide. Inject dependencies via the deps parameter instead. See codex-validated convention in .planning/reviews/2026-05-07-test-isolation-plan.md.",
        });
      }
    } else {
      // Production code rules

      // Rule 1: module-level mutable state named testX
      // Match: `let testFoo` at start of line (top-level only — heuristic: no leading whitespace)
      if (/^let test[A-Z]\w*\s*[:=]/.test(line)) {
        violations.push({
          file: rel,
          line: lineNum,
          pattern: "module-level let testX",
          matched: line.trim(),
          rule:
            "Production code must not hold test-only mutable state at module scope. Pass test paths/dependencies through the deps parameter instead.",
        });
      }

      // Rule 2: exported setTest* / resetTest* mutators
      if (/^export\s+function\s+(set|reset)Test\w*\s*\(/.test(line)) {
        violations.push({
          file: rel,
          line: lineNum,
          pattern: "exported setTest*/resetTest* mutator",
          matched: line.trim(),
          rule:
            "Production code must not export test-only mutators. Inject runtime dependencies via the deps parameter instead.",
        });
      }

      // Rule 3: mutable let *Fn function seam at module scope
      if (/^let\s+\w+Fn\s*=/.test(line)) {
        violations.push({
          file: rel,
          line: lineNum,
          pattern: "module-level let *Fn function seam",
          matched: line.trim(),
          rule:
            "Production code must not hold mutable function references at module scope as a test seam. Inject the function via the deps parameter instead.",
        });
      }
    }
  }

  return violations;
}

async function main(): Promise<number> {
  const allViolations: Violation[] = [];

  for await (const file of walkTsFiles(SRC_DIR)) {
    const violations = await scanFile(file);
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    console.log("test-isolation gate: PASS (no violations)");
    return 0;
  }

  // Group by rule for human-readable output
  const byRule = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const list = byRule.get(v.pattern) ?? [];
    list.push(v);
    byRule.set(v.pattern, list);
  }

  console.error(`test-isolation gate: FAIL (${allViolations.length} violations)`);
  console.error("");
  for (const [pattern, violations] of byRule) {
    console.error(`[${pattern}] (${violations.length})`);
    console.error(`  ${violations[0].rule}`);
    console.error("");
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`    ${v.matched}`);
    }
    console.error("");
  }

  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("test-isolation gate: ERROR", err);
    process.exit(2);
  });
