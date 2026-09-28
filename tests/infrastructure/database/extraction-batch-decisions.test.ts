import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { SqliteFactRepository } from "../../../src/infrastructure/database/repositories/fact-repository.js";
import { SqliteExtractionLogRepository } from "../../../src/infrastructure/database/repositories/extraction-log-repository.js";
import { SqliteMessageRepository } from "../../../src/infrastructure/database/repositories/message-repository.js";
import { SqliteSessionRepository } from "../../../src/infrastructure/database/repositories/session-repository.js";
import { appendEvent, rebuildProjections } from "../../../src/infrastructure/database/event-log.js";
import { ExtractionPipeline } from "../../../src/application/services/extraction-pipeline.js";
import { Fact, type CandidateFact } from "../../../src/domain/entities/fact.js";
import { Message } from "../../../src/domain/entities/message.js";
import { Session } from "../../../src/domain/entities/session.js";
import { ProjectPath } from "../../../src/domain/value-objects/project-path.js";
import { EmbeddingResult } from "../../../src/domain/value-objects/embedding-result.js";
import type { IEmbeddingProvider } from "../../../src/domain/ports/embedding.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

const candidate = (content: string): CandidateFact => ({ type: "learning", content, confidence: 0.9 });
const seed = (uuid: string, content: string, day = 1) => Fact.create({ uuid, content, type: "learning", project: "synthetic", observedAt: new Date(`2026-01-0${day}T00:00:00Z`) });

function embedder(angles: Record<string, number>): IEmbeddingProvider {
  const result = (text: string) => {
    const angle = angles[text];
    if (angle === undefined) throw Error("Missing synthetic vector");
    const radians = angle * Math.PI / 180;
    return EmbeddingResult.create({ embedding: new Float32Array([Math.cos(radians), Math.sin(radians)]), model: "synthetic", dimensions: 2 });
  };
  return { name: "synthetic", model: "synthetic", dimensions: 2, isReady: () => true,
    initialize: async () => {}, dispose: async () => {}, embed: async text => result(text),
    embedBatch: async texts => texts.map(result) };
}

async function fixture(run: (context: {
  db: OwnedDatabase; log: string; facts: SqliteFactRepository; audits: SqliteExtractionLogRepository;
  extract: (candidates: CandidateFact[], vectors?: IEmbeddingProvider) => ReturnType<ExtractionPipeline["extractFromSession"]>;
  addSeeds: (...facts: Fact[]) => Promise<void>;
}) => Promise<void>): Promise<void> {
  const storage = createOwnedTestDirectory("memory-extraction-batch-"), db = new OwnedDatabase(join(storage.dir, "synthetic.db"));
  try {
    createSchema(db);
    const log = join(storage.dir, "events", "events-a.jsonl"), facts = new SqliteFactRepository(db), audits = new SqliteExtractionLogRepository(db), messages = new SqliteMessageRepository(db);
    await new SqliteSessionRepository(db).save(Session.create({ id: "session", projectPath: ProjectPath.fromDecoded("C:\\Projects\\synthetic"), startTime: new Date("2026-01-01T00:00:00Z") }));
    await messages.save(Message.create({ id: "message", role: "user", content: "synthetic batch input", timestamp: new Date("2026-01-01T00:00:00Z") }), "session");
    await run({ db, log, facts, audits,
      extract: (candidates, vectors) => new ExtractionPipeline(db, facts, audits, messages, { providerId: "synthetic", modelName: "synthetic", extract: async () => candidates }, vectors, log).extractFromSession("session", "synthetic"),
      addSeeds: async (...input) => { for (const fact of input) await appendEvent(fact, log); await rebuildProjections(db, log); },
    });
  } finally { db.close(); storage.cleanup(); }
}

it("batch compares new facts before accepting exact and lexical duplicates", async () => fixture(async ({ extract, facts, audits, db, log }) => {
  const result = await extract([candidate("synthetic duplicate value"), candidate(" SYNTHETIC duplicate value "), candidate("synthetic, duplicate value!")]);
  expect(result).toEqual({ skippedSession: false, added: 1, updated: 0, superseded: 0, skipped: 2 });
  expect((await facts.findByProject("synthetic")).map(f => f.content)).toEqual(["synthetic duplicate value"]);
  expect(await audits.findById("session")).toMatchObject({ factsAdded: 1, factsUpdated: 0, factsSuperseded: 0, factsSkipped: 2 });
  const bytes = readFileSync(log, "utf8"); await rebuildProjections(db, log);
  expect(await facts.findByProject("synthetic")).toHaveLength(1);
  expect((await extract([candidate("ignored after audit")])).skippedSession).toBe(true);
  expect(readFileSync(log, "utf8")).toBe(bytes);
}));

