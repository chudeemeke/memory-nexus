/**
 * Uniform JSON envelope for query commands (CLI-02 foundation).
 *
 * SCHEMA VERSION POLICY:
 * Bump ENVELOPE_SCHEMA_VERSION ONLY when the field set changes in a
 * backward-incompatible way:
 *   - Renaming a top-level field (e.g., `data` → `payload`)
 *   - Changing a field type (e.g., `kind: string` → `kind: object`)
 *   - Removing a field
 *   - Changing semantics of an existing field
 *
 * Additive changes (new optional fields, new kinds in QUERY_RESULT_KINDS,
 * new entries in EnvelopeScope union) do NOT bump the schema version.
 * Consumers should ignore unknown fields gracefully.
 *
 * Phase 32.5 forward-compat: `kind` and `scope` are reserved for the
 * unified query primitive (`memory query --scope <project|global>
 * --kind <message|session|...>`). Phase 32 sets `kind` from the command
 * name; Phase 32.5 will set `kind` from a CLI flag. No schema change.
 */

/**
 * Current envelope schema version. Bump only per the policy above.
 */
export const ENVELOPE_SCHEMA_VERSION = "1" as const;

/**
 * Runtime tuple of query command names. Types derived from this so callers
 * can use both the values (e.g. `QUERY_COMMAND_NAMES.includes(x)`) and the
 * literal union type (`QueryCommandName`). Per Codex HIGH-1.
 */
export const QUERY_COMMAND_NAMES = [
  "search",
  "context",
  "show",
  "list",
  "related",
  "stats",
] as const;

/**
 * Union of valid query command names, derived from QUERY_COMMAND_NAMES.
 */
export type QueryCommandName = (typeof QUERY_COMMAND_NAMES)[number];

/**
 * Runtime tuple of result kinds. Includes `"file"` so `search --files`
 * (HIGH-4) has a stable kind in the envelope. Phase 32.5 will route the
 * unified query primitive's `--kind` flag through this same set.
 */
export const QUERY_RESULT_KINDS = [
  "message",
  "session",
  "context",
  "related",
  "stats",
  "file",
] as const;

/**
 * Union of valid query result kinds, derived from QUERY_RESULT_KINDS.
 */
export type QueryResultKind = (typeof QUERY_RESULT_KINDS)[number];

/**
 * Discriminated union for envelope scope. Maps 1:1 to Phase 32.5's
 * `--scope global|project [--project <name>]` without ambiguity.
 * Per Codex MEDIUM-4.
 */
export type EnvelopeScope =
  | { type: "global" }
  | { type: "project"; project: string };

/**
 * Success envelope shape. `data` is generic so each command can carry
 * its own payload type. `schema_version` is a literal "1" so consumers
 * can branch on shape evolution.
 */
export interface QueryResultEnvelope<T = unknown> {
  schema_version: typeof ENVELOPE_SCHEMA_VERSION;
  command: QueryCommandName;
  kind: QueryResultKind;
  scope?: EnvelopeScope;
  meta?: Record<string, unknown>;
  data: T;
}

/**
 * Error envelope shape. `error.code` is a domain ErrorCode string
 * (e.g. "DB_CONNECTION_FAILED"); `error.context` carries structured
 * details from MemoryError instances.
 */
export interface QueryErrorEnvelope {
  schema_version: typeof ENVELOPE_SCHEMA_VERSION;
  command: QueryCommandName;
  error: {
    code: string;
    message: string;
    context?: Record<string, unknown>;
  };
}

/**
 * Construct a success envelope. Optional fields are omitted from the
 * resulting object when undefined (no `"scope": undefined` leakage in
 * JSON.stringify output).
 */
export function buildEnvelope<T>(args: {
  command: QueryCommandName;
  kind: QueryResultKind;
  data: T;
  scope?: EnvelopeScope;
  meta?: Record<string, unknown>;
}): QueryResultEnvelope<T> {
  return {
    schema_version: ENVELOPE_SCHEMA_VERSION,
    command: args.command,
    kind: args.kind,
    ...(args.scope !== undefined ? { scope: args.scope } : {}),
    ...(args.meta !== undefined ? { meta: args.meta } : {}),
    data: args.data,
  };
}

/**
 * Construct an error envelope. `error.context` is omitted when undefined.
 */
export function buildErrorEnvelope(args: {
  command: QueryCommandName;
  code: string;
  message: string;
  context?: Record<string, unknown>;
}): QueryErrorEnvelope {
  return {
    schema_version: ENVELOPE_SCHEMA_VERSION,
    command: args.command,
    error: {
      code: args.code,
      message: args.message,
      ...(args.context !== undefined ? { context: args.context } : {}),
    },
  };
}

/**
 * Emit a success envelope to stdout as pretty-printed JSON.
 *
 * Per Codex HIGH-2: this is the canonical write surface for Plan 02
 * success/empty-result branches. Every query command's exit path routes
 * through here so stdout shape stays uniform.
 *
 * Does NOT set process.exitCode — the caller still returns
 * `{ exitCode: 0 }` (or whatever CommandResult shape it uses).
 */
export function emitJsonEnvelope<T>(args: {
  command: QueryCommandName;
  kind: QueryResultKind;
  data: T;
  scope?: EnvelopeScope;
  meta?: Record<string, unknown>;
}): void {
  console.log(JSON.stringify(buildEnvelope(args), null, 2));
}

/**
 * Emit an error envelope to stdout as pretty-printed JSON.
 *
 * Per Codex HIGH-2: this is the canonical write surface for Plan 02
 * validation/not-found/catch branches. Every error exit path routes
 * through here so stdout shape stays uniform regardless of failure mode.
 *
 * Does NOT set process.exitCode — the caller still returns
 * `{ exitCode: 1 }` (or whatever CommandResult shape it uses).
 */
export function emitJsonErrorEnvelope(args: {
  command: QueryCommandName;
  code: string;
  message: string;
  context?: Record<string, unknown>;
}): void {
  console.log(JSON.stringify(buildErrorEnvelope(args), null, 2));
}
