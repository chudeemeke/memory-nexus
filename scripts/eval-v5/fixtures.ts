import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  V5_EVAL_DIMENSIONS,
  type V5EvalDimension,
  type V5EvalFixture,
  type V5EvalMode,
} from "./types.js";

const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
export const DEFAULT_V5_FIXTURE_DIR = join(PROJECT_ROOT, "docs", "evals", "fixtures", "v5");

const VALID_MODES: readonly V5EvalMode[] = ["behavior", "contract"];
const RAW_SECRET_PATTERN =
  /\b(?:sk-ant-|sk-|gh[pousr]_|tskey-(?:auth|client)-|AKIA|ASIA)[A-Za-z0-9_-]{12,}\b|Bearer\s+[A-Za-z0-9._~+/=-]{16,}|[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL)[A-Z0-9_]*\s*=\s*["']?[^"',\]\s]{8,}/;
const PRIVATE_PATH_PATTERN =
  /C:\\Users\\Destiny\\iCloudDrive\\Documents\\AI Tools|\/mnt\/c\/Users\/Destiny\/iCloudDrive\/Documents\/AI Tools/i;

export interface LoadedFixture {
  fixture: V5EvalFixture;
  source: string;
}

export function loadFixtures(fixtureDir = DEFAULT_V5_FIXTURE_DIR): LoadedFixture[] {
  const resolvedDir = resolve(fixtureDir);
  if (!existsSync(resolvedDir)) {
    throw new Error(`Fixture directory not found: ${resolvedDir}`);
  }

  const files = readdirSync(resolvedDir)
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`No v5 eval fixtures found in ${resolvedDir}`);
  }

  return files.map((file) => {
    const source = join(resolvedDir, file);
    return {
      source,
      fixture: JSON.parse(readFileSync(source, "utf-8")) as V5EvalFixture,
    };
  });
}

export function validateFixture(fixture: unknown, source: string): string[] {
  const errors: string[] = [];

  if (!isRecord(fixture)) {
    return [`${source} must contain a JSON object`];
  }

  if (fixture.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }
  if (!isNonEmptyString(fixture.id) || !/^[a-z0-9][a-z0-9_-]*$/.test(fixture.id)) {
    errors.push("id must be a non-empty lowercase slug");
  }
  if (!isNonEmptyString(fixture.title)) {
    errors.push("title must be a non-empty string");
  }
  if (!isEvalDimension(fixture.dimension)) {
    errors.push(`dimension must be one of: ${V5_EVAL_DIMENSIONS.join(", ")}`);
  }
  if (!VALID_MODES.includes(fixture.mode as V5EvalMode)) {
    errors.push("mode must be behavior or contract");
  }
  if (!isNonEmptyString(fixture.ownerPhase)) {
    errors.push("ownerPhase must be a non-empty string");
  }
  if (!Array.isArray(fixture.tags) || fixture.tags.some((tag) => !isNonEmptyString(tag))) {
    errors.push("tags must be an array of non-empty strings");
  }

  if (!isRecord(fixture.sanitized)) {
    errors.push("sanitized must be an object");
  } else {
    if (fixture.sanitized.containsRawSecrets !== false) {
      errors.push("sanitized.containsRawSecrets must be false");
    }
    if (fixture.sanitized.containsPrivateTranscript !== false) {
      errors.push("sanitized.containsPrivateTranscript must be false");
    }
    if (!Array.isArray(fixture.sanitized.notes) || fixture.sanitized.notes.some((note) => !isNonEmptyString(note))) {
      errors.push("sanitized.notes must be an array of non-empty strings");
    }
  }

  if (!isRecord(fixture.input)) {
    errors.push("input must be an object");
  }
  if (!isRecord(fixture.expected)) {
    errors.push("expected must be an object");
  }

  const storedStrings = collectStrings(fixture);
  if (storedStrings.some((value) => RAW_SECRET_PATTERN.test(stripRedactedAssignments(value)))) {
    errors.push("fixture appears to contain raw secret-like material");
  }
  if (storedStrings.some((value) => PRIVATE_PATH_PATTERN.test(value))) {
    errors.push("fixture appears to contain a private unsymlinked local path");
  }

  return errors;
}

export function assertValidFixtures(loadedFixtures: LoadedFixture[]): V5EvalFixture[] {
  const failures = loadedFixtures.flatMap(({ fixture, source }) =>
    validateFixture(fixture, source).map((error) => `${source}: ${error}`),
  );

  if (failures.length > 0) {
    throw new Error(`Invalid v5 eval fixtures:\n${failures.join("\n")}`);
  }

  return loadedFixtures.map(({ fixture }) => fixture);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEvalDimension(value: unknown): value is V5EvalDimension {
  return V5_EVAL_DIMENSIONS.includes(value as V5EvalDimension);
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }
  if (isRecord(value)) {
    return Object.values(value).flatMap((item) => collectStrings(item));
  }
  return [];
}

function stripRedactedAssignments(value: string): string {
  return value.replace(
    /\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL)[A-Z0-9_]*\s*=\s*\[REDACTED:[^\]]+\]/g,
    "",
  );
}
