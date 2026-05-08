# Adversarial Performance & Test-Coverage Review — 2026-04-26

**Reviewer angle:** Latency at scale, throughput, memory, test-coverage discipline
**Target:** memory-nexus @ commit on disk 2026-04-26
**Production corpus probed:** 2,773 sessions, 282,017 messages, 105,080 tool uses, **1.1 GB on disk** (plus a 942 MB stale backup file in the data dir), 99.75% embedding coverage

## Summary

Search latency is **5.5–6.6 seconds per CLI invocation** at the current 282k-message corpus. The bottleneck is NOT the search itself (FTS5 cold = 50 ms, vector KNN = 534 ms) — it is **`PRAGMA quick_check(1)`** running on every CLI invocation against a 1.1 GB database (5,251 ms measured). At a forecast 10× corpus, every command will take ~50 s of pre-flight integrity check. This is a CRITICAL scaling cliff already arriving. Coverage discipline is partially undermined by tooling: bun's coverage emits only `% Funcs` and `% Lines` (not statements, not branches), so the 95%-each-of-four-metrics standard from `quality-standards.md` is effectively reduced to 95%-each-of-two. The bunfig.toml declares the four-metric threshold, but the test runner cannot enforce two of them. Unit/integration ratio is acceptable (375 unit + 10 integration), but there are **zero end-to-end and zero benchmark tests** in a project whose entire value proposition is search performance.

Counts: **2 CRITICAL, 4 HIGH, 6 MEDIUM, 3 LOW**

## Coverage (actual numbers)

| Metric | Reported by bun test --coverage | Threshold (bunfig.toml) | Enforced? |
|---|---|---|---|
| Statements | not reported | 0.95 | NO — bun does not emit statement counts |
| Branches | not reported | 0.95 | NO — bun does not emit branch counts (lcov has no `BRDA`/`BRF`/`BRH` records) |
| Functions | 98.50% on `src/domain/**` | 0.95 | yes (lines + funcs only) |
| Lines | 99.90% on `src/domain/**` | 0.95 | yes |

Domain-only run: 447 tests, 0 failures, 215 ms wall time. Coverage on src/application, src/infrastructure, src/presentation was **not separately verified in this audit** — the full-suite coverage run produced interleaved test stdout that overran the buffer. Domain coverage is high, but the project layers under domain are larger and less validated by this report. Test:code line ratio is 52,172 / 28,371 ≈ **1.84:1**.

Test counts:
- Domain unit: 21 files
- Application unit: 16 files
- Infrastructure unit: 43 files
- Presentation unit: 47 files
- Integration (`tests/`): 10 files (concurrent-commands, large-file, programmatic-api, sync-with-memory-files, interrupted-sync, api-consumption, plus repository integration helpers)
- Smoke: 1 file (cli-commands)
- E2E: **0**
- Benchmarks: **0** (no `*.bench.ts`, no `bench` script in package.json)

## Findings (severity-ranked)

### CRITICAL — C1: `PRAGMA quick_check(1)` on every CLI invocation, scales with DB size

**Where:** `src/infrastructure/database/connection.ts:204-215`

```typescript
if (quickCheck) {
    const result = db.query<{ quick_check: string }, []>("PRAGMA quick_check(1);").get();
```

**Measured:** 5,251 ms on the 1.1 GB production DB. Direct profiling:

```
DB open:         1 ms
Pragmas:         6 ms
quick_check:  5251 ms     <-- 99% of cold-start
sqlite-vec load: 16 ms
count messages: 45 ms
```

`quick_check` defaults to `true` for every existing file DB. So `memory --help` is fast (no DB), but `memory search`, `memory list`, `memory stats`, `memory context` all pay 5.2 s up front. Measured end-to-end:

| Command | Latency (ms) |
|---|---|
| `memory --help` (no DB) | 474 |
| `memory list --limit 1` | 4,974 / 5,279 / 6,095 |
| `memory search "X" --mode fts` | 5,295 / 5,488 / 5,640 |
| `memory search "X" --mode hybrid` | 6,474 / 6,606 / 6,864 |

