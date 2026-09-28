import type { FactType } from "./fact.js";

export interface ExtractionBatchEffect {
  uuid: string;
  type: FactType;
  content: string;
  metadata?: Record<string, unknown>;
}

/** Ordered facts and the original outcome; the containing envelope owns batch ID. */
export interface ExtractionBatchRecord {
  version: 1;
  sessionId: string;
  inputIdentity: string;
  project: string;
  provider: string;
  model: string;
  extractedAt: string;
  result: { added: number; updated: number; superseded: number; skipped: number };
  facts: ExtractionBatchEffect[];
}

const types = new Set(["decision", "learning", "preference", "friction", "observation", "supersedence"]);
function fail(): never { throw new Error("Invalid extraction batch descriptor"); }
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail();
}

/** Reject values JSON would silently erase/coerce; never invoke user accessors. */
function assertJson(value: unknown, ancestors = new Set<object>(), depth = 0): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value) || Object.is(value, -0)) fail(); return; }
  if (typeof value !== "object" || depth > 64 || ancestors.has(value)) fail();
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Reflect.ownKeys(descriptors).filter(key => !(array && key === "length"));
  if (array && names.length !== value.length) fail();
  ancestors.add(value);
  for (const name of names) {
    const descriptor = descriptors[name as string]!;
    if (typeof name !== "string" || !descriptor.enumerable || !("value" in descriptor)) fail();
    if (array && (!/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= value.length)) fail();
    assertJson(descriptor.value, ancestors, depth + 1);
  }
  ancestors.delete(value);
}

function validate(value: unknown): asserts value is ExtractionBatchRecord {
  assertJson(value);
  const record = object(value);
  keys(record, ["version", "sessionId", "inputIdentity", "project", "provider", "model", "extractedAt", "result", "facts"]);
  if (record.version !== 1) fail();
  for (const field of ["sessionId", "project", "provider", "model"]) if (!text(record[field])) fail();
  if (typeof record.inputIdentity !== "string" || !/^v1:[a-f0-9]{64}$/.test(record.inputIdentity)) fail();
  if (typeof record.extractedAt !== "string" || !Number.isFinite(Date.parse(record.extractedAt)) || new Date(record.extractedAt).toISOString() !== record.extractedAt) fail();
  const result = object(record.result); keys(result, ["added", "updated", "superseded", "skipped"]);
  for (const field of ["added", "updated", "superseded", "skipped"]) {
    const count = result[field]; if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) fail();
  }
  if (!Number.isSafeInteger((result.added as number) + (result.skipped as number))) fail();
  if (!Array.isArray(record.facts)) fail();
  const ids = new Map<string, string>();
  for (const value of record.facts) {
    const fact = object(value); keys(fact, ["uuid", "type", "content", "metadata"]);
    if (!text(fact.uuid) || !text(fact.content) || typeof fact.type !== "string" || !types.has(fact.type) || ids.has(fact.uuid)) fail();
    if (Object.hasOwn(fact, "metadata")) object(fact.metadata);
    ids.set(fact.uuid, fact.type);
  }
  const available = new Set<string>(), retired = new Set<string>(), replacements = new Set<string>();
  let added = 0, superseded = 0;
  for (const value of record.facts) {
    const fact = value as ExtractionBatchEffect;
    if (fact.type !== "supersedence") { available.add(fact.uuid); added++; continue; }
    const metadata = object(fact.metadata), target = metadata.superseded_uuid, replacement = metadata.superseded_by_uuid;
    if (!text(target) || !text(replacement) || target === replacement || retired.has(target)) fail();
    if (!available.has(replacement) || retired.has(replacement) || replacements.has(replacement)) fail();
    // An unknown target may be an existing fact. A known target must precede this effect.
    if (ids.has(target) && !available.has(target)) fail();
    retired.add(target); replacements.add(replacement); superseded++;
  }
  if (result.added !== added || result.updated !== superseded || result.superseded !== superseded) fail();
}

export class ExtractionBatch {
  private constructor(private readonly record: ExtractionBatchRecord) {}

  static fromJSON(value: unknown): ExtractionBatch {
    validate(value);
    return new ExtractionBatch(JSON.parse(JSON.stringify(value)) as ExtractionBatchRecord);
  }

  toJSON(): ExtractionBatchRecord {
    return JSON.parse(JSON.stringify(this.record)) as ExtractionBatchRecord;
  }
}
