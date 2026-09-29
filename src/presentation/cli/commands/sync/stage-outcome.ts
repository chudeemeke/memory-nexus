/** A pass outcome is not a certificate of whole-index or model readiness. */
export type SyncStageOutcome =
  | { status: "completed"; embedded?: number; skipped?: number; contextTokens?: number }
  | { status: "skipped" | "pending"; reason: string }
  | { status: "failed"; error: string }
  | { status: "not_requested" | "not_run" };

/** Accept only explicit terminal pass results from injected handlers. */
export function normalizeStageOutcome(value: unknown): SyncStageOutcome {
  if (value === undefined) return { status: "pending", reason: "outcome-unreported" };
  const invalid: SyncStageOutcome = { status: "failed", error: "Stage returned an invalid outcome" };
  if (!value || typeof value !== "object") return invalid;
  const input = value as Record<string, unknown>;
  switch (input.status) {
    case "completed": {
      const result: Extract<SyncStageOutcome, { status: "completed" }> = { status: "completed" };
      for (const key of ["embedded", "skipped", "contextTokens"] as const) {
        const count = input[key];
        if (count === undefined) continue;
        if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return invalid;
        result[key] = count;
      }
      return result;
    }
    case "skipped":
    case "pending":
      return typeof input.reason === "string" && input.reason.trim().length > 0
        ? { status: input.status, reason: input.reason } : invalid;
    case "failed":
      return typeof input.error === "string" && input.error.trim().length > 0
        ? { status: "failed", error: input.error } : invalid;
    default: return invalid;
  }
}

export function stageIncomplete(outcome: SyncStageOutcome): boolean {
  return outcome.status === "pending" || outcome.status === "failed";
}
