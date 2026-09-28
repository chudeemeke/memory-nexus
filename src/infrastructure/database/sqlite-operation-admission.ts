import type { OperationAdmission } from "../../domain/ports/operation-admission.js";
import { lstatSync } from "node:fs";
import { isAbsolute } from "node:path";
import { OwnedDatabase } from "./owned-database.js";

/** Backend only; source authority provisioning and command adoption are separate. */
export class SqliteOperationAdmission implements OperationAdmission {
  constructor(private readonly path: string) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (!isAbsolute(this.path)) throw new Error("Operation admission requires an absolute authority path");
    const identity = lstatSync(this.path);
    if (!identity.isFile() || identity.nlink !== 1) throw new Error("Operation admission requires a regular authority file with one link");
    // Never create or migrate an authority implicitly; provisioning owns its path.
    const db = new OwnedDatabase(this.path, { create: false, readwrite: true });
    let held = false, result: T | undefined;
    const failures: unknown[] = [];
    try {
      db.exec("PRAGMA busy_timeout=0");
      try { db.exec("BEGIN IMMEDIATE"); }
      catch (cause) {
        if ((cause as { code?: string })?.code === "SQLITE_BUSY") {
          throw new Error("Source operation is busy; retry after the current operation finishes", { cause });
        }
        throw cause;
      }
      held = true;
      using application = db.prepare<{ application_id: number }, []>("PRAGMA application_id");
      if (application.get()?.application_id !== 1296122957) throw new Error("Invalid operation admission authority");
      using format = db.prepare<{ version: number }, []>("SELECT version FROM admission_format");
      const versions = format.all();
      if (versions.length !== 1 || versions[0]?.version !== 1) throw new Error("Unsupported operation admission format");
      result = await operation();
    } catch (error) { failures.push(error); }
    // Attempt every release and retain primary plus cleanup failures.
    if (held) {
      try { db.exec("ROLLBACK"); } catch (error) { failures.push(error); }
    }
    try { db.close(); } catch (error) { failures.push(error); }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "Operation admission and cleanup failed");
    return result as T;
  }
}
