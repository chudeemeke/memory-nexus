/**
 * CommandResult
 *
 * Return type for CLI command handlers. Commands return exit codes
 * instead of mutating process.exitCode directly, keeping handlers
 * pure and testable without global state.
 */

export interface CommandResult {
  exitCode: number;
}
