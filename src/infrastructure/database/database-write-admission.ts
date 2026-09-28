import type { Database } from "bun:sqlite";
import type { DatabaseWriteLease, OperationAdmission } from "../../domain/ports/operation-admission.js";
import { unknownErrorMessage } from "../../domain/errors/unknown-error.js";
import { LeasedOperationAdmission } from "./leased-operation-admission.js";

interface Binding { db: Database; open: boolean; parent: Binding | undefined; }
const bindings = new WeakMap<DatabaseWriteLease, Binding>();
const scopes = new WeakMap<Database, LeasedOperationAdmission>();
const ownedTransactions = new WeakSet<Database>();
let sequence = 0;

/** Inputs must not change by joining an operation's transaction on this connection. */
export function assertNoDatabaseWriteScope(db: Database): void {
  if (ownedTransactions.has(db)) {
    if (db.inTransaction) throw new Error("Message mutation cannot join an owned database write scope; retry after completion");
    // A failed rollback may have required explicit connection recovery.
    ownedTransactions.delete(db);
  }
}

/** An open transaction alone is never permission to use somebody else's work. */
export function assertDatabaseWriteLease(db: Database, lease?: DatabaseWriteLease): void {
  if (lease === undefined) {
    if (db.inTransaction) throw new Error("Projection rebuild cannot use a caller transaction");
    return;
  }
  const binding = bindings.get(lease);
  if (!binding || binding.db !== db) throw new Error("Invalid database write lease for this connection");
  for (let owner: Binding | undefined = binding; owner; owner = owner.parent) {
    if (!owner.open) throw new Error("Database write lease expired");
  }
  if (!db.inTransaction) throw new Error("Owned database transaction ended unexpectedly");
}

class DatabaseWriteAdmission implements OperationAdmission {
  constructor(private readonly db: Database) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.db.inTransaction) throw new Error("Database write scope cannot use a caller transaction");
    ownedTransactions.add(this.db);
    try {
      this.db.exec("BEGIN IMMEDIATE");
      if (!this.db.inTransaction) throw new Error("Database write reservation was not acquired");
      const result = await operation();
      if (!this.db.inTransaction) throw new Error("Owned database transaction ended unexpectedly");
      this.db.exec("COMMIT");
      if (this.db.inTransaction) throw new Error("Owned database commit did not close the transaction");
      return result;
    } catch (error) {
      const failures = [error];
      if (this.db.inTransaction) {
        try { this.db.exec("ROLLBACK"); } catch (cleanup) { failures.push(cleanup); }
        if (this.db.inTransaction) failures.push(new Error("Database write reservation remains open; connection requires recovery"));
      }
      if (failures.length > 1) throw new AggregateError(failures, failures.map(unknownErrorMessage).join("; "));
      throw error;
    } finally {
      if (!this.db.inTransaction) ownedTransactions.delete(this.db);
    }
  }
}

/** Borrow the connection; never close it or adopt a pre-existing transaction. */
export function runDatabaseWrite<T>(db: Database, operation: (lease: DatabaseWriteLease) => Promise<T>, parent?: DatabaseWriteLease): Promise<T> {
  try {
    if (parent !== undefined) assertDatabaseWriteLease(db, parent);
    let scope = scopes.get(db);
    if (!scope) {
      scope = new LeasedOperationAdmission(new DatabaseWriteAdmission(db), `database-write:${++sequence}`, () => {});
      scopes.set(db, scope);
    }
    return scope.run(async issued => {
      const lease = issued as DatabaseWriteLease;
      const binding: Binding = { db, open: true, parent: parent === undefined ? undefined : bindings.get(parent) };
      bindings.set(lease, binding);
      try { return await operation(lease); }
      finally { binding.open = false; }
    }, parent);
  } catch (error) { return Promise.reject(error); }
}