**Scaling forecast (quick_check is roughly O(N) with DB pages):**

| Corpus | DB size (linear est.) | quick_check est. | User-facing latency est. |
|---|---|---|---|
| 282k msgs (today) | 1.1 GB | 5.2 s | 5.5–6.6 s |
| 1M msgs (~6 mo) | ~3.9 GB | ~18 s | ~19 s |
| 10M msgs (~24 mo) | ~39 GB | ~3 min | ~3 min |

**Why this matters:** the user runs `memory search` ad hoc, often inside Claude Code sessions where 5 s is already too slow to feel responsive. At 1 M messages it crosses the 20-s "abandon the operation" threshold. AT 10 M it's unusable.

**Fix options (cheap → expensive):**

1. **Default `quickCheck` to `false`.** It already defaults to `true` only for existing file DBs. Make it opt-in via a flag or a periodic background job. Risk: corruption goes undetected longer, but the user's `memory doctor` command exists for that exact purpose.
2. **Run `quick_check` only on first invocation per day** (cache last-run timestamp in config), or **only when DB size has grown by >10%** since last check.
3. **Move integrity verification to `memory doctor`** (already exists) and have it run async on hook install.

The current default — synchronous full integrity scan on every invocation — does not survive 10× scale.

---

### CRITICAL — C2: Branch and statement coverage are not measured, despite being declared mandatory

**Where:** `bunfig.toml`, `package.json`, the user's `~/.claude/rules/quality-standards.md`

```toml
# bunfig.toml
coverageThreshold = { line = 0.95, function = 0.95, statement = 0.95, branch = 0.95 }
```

**Reality:** `bun test --coverage` outputs columns `% Funcs` and `% Lines` only. The lcov.info file emitted by `--coverage-reporter=lcov` contains no `BRDA`, `BRF`, or `BRH` records, only `DA` (line) and `FN/FNDA` (function) entries.

```
$ grep "^BRDA\|^BRH\|^BRF" coverage/lcov.info
(no output)
```

The user's standard from `~/.claude/rules/quality-standards.md`:

> 100% statements with 85% branches = "96% overall" but **FAILS**. Each metric is independent.

Two of the four declared-mandatory metrics are unmeasured and unenforced. A test suite passing 100% statements but 60% branches will pass `bun test`. The `coverageThreshold` for branch and statement is ignored at runtime — bun silently accepts undefined keys, the threshold check never fires for them.

**Fix options:**

1. **Run mutation testing** (the project already has Stryker configured for `src/domain/**` via `bun mutation:domain`) — but this is currently scoped to domain only, not application/infrastructure/presentation. Branch coverage gaps in the larger layers will not be caught.
2. **Add c8/v8 coverage via vitest** (already aliased for Stryker in `vitest.config.ts`). c8 emits proper branch coverage.
3. **At minimum**, document that branch coverage cannot be enforced under bun and replace the threshold line with one that reflects what is actually measured. The current bunfig.toml lies about what it enforces.

---

### HIGH — H1: `embedBatch()` is a sequential loop, not a true batch

**Where:** `src/infrastructure/embedding/transformers-js-provider.ts:113-119`

```typescript
async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    for (const text of texts) {
        results.push(await this.embed(text));
    }
    return results;
}
```

The port docstring (`src/domain/ports/embedding.ts:74-82`) advertises:

> Batch processing is more efficient than calling `embed()` repeatedly because it reduces ONNX runtime overhead.

The implementation is exactly "calling embed() repeatedly." Every text incurs full ONNX call overhead. For a 282k-message embedding pass, this is the hot loop.

@huggingface/transformers v3 supports passing arrays to the pipeline directly: `pipeline(textsArray, { pooling: 'mean', normalize: true })` — this batches at the model level and reuses ONNX session state. Expected speedup: **3–8x** for typical batch sizes, depending on model and dimensions. With a 282k-message corpus, that's the difference between a 30-minute embedding pass and a 4–10 minute one.

