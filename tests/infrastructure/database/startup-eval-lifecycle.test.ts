import { describe, expect, it, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { initializeDatabaseForCli } from "../../../src/presentation/cli/db-startup.js";
import { evaluateFixture } from "../../../scripts/eval-v5/evaluators.js";
import { loadFixtures } from "../../../scripts/eval-v5/fixtures.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";
import { captureStreams } from "../../helpers/capture-json.js";

describe("startup and evaluation database ownership", () => {
  it("hands the live native owner to the startup caller and releases retained handles on caller close", async () => {
    const storage = createOwnedTestDirectory("memory-startup-lifecycle-");
    const path = join(storage.dir, "memory.db");
    const deps = { isTTY: () => false };
    let db: Database | undefined;
    try {
      const result = await initializeDatabaseForCli({ dbPath: path, json: true }, deps);
      expect(result.success).toBe(true); assert(result.success); db = result.db;
      const retained = db.prepare("SELECT 1 AS value"); expect(retained.get()).toEqual({ value: 1 });
      db.close(); expect(() => retained.get()).toThrow();
      unlinkSync(path);
      writeFileSync(path, "synthetic corrupt database");
      await captureStreams(async () => {
        const failed = await initializeDatabaseForCli({ dbPath: path, json: true }, deps);
        expect(failed.success).toBe(false);
        return undefined;
      });
      expect(readFileSync(path, "utf8")).toBe("synthetic corrupt database");
      unlinkSync(path);
    } finally { db?.close(); storage.cleanup(); }
  });

  for (const dimension of ["friction_query", "supersedence", "graph", "dreaming"] as const) {
    it(`closes the native ${dimension} evaluator database on success and invalid input`, async () => {
      const fixture = loadFixtures().find(row => row.fixture.dimension === dimension && row.fixture.mode === "behavior")!.fixture;
      const connections = new Set<Database>();
      const prepare = Database.prototype.prepare;
      const capture = spyOn(Database.prototype, "prepare").mockImplementation((function (this: Database, ...args: Parameters<typeof prepare>) {
        connections.add(this); return Reflect.apply(prepare, this, args);
      }) as typeof prepare);
      try {
        expect((await evaluateFixture(fixture)).status).toBe("pass");
        await expect(evaluateFixture({ ...fixture, input: {} })).rejects.toThrow();
        expect(connections.size).toBe(2);
        for (const db of connections) expect(() => db.exec("SELECT 1")).toThrow();
      } finally { capture.mockRestore(); for (const db of connections) db.close(); }
    });
  }
});
