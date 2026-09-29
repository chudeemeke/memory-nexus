**Verdict: APPROVE WITH CONDITIONS.** Conditions C1–C5 should gate merge.

I found no confirmed correctness defect in the hunks shown. The embedding-pass reorder and the coverage-evidence validation are both sound. The conditions exist because the central claim, that tests cannot touch the live store, depends on wiring that is not in the packet. I did not see `bunfig.toml`, the path resolver, `EmbeddingService`, or `bun.lock`.

I used no tools, and I wrote no plan file because this is a critique rather than an implementation plan. I did not check that any of the bumped versions exist.

## Merge-gating conditions

**C1. `tests/test-setup.ts`: cleanup runs in `afterAll`, and the retention message is false.**
- I could not confirm whether a preload-level `afterAll` on your pinned Bun runs once per process or once per test file.
- If it runs per file, the first file to finish deletes `testHome` while `HOME` and the `XDG_*` variables still point at it.
- Later files would then recreate the directory through recursive mkdirs. The owner marker is gone, the directory is never cleaned, and SQLite handles may be open mid-suite.
- Separately, "retained until process exit" is not true. Nothing registers an exit-time cleanup, and nothing in the packet reads `.memory-test-owner.json`.
- On Windows, every EBUSY or EPERM therefore leaks a temp home containing a SQLite DB permanently.
- If `test:isolation` spawns one process per file, that is one potential leak per file per run. This matters given `docs/audits/2026-09-19-disk-ownership.md`.
- Condition: move removal to `process.once("exit")`, which is correct under either hook behaviour and keeps the EBUSY tolerance.
- Also add a startup sweep of `memory-test-home-*` directories whose marker says `project: memory-nexus` and whose pid is dead.
- Probe: a two-file run where the second file asserts that `HOME` exists and still holds the marker.

**C2. `tests/test-setup.ts`: `MEMORY_HOME` is set for the whole suite, and the env override list is hand-picked.**
- `CLAUDE.md` says `MEMORY_HOME` is an explicit legacy opt-in. If the resolver treats its presence as that opt-in, the whole suite now runs on the legacy layout.
- In that case the production XDG path goes untested and `XDG_DATA_HOME` has no effect.
- The five overrides were not derived from the resolver. `APPDATA`, `LOCALAPPDATA`, `CLAUDE_CONFIG_DIR`, and any other variable the resolvers or `memory install` honour are still inherited from the real profile.
- Condition: state the resolver's precedence and derive the list of neutralized variables from the resolver code.
- If presence of `MEMORY_HOME` is what opts in, delete it instead of setting it.
- Confirm that every lane loads this setup: `bun test`, `test:isolation`, `test:coverage` under vitest, and `eval:v5*`. The setup file imports `bun:test`, so I cannot tell whether the vitest lane gets it.

**C3. `tests/test-store-isolation.test.ts`: the proof only checks absence at two hardcoded paths.**
- It passes vacuously if the store lands anywhere else, for example under `APPDATA`, `~/.memory`, or `~/.claude`.
- It never shows that the check would fail without the preload.
- It does not cover the destructive hazard: the friction ingest reads `~/.claude/friction.jsonl` and then deletes it.
- Condition: seed `inheritedHome/.claude/friction.jsonl` with a sentinel and assert it is byte-identical afterwards.
- Also assert `readdirSync(inheritedHome)` contains only what you seeded.
- Also assert the resolved DB path sits under a `memory-test-home-` prefix.
- Add a control run with the preload disabled that does write into `inheritedHome`.
- Give the test an explicit timeout longer than the child's 30 s. `spawnSync` blocks the event loop, so a slow cold start currently fails the parent after the child has succeeded.

**C4. `XDG_*` is now process-global, so tests that isolate through `HOME` alone no longer isolate.**
- The `sync-hook-script.test.ts` fix shows the pattern. Any other `{...process.env, HOME: x}` spawn, or an in-process `process.env.HOME = tmp`, now resolves to the shared `testHome/data`.
- The result is one `memory.db` shared across files in a shared process, which produces order-dependent results.
- Assertions under `homeDir/.local/share/...` would then either fail or pass vacuously.
- Condition: enumerate every `HOME` or `USERPROFILE` override in the tests and fix or justify each one.

