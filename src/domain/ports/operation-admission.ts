/** One operation owns admission until its asynchronous work settles. */
export interface OperationAdmission {
  run<T>(operation: () => Promise<T>): Promise<T>;
}
