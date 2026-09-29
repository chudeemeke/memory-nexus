/** One operation owns admission until its asynchronous work settles. */
export interface OperationAdmission {
  run<T>(operation: () => Promise<T>): Promise<T>;
}

declare const operationLeaseBrand: unique symbol;
/** Opaque, temporary permission issued only to an admitted operation. */
export interface OperationLease { readonly [operationLeaseBrand]: true; }

declare const databaseWriteLeaseBrand: unique symbol;
/** Explicit permission for a transaction owned by the target database scope. */
export interface DatabaseWriteLease extends OperationLease { readonly [databaseWriteLeaseBrand]: true; }

/** Explicit children share admission; no ambient or implicit reentrancy. */
export interface LeasedOperationAdmission {
  run<T>(operation: (lease: OperationLease) => Promise<T>, parent?: OperationLease): Promise<T>;
}
