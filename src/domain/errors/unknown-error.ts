/**
 * Normalize unknown throwables for user-facing messages and diagnostics.
 *
 * JavaScript allows throwing any value. Keeping this branch in one tested
 * domain helper prevents every catch block from growing its own subtly
 * different fallback.
 */
export function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function unknownToError(error: unknown): Error {
  return error instanceof Error ? error : new Error(unknownErrorMessage(error));
}
