import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { initializeDatabase } from "../../../../src/infrastructure/database/connection.js";
import { SqlitePersonaRepository } from "../../../../src/infrastructure/database/repositories/persona-repository.js";
import { PersonaEntry } from "../../../../src/domain/entities/persona-entry.js";

const NOW = new Date("2026-06-07T00:00:00.000Z");

describe("SqlitePersonaRepository", () => {
  let db: Database;
  let repo: SqlitePersonaRepository;

  beforeEach(() => {
    const initialized = initializeDatabase({ path: ":memory:", walMode: false, quickCheck: false });
    db = initialized.db;
    repo = new SqlitePersonaRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  test("saves entries and filters context by same project plus global", async () => {
    await repo.save(makeEntry("memory-project", "project", "memory-nexus"));
    await repo.save(makeEntry("global-rule", "global"));
    await repo.save(makeEntry("authkey-project", "project", "authkey"));

    const memoryContext = await repo.findForContext("memory-nexus");

    expect(memoryContext.map((entry) => entry.entryId).sort()).toEqual(["global-rule", "memory-project"]);
  });

  test("findAll filters by project and kind, and deleteByProject preserves global entries", async () => {
    await repo.save(makeEntry("memory-preference", "project", "memory-nexus", "preference"));
    await repo.save(makeEntry("memory-procedure", "project", "memory-nexus", "procedure"));
    await repo.save(makeEntry("global-rule", "global"));

    const preferences = await repo.findAll({ project: "memory-nexus", kind: "preference" });
    expect(preferences.map((entry) => entry.entryId)).toEqual(["memory-preference"]);

    await repo.deleteByProject("memory-nexus");

    const remaining = await repo.findAll();
    expect(remaining.map((entry) => entry.entryId)).toEqual(["global-rule"]);
  });

  test("supports visibility filters, no-global context, expiry round-trip, upsert, and empty batches", async () => {
    await repo.save(makeEntry("memory-project", "project", "memory-nexus", "preference", {
      expiresAt: new Date("2026-08-07T00:00:00.000Z"),
    }));
    await repo.save(makeEntry("global-rule", "global"));
    await repo.save(makeEntry("memory-project", "project", "memory-nexus", "procedure", {
      content: "updated project content",
      sourceKinds: ["procedure"],
      expiresAt: new Date("2026-08-07T00:00:00.000Z"),
    }));

    const globals = await repo.findAll({ visibility: "global", limit: 1 });
    const projectOnly = await repo.findForContext("memory-nexus", { includeGlobal: false, limit: 5 });
    const missing = await repo.findByEntryId("missing-entry");
    const emptySaved = await repo.saveMany([]);

    expect(globals.map((entry) => entry.entryId)).toEqual(["global-rule"]);
    expect(projectOnly.map((entry) => entry.entryId)).toEqual(["memory-project"]);
    expect(projectOnly[0]?.kind).toBe("procedure");
    expect(projectOnly[0]?.content).toBe("updated project content");
    expect(projectOnly[0]?.expiresAt?.toISOString()).toBe("2026-08-07T00:00:00.000Z");
    expect(missing).toBeNull();
    expect(emptySaved).toEqual([]);
  });

  test("clearAll removes persona entries across scopes", async () => {
    await repo.save(makeEntry("memory-project", "project", "memory-nexus"));
    await repo.save(makeEntry("global-rule", "global"));

    await repo.clearAll();

    expect(await repo.findAll()).toEqual([]);
  });
});

function makeEntry(
  entryId: string,
  visibility: "project" | "global",
  project?: string,
  kind: "preference" | "procedure" = "preference",
  overrides: Partial<Parameters<typeof PersonaEntry.create>[0]> = {},
): PersonaEntry {
  return PersonaEntry.create({
    entryId,
    kind,
    content: `${entryId} content`,
    project,
    visibility,
    sourceEventIds: [`evt-${entryId}`],
    sourceKinds: [kind],
    confidence: 0.9,
    scope: visibility === "project" ? { project, visibility } : { visibility },
    reviewStatus: "pending_review",
    reviewAfter: new Date("2026-07-07T00:00:00.000Z"),
    why: "Test fixture.",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}
