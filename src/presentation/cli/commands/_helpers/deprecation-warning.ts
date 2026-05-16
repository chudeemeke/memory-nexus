/**
 * Phase 32 (CLI-03) deprecation-warning helper.
 *
 * Emits a one-shot stderr warning when a deprecated `--format` alias
 * value is passed. Suppressed in `--json` mode so the JSON-on-stdout
 * contract isn't polluted by advisory stderr.
 *
 * Module-scoped Set tracks emissions per process to prevent log
 * floods if a CLI invocation calls into a command multiple times
 * (e.g. tests that share the module). The Set key is the command
 * + alias pair, so each unique deprecated alias warns once per
 * process.
 *
 * Precedence rule (matches Plan 32-02 Codex HIGH-5 contract):
 *   --quiet ≥ brief; --json suppresses warning (already on stdout).
 *
 * Removal: aliases `default` (search/list/show/stats) and `detailed`
 * (context/related) are scheduled for removal in the next minor
 * release. CHANGELOG.md documents the cadence.
 */

const emitted = new Set<string>();

export interface EmitDeprecationOptions {
  /** Command name (e.g. "search"). Used as part of the once-key. */
  command: string;
  /** The deprecated alias value seen (e.g. "default" or "detailed"). */
  alias: string;
  /** Suggested replacement message (e.g. "Use --format brief or --format ai."). */
  replacement: string;
  /**
   * Whether --json is set; if true, warning is suppressed.
   * Explicit `undefined` allowed because callers commonly pass the
   * `options.json` value directly (project uses
   * `exactOptionalPropertyTypes: true`).
   */
  json?: boolean | undefined;
}

export function emitFormatDeprecationWarning(
  options: EmitDeprecationOptions,
): void {
  if (options.json) {
    return;
  }
  const key = `${options.command}:--format=${options.alias}`;
  if (emitted.has(key)) {
    return;
  }
  emitted.add(key);
  console.error(
    `warning: --format ${options.alias} is deprecated and will be removed in the next minor release. ${options.replacement}`,
  );
}

/**
 * Reset emitted-keys tracker. Test-only — production code does not
 * call this. Allows per-test isolation of one-shot semantics.
 */
export function resetFormatDeprecationWarningsForTesting(): void {
  emitted.clear();
}
