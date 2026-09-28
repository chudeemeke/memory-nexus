import { expect, it, spyOn } from "bun:test";
import { Database, type Statement } from "bun:sqlite";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { initializeDatabase, closeDatabase } from "../../../src/infrastructure/database/connection.js";
import { executeShowCommand } from "../../../src/presentation/cli/commands/show.js";
import { SqliteSessionRepository } from "../../../src/infrastructure/database/repositories/session-repository.js";
import { Session } from "../../../src/domain/entities/session.js";
import { ProjectPath } from "../../../src/domain/value-objects/project-path.js";
import { captureStreams } from "../../helpers/capture-json.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

for (const outcome of ["match", "missing", "native-error"] as const) {
  it(`disposes the public show prefix reader on ${outcome}`, async () => {
    const storage = createOwnedTestDirectory("memory-show-lifecycle-");
    const path = join(storage.dir, "memory.db");
    try {
      const { db } = initializeDatabase({ path });
      try {
        await new SqliteSessionRepository(db).save(Session.create({
          id: "synthetic-session-full", projectPath: ProjectPath.fromDecoded("/synthetic/project"),
          startTime: new Date("2026-01-01T00:00:00Z"),
        }));
      } finally { closeDatabase(db); }
      const prepare = Database.prototype.prepare;
      let retained: Statement | undefined, disposed = 0;
      const capture = spyOn(Database.prototype, "prepare").mockImplementation((function (this: Database, ...args: Parameters<typeof prepare>) {
        if (!args[0].includes("id LIKE ? ORDER BY start_time")) return Reflect.apply(prepare, this, args);
        const statement = Reflect.apply(prepare, this, outcome === "native-error" ? ["SELECT json_extract(?, '$') AS id"] : args) as ReturnType<typeof prepare>;
        retained = statement;
        const dispose = statement[Symbol.dispose];
        Object.defineProperty(statement, Symbol.dispose, { configurable: true, value() {
          disposed++; return Reflect.apply(dispose, statement, []);
        } });
        return statement;
      }) as typeof prepare);
      try {
        const output = await captureStreams(() => executeShowCommand(outcome === "missing" ? "absent-prefix" : "synthetic-session", { json: true }, { dbPath: path }));
        expect(output.exitCode).toBe(outcome === "match" ? 0 : 1);
        expect(retained).toBeDefined(); expect(disposed).toBe(1);
        if (outcome === "match") expect(JSON.parse(output.stdout).meta.session_id).toBe("synthetic-session-full");
        if (outcome === "native-error") expect(output.stdout + output.stderr).toContain("malformed JSON");
        expect(() => retained!.get()).toThrow();
        unlinkSync(path);
      } finally { capture.mockRestore(); retained?.finalize(); }
    } finally { storage.cleanup(); }
  });
}
