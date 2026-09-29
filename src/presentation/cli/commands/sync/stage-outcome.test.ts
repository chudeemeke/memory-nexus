import { expect, it } from "bun:test";
import { normalizeStageOutcome, stageIncomplete } from "./stage-outcome.js";

it("preserves missing legacy outcomes as pending", () => {
  expect(normalizeStageOutcome(undefined)).toEqual({ status: "pending", reason: "outcome-unreported" });
});

it.each([null, false, "completed", {}, { status: "not_run" }, { status: "not_requested" },
  { status: "skipped" }, { status: "pending", reason: " " }, { status: "failed" },
  { status: "failed", error: "" }, { status: "completed", embedded: "1" },
  { status: "completed", skipped: -1 }, { status: "completed", contextTokens: 0.5 },
  { status: "completed", embedded: NaN }, { status: "completed", embedded: Infinity },
])("rejects malformed or nonterminal returned outcomes: %j", value => {
  expect(normalizeStageOutcome(value)).toEqual({ status: "failed", error: "Stage returned an invalid outcome" });
});

it("copies only valid primitive completed counts", () => {
  expect(normalizeStageOutcome({ status: "completed", embedded: 0, skipped: 2, contextTokens: 9, raw: 1n }))
    .toEqual({ status: "completed", embedded: 0, skipped: 2, contextTokens: 9 });
  expect(normalizeStageOutcome({ status: "completed" })).toEqual({ status: "completed" });
});

it.each(["skipped", "pending"] as const)("retains an explained %s", status => {
  expect(normalizeStageOutcome({ status, reason: "disabled", raw: 1n })).toEqual({ status, reason: "disabled" });
});

it("retains a failure and identifies incomplete outcomes", () => {
  expect(normalizeStageOutcome({ status: "failed", error: "offline" })).toEqual({ status: "failed", error: "offline" });
  expect(stageIncomplete({ status: "pending", reason: "disabled" })).toBe(true);
  expect(stageIncomplete({ status: "failed", error: "offline" })).toBe(true);
  expect(stageIncomplete({ status: "completed" })).toBe(false);
  expect(stageIncomplete({ status: "skipped", reason: "disabled" })).toBe(false);
});