**C5. `package.json`: a behaviour-bearing dependency bump and forced out-of-range overrides, with no lockfile to review.**
- `@huggingface/transformers` 4.2.0 → 4.3.0 can change the bundled ONNX runtime, the default dtype, or pooling and tokenizer behaviour.
  - If `currentHash` covers only model name and config, `modelChanged` stays false and new vectors mix silently with old ones. That is the same class of corruption the `embedding-pass.ts` fix closes.
  - Condition: add a golden-vector test using a fixed sentence and a committed 4.2.0 vector, with a cosine floor.
  - Pin `dtype` explicitly. On drift, fold the library version and dtype into the hash or force a re-embed.
- `brace-expansion: 5.0.12` and `adm-zip: 0.6.1` are forced on every dependent regardless of its declared range.
  - Older minimatch majors expect brace-expansion 1.x or 2.x. As far as I recall, 4.x changed the export shape; I have not checked 5.x.
  - If the shape differs, the failure only appears when a glob contains `{}`. Coverage include patterns are an example.
  - I believe `adm-zip` is used by the `onnxruntime-node` install script, which would make breakage Linux-install-only and invisible on this machine.
  - Condition: list the dependents and their ranges.
  - Then run a clean-cache `bun install --frozen-lockfile` on Linux.
  - Finish with a real local-embedding smoke.
- As I understand npm and bun, overrides apply only to the root project. `bun audit` going green here says nothing about the tree an `npm i -g @chude/memory` user resolves, so record that as a non-claim.
- `bun.lock` is modified but not in the packet, so the resolved tree is unreviewed.

## Non-gating findings

**`src/presentation/cli/commands/sync/embedding-pass.ts`**
- Initializing before `recreateVecTable` is correct. Counting the full corpus on a model change is correct, and both new tests would fail against the old code.
- The dimension check trusts `config.embedding.dimensions`. With initialization now first, probe the provider's real output dimension before the destructive step.
- `recreateVecTable` still runs before the `totalToEmbed === 0` early return. "Clearing existing embeddings..." also prints before anything is cleared.
- A throw from `factory.dispose()` in the outer `finally` hides the primary error. Confirm the real `dispose` is safe on a provider that was never initialized. The test mocks it.
- The test never asserts that the stored model identity afterwards is the replacement.
- The old index is still destroyed before the new one exists. This predates the change and is not addressed here.

**`scripts/check-coverage-thresholds.ts`**
- The validation is sound. The 0.011 tolerance fits Istanbul's floor-to-two-decimals rounding.
- The counts are validated as safe integers, but the pass/fail decision is still a float comparison. `covered * 100 >= threshold * total` is exact for an integer threshold.
- Missing test cases: one invalid metric among three valid ones, NaN, Infinity, and fractional counts.
- The existing `total <= 0` check marks a metric as unavailable. That is fine for the aggregate, but it will fail every branch-free file once per-file enforcement lands.
- The appended tests call `test` outside the `describe` block. Confirm `test` is imported.

**`src/infrastructure/sources/project-name-resolver.ts`**
- The `<=` change is logical. The old tests returned early on the deleted iCloud path and asserted nothing, so replacing them is right.
- Test 1 reaches the probe only if a junction's Dirent is reported as a non-directory under Bun on Windows and under POSIX.
- Show it failing against `i < parts.length` on both platforms, or it may pass through the enumeration path instead.
- Keep junction targets inside `testDir` so a recursive delete cannot follow a link out of it.

**`src/presentation/cli/commands/status.test.ts`**
- The `NO_COLOR` save and restore is correct.

**Scope**
- The PR mixes five concerns, including behaviour and gate code. That makes it Tier D.
- I would split the dependency changes into their own PR. A transformers revert would then not take the data-integrity fix with it.
