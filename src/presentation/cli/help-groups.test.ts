/**
 * Help Groups (CLI-01) tests
 *
 * Phase 32 Plan 01: Asserts `memory --help` groups commands under labeled
 * categories: Query Commands, Data Commands, System Commands, Feedback Commands.
 *
 * Snapshot policy: the snapshot intentionally excludes any version line
 * (matching /version\s+\d+\.\d+\.\d+/i) BEFORE assertion. Rationale: package
 * version bumps must not churn this snapshot — only help-structure changes do.
 */

import { describe, expect, test } from "bun:test";
import { program } from "./index.js";

/**
 * Strip the version line from help output so package version bumps don't
 * cause snapshot churn. Documented W1 policy.
 */
function stripVersionLine(help: string): string {
  return help
    .split("\n")
    .filter((line) => !/version\s+\d+\.\d+\.\d+/i.test(line))
    .join("\n");
}

describe("help groups (CLI-01)", () => {
  describe("group headings present", () => {
    test("help output includes Query Commands heading", () => {
      expect(program.helpInformation()).toContain("Query Commands:");
    });

    test("help output includes Data Commands heading", () => {
      expect(program.helpInformation()).toContain("Data Commands:");
    });

    test("help output includes System Commands heading", () => {
      expect(program.helpInformation()).toContain("System Commands:");
    });

    test("help output includes Feedback Commands heading", () => {
      expect(program.helpInformation()).toContain("Feedback Commands:");
    });
  });

  describe("command placement under groups", () => {
    test("search appears between Query Commands and Data Commands", () => {
      const help = program.helpInformation();
      const queryIdx = help.indexOf("Query Commands:");
      const dataIdx = help.indexOf("Data Commands:");
      const searchIdx = help.indexOf("search");
      expect(queryIdx).toBeGreaterThanOrEqual(0);
      expect(dataIdx).toBeGreaterThan(queryIdx);
      expect(searchIdx).toBeGreaterThan(queryIdx);
      expect(searchIdx).toBeLessThan(dataIdx);
    });

    test("sync appears between Data Commands and System Commands", () => {
      const help = program.helpInformation();
      const dataIdx = help.indexOf("Data Commands:");
      const systemIdx = help.indexOf("System Commands:");
      const syncIdx = help.indexOf("sync");
      expect(dataIdx).toBeGreaterThanOrEqual(0);
      expect(systemIdx).toBeGreaterThan(dataIdx);
      expect(syncIdx).toBeGreaterThan(dataIdx);
      expect(syncIdx).toBeLessThan(systemIdx);
    });

    test("friction appears after Feedback Commands heading", () => {
      const help = program.helpInformation();
      const feedbackIdx = help.indexOf("Feedback Commands:");
      const frictionIdx = help.indexOf("friction");
      expect(feedbackIdx).toBeGreaterThanOrEqual(0);
      expect(frictionIdx).toBeGreaterThan(feedbackIdx);
    });
  });

  describe("snapshot (version-line stripped)", () => {
    test("help output structure is stable across package version bumps", () => {
      const help = program.helpInformation();
      const sanitized = stripVersionLine(help);
      // Version-line policy: snapshot must NOT contain a "version X.Y.Z" line.
      expect(/version\s+\d+\.\d+\.\d+/i.test(sanitized)).toBe(false);
      expect(sanitized).toMatchSnapshot();
    });
  });
});