**Fix:** call `pipeline(texts, opts)` once per batch in `embedBatch()`. Update the port docstring if the new behavior changes (it shouldn't — this is what the docstring already promised).

---

### HIGH — H2: Vector KNN is brute-force O(N) at query time; no ANN index

**Where:** `sqlite-vec` v0.1.6 (current). `src/infrastructure/database/repositories/embedding-repository.ts:161-171` issues:

```sql
SELECT rowid, distance
FROM message_embeddings
WHERE embedding MATCH ?
ORDER BY distance
LIMIT ?
```

sqlite-vec 0.1.6 implements vec0 as a brute-force linear scan over all stored vectors. There is no HNSW, IVF, or PQ index. **Measured: 534 ms KNN at 282k embeddings × 384 dims.** Scaling is roughly linear in vector count:

| Corpus | Vectors scanned/query | Est. KNN time |
|---|---|---|
| 282k (today) | 433 MB | 534 ms |
| 1M | 1.5 GB | ~1.9 s |
| 10M | 15 GB | ~19 s |

The hybrid search fetches `candidateLimit = limit * 4` vectors from FTS AND vector legs, so vector latency directly drives hybrid latency at scale.

**Fix options:**

1. Track sqlite-vec releases — HNSW is on the roadmap; upgrade when available.
2. Defer vector search to a separate process or pre-filter (e.g., by project) before KNN to limit scanned vectors.
3. Consider switching to a real vector DB (lancedb, qdrant-embedded) when corpus > 1 M.
4. In the meantime: **cap the embedding corpus to recent N months** by default, and offer `memory search --all-history` for the rare case the user wants the full corpus.

This is a HIGH not CRITICAL because a 1.9 s KNN at 1 M is still tolerable; the ship-stopper is C1 (quick_check), not this.

---

### HIGH — H3: Test pyramid has zero E2E and zero benchmarks for a search-performance product

A search engine with no benchmarks cannot detect performance regressions until users feel them. The current production latency (5.5–6.6 s) was not detected by any test — it was discoverable only by running `memory search` against the real DB. There is no protection against:

- A future PR adding a missing index removal
- A regression that doubles FTS query time
- An ONNX runtime upgrade that doubles embed latency
- A schema change that breaks WAL checkpoint behavior

Per the user's `~/.claude/rules/testing-pyramid.md`:

> E2E Tests (5-10%) ... Before release

There is one smoke test (`tests/smoke/cli-commands.test.ts`) which is closer to integration than E2E. There are no perf budgets in any test.

**Fix:** add `tests/bench/` with at minimum:
- FTS query latency benchmark (synthetic 100k-message DB)
- Vector KNN latency benchmark (synthetic 100k embeddings)
- Cold-start latency benchmark (with and without `quick_check`)
- Embed throughput benchmark (msgs/sec)

Add `bun run bench` script. Track regressions against committed baseline.

---

### HIGH — H4: SyncService buffers full session into memory, defeating streaming parser

**Where:** `src/application/services/sync-service.ts:437-439`

```typescript
const events: ParsedEvent[] = [];
for await (const event of this.eventParser.parse(session.path)) {
    events.push(event);
}
```

The `JsonlEventParser` is carefully written as an async generator (`createReadStream` + `readline`) to avoid loading entire files. Then SyncService immediately materializes the full generator into an array. For a session JSONL of, say, 200 MB (large agent transcripts can reach this), peak memory hits 200 MB plus parsed-event-overhead. With multiple sessions in concurrent processing or hooks running in parallel, this risks OOM on lower-end machines.

The integration test `tests/integration/large-file.test.ts` validates only the parser, not the full sync pipeline at scale.

**Fix:** restructure `extractSession` to process events in a streaming fashion — accumulate `messages`/`toolUses` arrays incrementally, then transact at the end. Or chunk into multiple transactions per session if the session is huge.

---

### MEDIUM — M1: 942 MB stale backup file in active data directory

**Observation:** `~/.local/share/memory/memory.db.bak-20260402-030135` (942 MB) sits next to the live `memory.db` (1.1 GB). The user has 2 GB of memory data on disk where 1.1 GB would suffice. There is no documented backup pruning policy in code or in `CLAUDE.md`. `memory export` exists but no rotation/retention.

**Fix:** add a backup retention policy (keep last N or last X days). Document it. Add `memory backup prune` or auto-prune on `memory backup` invocation.

---

### MEDIUM — M2: No index on `sessions.project_name` despite frequent `LIKE` queries

**Where:** `src/infrastructure/database/services/context-service.ts:139,285,317`, `src/infrastructure/database/services/search-service.ts:136`, `src/infrastructure/database/repositories/session-repository.ts:312`

All five sites use `WHERE project_name LIKE '%' || ? || '%'` (case-insensitive substring). Schema only indexes `project_path_encoded`, not `project_name`. With current 2,773 sessions, the table scan is fast (~1 ms). At 100k sessions it becomes meaningful.

A standard `CREATE INDEX ON sessions(project_name)` won't help with leading-wildcard LIKE — but `LOWER(project_name)` exact match would. Consider:
1. Adding an FTS index for project names if substring search is required, OR
2. Switching the API from substring to prefix match (`LIKE ? || '%'`) which a btree index DOES help.

This is MEDIUM not HIGH because session counts grow much slower than message counts.

---

### MEDIUM — M3: ProjectFilter in HybridSearchService re-queries sessions table per result

**Where:** `src/infrastructure/database/services/hybrid-search-service.ts:732-746` (`passesFilters`)

```typescript
if (options.projectFilter) {
    const session = this.db
        .prepare<{ project_name: string }, [string]>(
            "SELECT project_name FROM sessions WHERE id = ?"
        )
        .get(meta.session_id);
    ...
}
```

This is in a per-result loop. For a `--limit 50 --project foo` hybrid search, that's up to 50 individual SELECTs against the sessions table. Should be a single JOIN-based filter (as the FTS path already does in search-service.ts:132-138) or a batch lookup.

Prepared-statement reuse helps (Bun caches them), but it's still 50 round-trips.

---

### MEDIUM — M4: `Math.min(...scores)` and `Math.max(...scores)` on potentially large arrays

**Where:** `src/infrastructure/database/services/search-service.ts:213-215`

```typescript
const scores = rows.map((r) => r.score);
const minScore = Math.min(...scores);
const maxScore = Math.max(...scores);
```

`Math.min(...arr)` and `Math.max(...arr)` are JS spread, which has a stack-size cap (engine-specific, often around 65k–128k arguments before throwing `RangeError: Maximum call stack size exceeded`). The current `limit` in search is bounded by user input (default 10), so safe. But the `buildSearchQuery` allows unlimited `LIMIT ?`, and `hybridSearch` fetches `limit * 4`. If a future caller passes a large limit, this crashes. Defensive: use a manual loop or `arr.reduce((a, b) => Math.min(a, b))`.

---

### MEDIUM — M5: Mock-based unit tests in SyncService.test.ts vs real-DB integration test — no shared assertions

**Where:** `src/application/services/sync-service.test.ts` (mocks all repositories) vs `src/application/services/sync-service.integration.test.ts` (real DB).

The user's mistakes-log states:

> integration tests must hit a real database, not mocks. Reason: prior incident where mock/prod divergence masked a broken migration.

memory-nexus follows this — the integration test exists. **However**: the mock-based unit test does not share assertion shape with the integration test. They test different things. There is risk that a behavior tested in the unit suite (with mocks) does not actually hold against real SQLite (transaction edge cases, FK constraints, FTS triggers). Spot-check shows the real-DB tests are thinner than the mock tests on edge cases.

**Fix:** prefer real-DB testing in `:memory:` SQLite for any test that exercises repository semantics. Mocks should only be used to inject failure modes (DB throws, etc.) that real DB can't easily produce.

---

### MEDIUM — M6: No backups/archival of old data; DB grows unboundedly

The DB has grown to 1.1 GB in current usage. There is `memory purge` and `memory export` but no automatic archival. The user said sessions are deleted from `~/.claude/projects/` after 30 days, but extracted data in memory.db is kept forever. At ~10k messages/week growth, in 12 months DB will be ~3.7 GB; in 24 months ~7+ GB. Combined with C1 (quick_check), this compounds the cliff.

**Fix:** define an archival policy. E.g., `memory purge --before "1 year ago"` + automatic archival into a separate "cold" DB. Document retention defaults.

---

### LOW — L1: Stryker mutation testing scoped to domain only

**Where:** `package.json:26` — `"mutation:domain": "stryker run --mutate 'src/domain/**/!(*.test).ts'"`

Mutation testing is ONLY against the domain layer. Application, infrastructure, and presentation layers (the bulk of the code, ~85% of LOC) get no mutation testing. This is a known limitation but worth flagging — the domain has the highest coverage AND mutation testing, while the layers most likely to harbor real bugs (CLI parsing, FTS query construction, embedding pipeline) get neither metric-level branch coverage nor mutation testing.

---

### LOW — L2: Test files emit massive stdout, polluting coverage runs

When running `bun test --coverage`, several integration tests print large quantities of output to stdout (real `memory list --json` output, real session scan traces). This pollutes CI logs, makes failure debugging harder, and obscures coverage summary tables. Tests should suppress production output via a quiet mode or stdout capture in `beforeEach`.

---

### LOW — L3: Cold-start dynamic imports are good, but search command still pays them

The `search.ts` command imports `EmbeddingProviderFactory` at the top level rather than dynamically. For an FTS-only search (`--mode fts`, the user's most common case before embeddings exist), this still pulls in the factory's code. Negligible impact (factory is small until `createFromConfig` is called, which lazy-loads the provider), but the lazy-loading pattern in sync-embedding-pass.ts is not consistently applied to search.

---

## What's Done Well

1. **Hexagonal layering is rigorous.** Domain/application/infrastructure/presentation boundaries are real, tested, and reflected in import structure. The IEmbeddingProvider port is a textbook example.

2. **Real-DB integration tests for repository code.** `SqliteFrictionRepository` test, `EmbeddingRepository` test, etc. all use `:memory:` SQLite with real schema. This catches schema/SQL bugs that pure mocks would miss — and is exactly what the user's mistakes-log requires.

3. **Streaming JSONL parser with explicit large-file integration test.** The async generator + `tests/integration/large-file.test.ts` show care for memory efficiency at the parser level (even if SyncService partially defeats it — see H4).

## Open Questions

1. **Why is `quickCheck` defaulted to `true` on every CLI invocation?** Was this a paranoia setting from when the database was small? Did it ever catch a corruption in real use? If yes, the "run only once per day" mitigation is fine; if no, the default should be `false`.

2. **Is the 942 MB backup file a one-off or part of a recurring backup loop?** If recurring, what's the rotation? If one-off, why is it in the active data dir instead of an archive subdir?

3. **What's the budget for embedding pipeline runtime?** Re-embedding 282k messages today at sequential `embed()` rate is roughly N × per-call latency. With H1 fixed (true batching), is the user willing to accept a 5-minute pause when the model changes, or should re-embedding be backgrounded?

4. **Should `memory search` lazy-load `sqlite-vec` only when mode != 'fts'?** Currently sqlite-vec is loaded by `loadSqliteVecExtension` on every `initializeDatabase()` call. The 16 ms cost is small, but it's pure waste for FTS-only usage.

5. **Is mutation testing intended to expand beyond domain?** If the user's quality bar requires it, application + infrastructure should be in scope. If not, it should be documented as a deliberate boundary.
