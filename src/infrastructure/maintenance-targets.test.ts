import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { linkSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOwnedTestDirectory } from "../../tests/helpers/owned-test-directory.js";
import { assertMaintenanceTargets } from "./maintenance-targets.js";

describe("maintenance target preflight", () => {
  let storage: ReturnType<typeof createOwnedTestDirectory>;
  beforeEach(() => { storage = createOwnedTestDirectory("memory-maintenance-type-"); });
  afterEach(() => { storage.cleanup(); });

  it("allows real regular files, directories and missing targets", () => {
    const file = join(storage.dir, "file");
    writeFileSync(file, "fixture");
    expect(() => assertMaintenanceTargets([
      { path: file, kind: "file" },
      { path: storage.dir, kind: "directory" },
      { path: join(storage.dir, "missing", "file"), kind: "file" },
      { path: join(storage.dir, "missing-directory"), kind: "directory" },
    ])).not.toThrow();
  });

  for (const kind of ["file", "directory"] as const) {
    it(`refuses the wrong existing type for ${kind}`, () => {
      const path = join(storage.dir, "target");
      if (kind === "file") mkdirSync(path);
      else writeFileSync(path, "source fence");
      expect(() => assertMaintenanceTargets([{ path, kind }])).toThrow("Maintenance requires");
    });
  }

  it("refuses file hard links", () => {
    const file = join(storage.dir, "file"), alias = join(storage.dir, "alias");
    writeFileSync(file, "fixture");
    linkSync(file, alias);
    expect(() => assertMaintenanceTargets([{ path: alias, kind: "file" }])).toThrow("Maintenance requires");
  });

  it("refuses directory junctions and dangling junctions", () => {
    const real = join(storage.dir, "real"), alias = join(storage.dir, "alias"), dangling = join(storage.dir, "dangling");
    mkdirSync(real);
    symlinkSync(real, alias, "junction");
    symlinkSync(join(storage.dir, "missing"), dangling, "junction");
    expect(() => assertMaintenanceTargets([{ path: alias, kind: "directory" }])).toThrow("Maintenance requires");
    expect(() => assertMaintenanceTargets([{ path: dangling, kind: "directory" }])).toThrow("Maintenance requires");
  });

  for (const failure of [null, "inspection failed", new Error("inspection failed"), Object.assign(new Error("denied"), { code: "EACCES" })]) {
    it(`propagates inspection failure ${String(failure)}`, () => {
      let observed: unknown = undefined;
      try {
        assertMaintenanceTargets([{ path: storage.dir, kind: "directory" }], () => { throw failure; });
      } catch (error) { observed = error; }
      expect(observed).toBe(failure);
    });
  }
});
