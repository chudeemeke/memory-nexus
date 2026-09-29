# Stack Research

**Domain:** Local-first memory infrastructure — adding a server surface (MCP + HTTP + SSE) and a public benchmark harness to a shipped Bun/TypeScript CLI (`@chude/memory` v4.0.3, targeting v6.0)
**Researched:** 2026-07-21
**Confidence:** HIGH (versions verified against the live npm registry; Bun/hexagonal integration read from the actual repo)

> Note: the prior foundational v1.0 stack research previously at this path is preserved at `.planning/research/STACK-v1-baseline.md`. This file is scoped to the NEW v6.0 additions only.

## Scope Guardrail

This file covers **only the NEW stack additions** the v6.0 server + benchmark features require. The validated existing stack (Bun 1.3.5, TypeScript 5.5+, `bun:sqlite` + FTS5 + `sqlite-vec@0.1.9`, `commander@14.0.3`, `@huggingface/transformers@4.2.0`, `@anthropic-ai/sdk@0.98.1`, `chrono-node@2.9.1`, `cli-progress`) is NOT re-researched and NOT proposed for replacement. The headline finding: **the only mandatory new production dependencies are `@modelcontextprotocol/sdk` and its required `zod` peer.** Everything else (HTTP daemon, SSE, benchmark metrics, dataset fetch) should be built on Bun-native primitives with zero added dependencies.

## Recommended Stack

### Core Technologies (new)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@modelcontextprotocol/sdk` | `1.29.0` (npm `latest`, verified 2026-07-21) | MCP server over stdio: `McpServer` + `StdioServerTransport`, tool/resource registration, JSON-RPC 2.0 framing, protocol version negotiation | The official, spec-authoritative TypeScript SDK. There is no credible alternative — hand-rolling JSON-RPC + the MCP handshake would reinvent a moving spec and fail conformance against Claude Desktop / Claude Code clients. `engines: node>=18`; pure JS/TS, runs on Bun 1.3.5. |
| `zod` | `^4.0` (latest `4.4.3`) | Runtime schema validation for MCP tool input shapes; required peer of the SDK | Required peer of `@modelcontextprotocol/sdk` (`peerDependencies.zod: "^3.25 \|\| ^4.0"`). The SDK derives JSON Schema for tool params from zod schemas. New dep anyway, so adopt zod 4 (current major) rather than legacy zod 3. |
| `Bun.serve` (Bun-native, NOT a package) | Bun 1.3.5 | Local HTTP daemon bound to `127.0.0.1`; also serves SSE responses | Built into the runtime already required. Binds a specific hostname (`hostname: "127.0.0.1"`) natively, returns `Response` objects, and streams `ReadableStream` bodies. Adding express/fastify/hono would duplicate what the runtime provides and enlarge the `bun audit` surface for zero benefit. |
| Native `ReadableStream` + `Response` (Web/Bun-native, NOT a package) | Bun 1.3.5 | SSE / live context subscription surface | SSE is just `Content-Type: text/event-stream` over a chunked `ReadableStream`. `Bun.serve` returns exactly that with no library. A server-side SSE package (`sse`, `better-sse`, `eventsource`) adds a dependency to emit `data: ...\n\n` strings — not worth it. |

