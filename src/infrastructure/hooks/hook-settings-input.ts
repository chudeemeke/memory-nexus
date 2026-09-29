import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertMaintenanceTargets } from "../maintenance-targets.js";
import type { ClaudeSettings } from "./settings-manager.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the structure consumed by the current hook settings writer. */
export function parseHookSettings(content: string): ClaudeSettings {
  let value: unknown;
  try { value = JSON.parse(content); }
  catch { throw new Error("Hook settings contain invalid JSON."); }
  if (!record(value)) throw new Error("Hook settings must be an object.");
  if (value.hooks !== undefined) {
    if (!record(value.hooks)) throw new Error("Hook settings hooks must be an object.");
    for (const configs of Object.values(value.hooks)) {
      if (!Array.isArray(configs)) throw new Error("Hook event settings must be arrays.");
      for (const config of configs) {
        if (!record(config) || !Array.isArray(config.hooks)) throw new Error("Hook configuration must contain a hooks array.");
        for (const entry of config.hooks) {
          if (!record(entry) || typeof entry.command !== "string") throw new Error("Unsupported hook entry: a command string is required.");
        }
      }
    }
  }
  return value as ClaudeSettings;
}

/** Missing settings are empty; unreadable or malformed settings never are. */
export function readHookSettingsForMutation(
  path: string,
  read: (path: string) => string = path => readFileSync(path, "utf8"),
): ClaudeSettings {
  assertMaintenanceTargets([{ path, kind: "file" }]);
  let content: string;
  try { content = read(path); }
  catch (error) {
    if (record(error) && error.code === "ENOENT") return {};
    throw new Error("Cannot read hook settings for mutation.");
  }
  return parseHookSettings(content);
}

/** Read-only leaf admission, not a lock against subsequent path replacement. */
export function assertDistinctHookTargets(paths: readonly string[], platform = process.platform): void {
  const identities = paths.map(path => {
    if (!path.trim()) throw new Error("Hook mutation paths must not be empty.");
    const absolute = resolve(path);
    return platform === "win32" ? absolute.toLowerCase() : absolute;
  });
  if (new Set(identities).size !== paths.length) throw new Error("Hook mutation targets must be distinct.");
  assertMaintenanceTargets(paths.map(path => ({ path, kind: "file" })));
}