it("batch lexical replacements form one ordered chain without resurrecting an earlier candidate", async () => fixture(async ({ extract, facts, audits, db, log }) => {
  const base = "one two three four five six seven eight nine ten eleven twelve";
  const [a, b, c] = ["alpha", "beta", "gamma"].map(word => base + " " + word);
  expect(await extract([a!, b!, c!, a!].map(candidate))).toEqual({ skippedSession: false, added: 3, updated: 2, superseded: 2, skipped: 1 });
  const knowledge = (await facts.findByProject("synthetic")).filter(f => f.type !== "supersedence");
  const first = knowledge.find(f => f.content === a)!, second = knowledge.find(f => f.content === b)!, last = knowledge.find(f => f.content === c)!;
  expect(knowledge).toHaveLength(3); expect(first.supersededBy).toBe(second.uuid); expect(second.supersededBy).toBe(last.uuid); expect(last.supersededAt).toBeNull();
  expect(await audits.findById("session")).toMatchObject({ factsAdded: 3, factsUpdated: 2, factsSuperseded: 2, factsSkipped: 1 });
  await rebuildProjections(db, log);
  expect((await facts.findByProject("synthetic")).filter(f => f.type !== "supersedence" && f.supersededAt === null).map(f => f.content)).toEqual([c!]);
}));

it("batch carries new candidate vectors into semantic duplicate decisions", async () => fixture(async ({ extract, facts }) => {
  expect(await extract([candidate("first meaning"), candidate("different wording")], embedder({ "first meaning": 0, "different wording": 10 }))).toEqual({ skippedSession: false, added: 1, updated: 0, superseded: 0, skipped: 1 });
  expect((await facts.findByProject("synthetic")).map(f => f.content)).toEqual(["first meaning"]);
}));

it("batch keeps replacement vectors aligned and skips semantic repeats of retired facts", async () => fixture(async ({ extract, addSeeds, facts }) => {
  await addSeeds(seed("original", "initial knowledge"));
  const result = await extract(["first replacement", "second replacement", "rephrased first", "third replacement"].map(candidate), embedder({ "initial knowledge": 0, "first replacement": 25, "second replacement": 50, "rephrased first": 27, "third replacement": 75 }));
  expect(result).toEqual({ skippedSession: false, added: 3, updated: 3, superseded: 3, skipped: 1 });
  const rows = (await facts.findByProject("synthetic")).filter(f => f.type !== "supersedence");
  const first = rows.find(f => f.content === "first replacement")!, second = rows.find(f => f.content === "second replacement")!, last = rows.find(f => f.content === "third replacement")!;
  expect(rows).toHaveLength(4); expect(rows.find(f => f.uuid === "original")?.supersededBy).toBe(first.uuid); expect(first.supersededBy).toBe(second.uuid); expect(second.supersededBy).toBe(last.uuid); expect(last.supersededAt).toBeNull();
}));

it("batch never targets a retired fact for a conflicting second supersedence", async () => fixture(async ({ extract, addSeeds, facts }) => {
  await addSeeds(seed("original", "initial knowledge"));
  expect(await extract(["first replacement", "independent result"].map(candidate), embedder({ "initial knowledge": 0, "first replacement": 25, "independent result": -20 }))).toEqual({ skippedSession: false, added: 2, updated: 1, superseded: 1, skipped: 0 });
  const rows = (await facts.findByProject("synthetic")).filter(f => f.type !== "supersedence");
  const first = rows.find(f => f.content === "first replacement")!;
  expect(rows.find(f => f.uuid === "original")?.supersededBy).toBe(first.uuid);
  expect(rows.filter(f => f.supersededAt === null).map(f => f.content).sort()).toEqual(["first replacement", "independent result"]);
}));

it("batch initial ordering preserves each fact's vector pairing", async () => fixture(async ({ extract, addSeeds, facts }) => {
  await addSeeds(seed("z", "aligned target", 2), seed("a", "unrelated target", 1));
  expect((await facts.findByProject("synthetic"))[0]?.uuid).toBe("z");
  expect(await extract([candidate("replacement")], embedder({ "aligned target": 0, "unrelated target": 90, replacement: 25 }))).toMatchObject({ added: 1, superseded: 1 });
  expect((await facts.findByUuid("z"))?.supersededAt).not.toBeNull(); expect((await facts.findByUuid("a"))?.supersededAt).toBeNull();
}));

for (const reverse of [false, true]) it(`batch score ties use stable fact identity with reversed repository order=${reverse}`, async () => fixture(async ({ extract, addSeeds, facts }) => {
  await addSeeds(seed("a", "first initial", reverse ? 2 : 1), seed("b", "second initial", reverse ? 1 : 2));
  expect((await facts.findByProject("synthetic"))[0]?.uuid).toBe(reverse ? "a" : "b");
  expect(await extract([candidate("replacement")], embedder({ "first initial": -25, "second initial": 25, replacement: 0 }))).toMatchObject({ added: 1, superseded: 1 });
  expect((await facts.findByUuid("a"))?.supersededAt).not.toBeNull(); expect((await facts.findByUuid("b"))?.supersededAt).toBeNull();
}));