### Supporting Libraries (benchmark harness — all NEW work uses ZERO new deps)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@anthropic-ai/sdk` | `0.98.1` (already a dependency) | LLM-as-judge for LOCOMO/LongMemEval scoring (binary CORRECT/WRONG per answer) | Reuse the existing dep. The judge model must be provider-configurable through the existing provider registry — see the reproducibility note below. Do NOT add an OpenAI SDK just to match Mem0's published judge. |
| `Bun.fetch` (native) | Bun 1.3.5 | Scripted download of dataset files (LOCOMO `locomo10.json`, LongMemEval JSON/JSONL) into a gitignored cache | Native `fetch` + `Bun.write` handles public HTTPS file downloads (GitHub raw, HuggingFace `resolve/main` URLs). No `axios`/`node-fetch`/`@huggingface/hub` needed. |
| Inline F1 / BLEU-1 (write ~50 LOC in the harness) | n/a | Token-level lexical metrics reported alongside the LLM-judge score, matching Mem0/Zep reporting | Token-F1 and unigram BLEU (precision + brevity penalty) are small, deterministic functions. Implementing inline avoids pulling an NLP library and keeps the numbers auditable. See "What NOT to Use". |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Existing `scripts/eval-v5/` harness (`harness.ts`, `evaluators.ts`, `fixtures.ts`, `types.ts`, `cli.ts`) | The benchmark work EXTENDS this, it does not fork it | Add a sibling report path (e.g. a `PublicBenchmarkReport` next to `V5EvalReport`) or a parallel `scripts/eval-bench/` that reuses the same `runEvalCli` shape, JSON-first output, and blocking/threshold model. Keep the `{ exitCode, report }` contract. |
| `bun test` + `bun:sqlite` (existing) | Concurrency/WAL stress tests for the long-lived-process model | The highest technical risk in v6.0 is a long-lived server holding SQLite/WAL connections across concurrent MCP + HTTP clients. This is a testing/architecture concern, not a new dependency — no connection-pool library is needed for a single-file local SQLite; use one writer + WAL readers. |
| `.gitignore` entry for the dataset cache | Keep large, licensed datasets out of git history | e.g. `.cache/benchmarks/` or `docs/evals/datasets/` (gitignored). Datasets are fetched at run time, never committed. |

## Installation

```bash
# New production dependencies (the ONLY two required)
bun add @modelcontextprotocol/sdk@1.29.0 zod@^4.0

# Nothing else. HTTP daemon, SSE, dataset fetch, and benchmark metrics
# use Bun-native primitives and the existing @anthropic-ai/sdk.
```

## Integration Points (how this lands in the existing hexagonal app)

