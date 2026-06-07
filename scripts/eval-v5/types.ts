export const V5_EVAL_DIMENSIONS = [
  "privacy_redaction",
  "cross_project_leakage",
  "supersedence",
  "sync_recovery",
  "friction_query",
  "persona",
  "graph",
  "ranking",
  "dreaming",
] as const;

export type V5EvalDimension = (typeof V5_EVAL_DIMENSIONS)[number];
export type V5EvalMode = "behavior" | "contract";
export type V5EvalStatus = "pass" | "fail";

export interface V5EvalSanitization {
  containsRawSecrets: false;
  containsPrivateTranscript: false;
  notes: string[];
}

export interface V5EvalFixture {
  schemaVersion: 1;
  id: string;
  title: string;
  dimension: V5EvalDimension;
  mode: V5EvalMode;
  ownerPhase: string;
  tags: string[];
  sanitized: V5EvalSanitization;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
}

export interface V5EvalCheckResult {
  name: string;
  status: V5EvalStatus;
  message: string;
}

export interface V5EvalResult {
  fixture_id: string;
  title: string;
  dimension: V5EvalDimension;
  mode: V5EvalMode;
  owner_phase: string;
  status: V5EvalStatus;
  blocking: boolean;
  checks: V5EvalCheckResult[];
  evidence: Record<string, unknown>;
}

export interface V5EvalThreshold {
  dimension: V5EvalDimension;
  required_pass_rate: number;
  blocking: boolean;
}

export interface V5EvalReport {
  schema_version: "1";
  command: "eval:v5";
  generated_at: string;
  fixture_dir: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    blocking_failed: number;
    behavior: number;
    contract: number;
  };
  coverage: {
    dimensions: V5EvalDimension[];
    fixture_count_by_dimension: Record<V5EvalDimension, number>;
  };
  thresholds: V5EvalThreshold[];
  market_readiness: {
    eligible: boolean;
    contract_fixture_count: number;
    blockers: string[];
  };
  results: V5EvalResult[];
}

export interface V5EvalHarnessOptions {
  fixtureDir?: string;
  marketReady?: boolean;
  now?: Date;
}

export interface V5EvalRun {
  exitCode: number;
  report: V5EvalReport;
}
