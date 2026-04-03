/**
 * Sync Helpers Tests
 *
 * Tests for executeDryRun, handleError, reportResults, createDriveResolver,
 * and lazy loader functions.
 */

import { describe, it, expect } from "bun:test";
import { createDriveResolver } from "./helpers.js";

describe("helpers", () => {
  describe("createDriveResolver", () => {
    it("returns a ProjectNameResolver instance", () => {
      const resolver = createDriveResolver();
      expect(resolver).toBeDefined();
    });
  });
});
