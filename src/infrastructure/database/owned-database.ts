import { Database, type SQLQueryBindings, type Statement } from "bun:sqlite";

/**
 * Owns prepared statements until explicit finalization or connection close.
 * One-off callers must use scope disposal; retaining all one-off work until
 * close would grow memory for a long-lived connection. Not yet the main factory.
 */
export class OwnedDatabase extends Database {
  private readonly statements = new Set<Statement>();

  override prepare<Result, Params extends SQLQueryBindings | SQLQueryBindings[]>(
    sql: string,
    params?: Params,
    flags?: number,
  ): Statement<Result, Params extends any[] ? Params : [Params]> {
    // Inherited query/transaction methods pass an internal third flags argument.
    // The conditional return type matches Bun's public declaration exactly.
    const statement = Reflect.apply(super.prepare, this, [sql, params, flags]) as
      Statement<Result, Params extends any[] ? Params : [Params]>;
    const owned = this.statements, finalize = statement.finalize;
    statement.finalize = function (this: Statement): void {
      finalize.call(this);
      owned.delete(this);
    };
    owned.add(statement);
    return statement;
  }

  /** Attempt every finalizer; failed resources remain owned for a later retry. */
  finalizeStatements(): void {
    const failures: unknown[] = [];
    for (const statement of this.statements) {
      try { statement.finalize(); }
      catch (error) { failures.push(error); }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Statement finalization failed; connection retained for retry");
    }
  }

  override close(throwOnError = true): void {
    this.finalizeStatements();
    super.close(throwOnError);
  }
}