- **New presentation adapters, not new logic.** Per the PROJECT.md invariant, the MCP server and HTTP daemon are new adapters under `src/presentation/` (e.g. `src/presentation/mcp/`, `src/presentation/http/`) that delegate to the existing `src/application/services/*` use-cases (`SmartContextService`, search, `MemoryGovernanceService`, `FrictionService`, etc.). No business logic and no second governance path in the adapter.
- **stdout is reserved.** The MCP stdio transport frames JSON-RPC on `stdout`; the CLI already writes human/JSON output to `stdout`. The MCP server MUST be a distinct entry (e.g. a `memory mcp` subcommand or a separate bin) where ALL logging/diagnostics go to `stderr`. This composes with the repo's AI-first stdout constraint.
- **Governance reuse is verified, not re-implemented.** The v5 eval dimensions `privacy_redaction` and `cross_project_leakage` are already blocking. Extend the eval harness so the same governance/redaction fixtures run through the MCP and HTTP code paths (adapter-level tests), proving redaction happens before egress on every surface.
- **Benchmark harness calls the application layer directly.** The LOCOMO/LongMemEval runner ingests a conversation, drives memory writes/reads through use-cases, and scores answers — it does NOT need the HTTP/MCP server running. MCP/HTTP and the benchmark are independent workstreams.
- **`command-result.ts` contract holds.** Adapters return exit codes / structured results rather than calling `process.exit()`, matching the existing `CommandResult` and eval `{ exitCode, report }` conventions.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `Bun.serve` for HTTP + SSE | `hono@4.x` | Only if the daemon grows complex middleware/routing needs (auth chains, many route groups). For a localhost-only daemon delegating to a handful of use-cases, Bun.serve routing suffices. Note: `hono` is already a *transitive* dep of the MCP SDK, so if you ever need it you can use it without a new top-level install — but do not reach for it preemptively. |
| MCP over **stdio** (`StdioServerTransport`) | MCP over **Streamable HTTP** (`StreamableHTTPServerTransport`) | Stdio is canonical for local single-client agents (Claude Desktop/Code launch the process). Use Streamable HTTP only if multiple remote MCP clients must share one server. If you do, the SDK's `StreamableHTTPServerTransport` can be mounted into `Bun.serve` via its fetch/Node-req interface — **spike this first**, it is the least Bun-proven path in the SDK. |
| zod 4 | zod 3 (`^3.25`) | Only if a transitive consumer forces zod 3. The SDK supports both; default to 4. |
| Inline F1/BLEU-1 | `sacrebleu` (Python) / `natural` (JS) | If a reviewer demands canonical, citable BLEU parity. `sacrebleu` is the academic reference but is Python (out-of-runtime). `natural` is heavy. For LOCOMO-style reporting the LLM-judge score is the headline metric; lexical metrics are secondary, so inline is adequate and auditable. |
| Official `@modelcontextprotocol/sdk` | `fastmcp` / `mcp-framework` (community wrappers) | Never for this project. Wrappers lag the spec and add a dependency on top of the SDK. Use the official SDK directly. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `express`, `fastify`, `hono`, `koa` (as a NEW top-level dep) | Duplicates `Bun.serve`; enlarges install + audit surface. (`express`/`hono` already arrive transitively via the MCP SDK — unavoidable, but don't add them yourself.) | `Bun.serve` with `hostname: "127.0.0.1"` |
| `sse`, `better-sse`, `eventsource` (server-side), `socket.io`, `ws` | SSE is a content-type + `ReadableStream`; websockets aren't needed for one-way live-context push and MCP stdio doesn't use them | Native `Response` + `ReadableStream` with `text/event-stream` |
| `axios`, `node-fetch`, `got` | Bun has native `fetch` | `fetch` + `Bun.write` |
| `@huggingface/hub`, `datasets` | Public dataset files are downloadable via plain HTTPS (`resolve/main/...`); a full HF client is overkill | Scripted `fetch` into a gitignored cache |
| `adm-zip`, `unzipper`, `tar` | LOCOMO ships as a single JSON file; fetch LongMemEval's raw JSON/JSONL files individually to avoid archive handling. Bun has no built-in general ZIP extractor | Fetch individual raw files; if an archive is truly unavoidable, shell out to system `unzip` via `Bun.$` rather than adding a dep |
| `sacrebleu` / `natural` / `compromise` NLP libs | Heavy; wrong runtime (Python) or maintenance risk for one metric | ~50 LOC inline F1 + BLEU-1 |
| `fastmcp` / `mcp-framework` / other MCP wrappers | Lag the spec; add a layer over the SDK | `@modelcontextprotocol/sdk` directly |
| `dotenv` | Local-first; project follows varlock/env conventions and needs no runtime env loader for a localhost daemon | Existing config / `process.env` handling |
| A SQLite connection-pool library | A single local SQLite file uses one writer + WAL readers; pooling libs solve a networked-DB problem this project doesn't have | `bun:sqlite` + WAL, one write path, serialized writes |

## Dataset & Benchmark Reproducibility (licensing is load-bearing)

| Benchmark | Source | License | Format | Metrics | Recommendation |
|-----------|--------|---------|--------|---------|----------------|
| **LOCOMO** (LoCoMo) | `github.com/snap-research/locomo` → `data/locomo10.json` | **CC BY-NC 4.0 — NON-COMMERCIAL** (verified from `LICENSE.txt`) | Single JSON: 10 conversations (~300 turns / ~9K tokens each), `qa` pairs across 4 categories (single-hop, multi-hop, temporal, open-domain), ~1,540 questions | LLM-as-judge (binary correct/wrong, run ×3, mean); plus token-F1 and BLEU-1 | Fetch at runtime into a **gitignored** cache; NEVER vendor into the MIT repo. Flag the license tension explicitly (below). |
| **LongMemEval** | `github.com/xiaowu0162/LongMemEval` + HuggingFace | **MIT** | JSON/JSONL, 500 questions, 5 abilities (info extraction, multi-session reasoning, temporal reasoning, knowledge updates, abstention); scales to >1M tokens | Accuracy / LLM-judge per ability | **Preferred second benchmark** — MIT license is commercially safe and aligns with the market-ready constraint. |
| (optional 3rd) DMR / other | Various | Verify per source before adding | — | — | Only add if a reviewer wants breadth; LOCOMO + LongMemEval is sufficient for "parity with Mem0/Zep-cited numbers." |

**License tension — surface to the roadmapper (do NOT bury):** `@chude/memory` is MIT and explicitly "potentially taken to market." LOCOMO's dataset is CC BY-NC 4.0 (non-commercial). Mitigation that keeps the product clean:
- The benchmark **harness/code** is first-party MIT. The **LOCOMO dataset** is fetched at run time, lives only in a gitignored cache, used for research/evaluation reporting — never redistributed in the package (`files: ["dist"]` already excludes it) and never bundled into a commercial artifact.
- Published LOCOMO result *numbers* (aggregate scores) are facts about performance, not redistribution of the dataset — safe to publish with attribution.
- **LongMemEval (MIT) should be the benchmark leaned on for any commercially-framed claim.** Treat LOCOMO as the comparability datapoint against Mem0/Zep, with the NC constraint documented.

**Comparability caveat (reproducibility honesty):** Mem0/Zep publish LOCOMO numbers using an OpenAI judge (GPT-4o-mini / GPT-5-mini) run ×3. Exact numeric parity requires matching their judge model → OpenAI egress, which conflicts with local-first + no-new-mandatory-egress. Recommendation: make the judge **provider-configurable** (default to the existing `@anthropic-ai/sdk`), and every published report must record which judge model produced the score. Note that cross-tool comparisons are judge-model-sensitive (the public Zep-vs-Mem0 dispute over the same LOCOMO claim shows this is a real, contested measurement, not a settled number). This protects the project's "docs don't overstate" North Star line.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@modelcontextprotocol/sdk@1.29.0` | `zod@^3.25 \|\| ^4.0` | Peer dep. Use zod 4.x. |
| `@modelcontextprotocol/sdk@1.29.0` | Bun 1.3.5 | stdio transport (`process.stdin`/`stdout`) expected to work on Bun; **spike/verify** the stdio handshake against a real client early — Bun process-stream edge cases exist. `engines: node>=18` satisfied by Bun's Node compat. |
| `@modelcontextprotocol/sdk@1.29.0` | its transitive deps (`express@^5`, `hono@^4.11`, `jose@^6`, `ajv@^8`, `eventsource@^3`, `cross-spawn@^7`) | Installing the SDK pulls a **heavy transitive tree** even when only stdio is used. Unavoidable with the official SDK. Expect `bun audit` to see more surface; the repo already uses `overrides` extensively — pin transitive deps there if audit flags them. This footprint is the main cost of choosing the SDK; still the correct choice over hand-rolling the protocol. |
| `Bun.serve` SSE | native `fetch`/`ReadableStream` | Server and any TS test client are fully native; if a client must parse SSE, `eventsource-parser@^3` already exists transitively via the SDK — reuse it rather than adding a new dep. |

## Sources

- npm registry (verified 2026-07-21): `@modelcontextprotocol/sdk` = `1.29.0` (`engines.node >=18`; peer `zod ^3.25 || ^4.0`, `@cfworker/json-schema ^4.1.1`); `zod` latest = `4.4.3`; local `bun --version` = `1.3.5` — HIGH confidence
- `github.com/snap-research/locomo` (repo + `LICENSE.txt`) — dataset schema (`locomo10.json`), 10 conversations / ~1,540 QA, **CC BY-NC 4.0** — HIGH confidence
- `github.com/xiaowu0162/LongMemEval` + LICENSE — **MIT**, 500 questions, 5 abilities, ICLR 2025 — HIGH confidence
- Mem0 paper (arxiv 2504.19413) + Zep blog "Is Mem0 Really SOTA" + `getzep/zep-papers` issue #5 — LOCOMO LLM-as-judge methodology (binary, ×3 mean, F1/BLEU-1 secondary) and judge-model-sensitivity dispute — MEDIUM-HIGH confidence (vendor sources, cross-checked against the methodology dispute)
- Repo read (`package.json`, `scripts/eval-v5/*`, `src/application/`, `src/presentation/cli/`, `.planning/PROJECT.md`) — existing stack, hexagonal integration points, eval harness contract — HIGH confidence
- Context7: attempted, tool unavailable this session; all version claims verified directly against npm instead

---
*Stack research for: local-first memory server surface + public benchmark parity (v6.0)*
*Researched: 2026-07-21*
