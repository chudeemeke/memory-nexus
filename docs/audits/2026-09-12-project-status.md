# Memory Nexus project status — 2026-09-12

## Lead assessment

Memory Nexus has a published, substantial local-first CLI/API product, but is not currently release-ready against the owner's quality contract. The next milestone is planned, not implemented. Preserve and finish the recovered work; do not restart from a clean checkout or treat another agent's work as disposable.

The Product North Star in `.planning/PROJECT.md` remains the governing goal: private, auditable, cross-project memory with provenance, governance, recovery, and controlled derived knowledge. The portfolio end state additionally requires durable cross-agent continuity and a verified desktop Linux authority transition.

My recommendation is to restore trust in the existing baseline before starting Phase 45. Public benchmarks are useful evidence, but “category leader” is a claim to earn, not an engineering acceptance criterion by itself. Deferring the broad backward audit (AUDIT-01) must not defer known security, correctness, data-integrity, or quality-enforcement failures. No product decision or milestone scope was silently changed by this assessment.

## Source and release state

- Inspected checkout: `C:/Projects/memory-nexus`, `main`, HEAD `96742c74e190837bf8c00ab2bcbc35053b676837`.
- Live GitHub `main`: `5ecc8743bf5162531e3d8c899e02d98b706915de`; the checkout is two commits ahead. Both are July 21 documentation commits: `55bbe66` (v6 research) and `96742c7` (v6 requirements).
- Original uncommitted work: `.planning/REQUIREMENTS.md` (+29/-4), `.planning/ROADMAP.md` (+184/-1), `.planning/STATE.md` (+9/-7), and the three incoming inbox reports. This is substantive planning and coordination work. No original local executable source changes were present.
- The uncommitted roadmap defines nine phases, 45–53, maps all 21 enumerated v6 requirements, and corrects the old “20 requirements” count. Phase 45 has no execution plan or implementation yet.
- Live npm metadata and the installed Windows `memory --version` both report `4.0.3`. Milestone v5/v6 labels are not npm package versions.
- Phase 44 records the July 6 publication and registry-backed npm/Bun verification. It also records the direct npm hotfix publish exception to `aidev release`, and release-source/tag provenance. That history is preserved, not retroactively presented as the standard release workflow.
- GitHub returned no open PRs, no open issues, and no recent Actions runs. There is no `.github` directory in this checkout. Thus there is no current hosted CI/review proof backing the local readiness claims.
- Two stale Claude worktree registrations point to missing working directories. Their branch tips are already contained in HEAD (`git branch --all --no-merged HEAD` returned no branches). They were not pruned.

## Desktop work reconciliation

Read-only inspection through `remotely run` of `~/Projects/memory-nexus` confirmed HEAD `0db6e084626f6c624446b154ddc929459256e613`, dated May 8, and 63 porcelain status entries. This expands to 54 tracked files and 11 individual untracked files because one entry is a directory.

Git ancestry proves the desktop HEAD is contained in this checkout: **0 desktop-only / 166 local-only commits**. Desktop's “ahead 108” is relative to its stale local `origin/main`, not live GitHub. The inbox's earlier assertion that the clones both contain unique work is superseded by this evidence.

All 54 tracked changes are exactly equal to their desktop HEAD blobs after CRLF-to-LF normalization. None contains a substantive text change. All 11 untracked files also match recoverable content:

| Untracked path | Recovery evidence after newline normalization |
| --- | --- |
| `.planning/phases/18-api-stabilization/18-01-SUMMARY.md` | Git blob at `44caab6be0b20f2eff96d4d5cb43af57bba3a6dc` |
| `.planning/phases/18-api-stabilization/18-02-SUMMARY.md` | Git blob at `6c0f99fcfa36f9148cb3c0b11ab7ae275e6acfd7` |
| `.planning/phases/18-api-stabilization/18-UAT.md` | Git blob at `c4913048848df4e2a4c841af426eac29eccb8913` |
| `.planning/reviews/2026-05-08-paths-ts-test-isolation-codex-review.md` | Matches current tracked file |
| `.planning/reviews/2026-05-08-paths-ts-test-isolation-plan.md` | Matches current tracked file |
| `src/presentation/cli/commands/friction.test.ts` | Git blob at `72f56c1d6b63f7c8852c0be7f9f3cdca30217043` |
| `src/presentation/cli/commands/friction.ts` | Git blob at `72f56c1d6b63f7c8852c0be7f9f3cdca30217043` |
| `src/presentation/cli/commands/sync-lazy-loaders.test.ts` | Git blob at `db682045c49b932ebf623372989ce034629b6565` |
| `src/presentation/cli/commands/sync.integration.test.ts` | Git blob at `defa38175b78578b0cf80a9bc0a65131e7957a6d` |
| `src/presentation/cli/commands/sync.test.ts` | Git blob at `99500ef48fb7d04737c9f95817c6fddd79f1e14e` |
| `src/presentation/cli/commands/sync.ts` | Git blob at `99500ef48fb7d04737c9f95817c6fddd79f1e14e` |

The complete per-path classification and normalized hashes are retained in `2026-09-12-project-status-evidence/desktop-inventory.json`. No desktop files were changed. This is source classification, not completed migration: ignored files, runtime databases, embedding indexes, active sessions, installed tools, backup/restore, authority selection, and cutover still require their own operational proof.

## Fresh verification

| Check | Current result |
| --- | --- |
| `bun run typecheck` | PASS, exit 0 |
| `bun run build` | PASS, exit 0 |
| `bun run test:isolation` | PASS, exit 0; syntactic isolation check, not proof against production-store writes |
| `bun run eval:v5:market` | PASS, exit 0; 9/9 behavior fixtures, no contract fixtures |
| `bun test --timeout 15000` | FAIL, exit 1; 4,453 pass / 2 fail across 208 files, 10,976 assertions, 393.85 seconds |
| `bun audit` | FAIL, exit 1; 26 advisories: 17 high, 9 moderate |
| `gitleaks detect --no-banner --redact --source .` | PASS, exit 0; 727 commits scanned, no leaks found |
| Native Bun coverage from full test run | 95.60% functions / 97.90% lines; statements and branches unavailable from this report; no all-four/per-file compliance claim |
| Fresh Istanbul all-four coverage / mutation | Not run; no current compliance claim |
| Registry / installed version | Both `4.0.3` |

The dependency audit includes both runtime and development dependency paths. Runtime examples include `sharp` and `protobufjs` through `@huggingface/transformers`. Advisory presence is confirmed; exploitability in each Memory Nexus invocation has not been established. Retain that distinction while treating the failing audit as a release blocker.

Historical Phase 43 numbers were 4,455 passing tests and aggregate coverage 97.31% statements / 95.00% branches / 96.51% functions / 97.39% lines. Those are dated records, not current measurements.

## Findings and ownership

Every finding below is owned by **memory-nexus**. Priority denotes sequencing for this project, not an assertion that every dependency advisory is exploitable.

| Priority | Finding | Next action and retirement trigger |
| --- | --- | --- |
| P1 | Current full-suite invocation fails project-name resolution: expected `memory-nexus`, received `nexus`, at `src/infrastructure/sources/project-name-resolver.test.ts:163`. The fixture consults the real iCloud directory and only checks the parent exists. | Diagnose resolver behavior versus stale fixture assumptions; replace environment dependence with meaningful controlled tests as appropriate. Close only after focused and full-suite proof on the resulting revision, before release. |
| P1 | The second full-suite failure is `status.test.ts:1320`: ANSI-colored `[OK]` expected, plain `[OK]` received. This environment defines `NO_COLOR`; the test sets `FORCE_COLOR` without clearing it, while `formatters/color.ts` explicitly gives `NO_COLOR` precedence. This points to test-environment isolation rather than an established user-facing formatter defect. | Make color/no-color tests deterministic while preserving the documented precedence. Close after focused and full-suite proof, before release. |
| P1 | `bun audit` fails with 26 advisories. Several explicit overrides still pin affected versions. | Review dependency paths, update without weakening gates, and rerun compatibility/security checks before release. Do not blindly apply major upgrades. |
| P1 | `scripts/check-coverage-thresholds.ts` parses only `parsed.total`; it does not enforce per-file tiers, Tier S 100% branches, changed-line coverage, or attributable exception review. No hosted CI workflow exists here. | Implement and test fail-closed per-file/package inventory and risk-tier gates, then wire mandatory CI/review. A green aggregate must not close current quality compliance. |
| P1 | All 27 historical synthetic friction IDs remain open with the expected fixture descriptions/tool/category. The inspected local store now contains 194 rows: 161 open, 24 resolved, 9 wont-fix. | Finish provenance, exact-ID dry-run, recoverable backup/quarantine, and runtime test-store guard before using this dashboard for trusted prioritisation. `deleteByPattern` alone is insufficient. No database mutation occurred in this inspection. |
| P2 | Claimed strict hexagonal purity is overstated: `extraction-pipeline.ts:25` imports the infrastructure event log, and application services expose SQLite types and filesystem operations. | Own concrete port/adapter repairs with regression evidence before extracting the shared server facade; do not simply relabel the current layout compliant. |
| P2 | Extraction pipeline has a default no-op redactor; the v6 research already identifies governance bypass as the highest-risk new-server failure. Current status inspection does not prove a reachable production leak. | Validate all composition paths and require privacy-safe dependencies at the shared facade; poisoned-corpus and scope-isolation tests must precede new adapters. |
| P2 | Entry docs overstate present readiness; STATE contains an old “zero active inbox” statement; REQUIREMENTS still reports v5 39/53 complete and 14 pending although its traceability rows mark completion. PROJECT also retains older no-network/no-streaming scope text alongside newer consent/remote/server plans. | Reconcile current claims and historical sections before Phase 45 planning; preserve decisions rather than erasing contradictions. A current-status pointer was added now. |
| P2 | Phase 43 independent review was a narrow Sonnet safe-mode summary after full-packet timeouts. It is not an Opus/Fable full-source review. | Preserve the real scope; require live Fable readiness before the next mandatory Fable review, and retain substantive output against the final revision. No new external review was invoked here. |
| P2 | Source recovery is proven but Linux authority transition and runtime data preservation remain open. | Use the recorded classification as input to the project's Phase 20 cutover gates; recheck live state and preserve runtime data before cleanup/cutover. |
| P2 | The cross-agent north star exceeds the current Claude-oriented session source. `FileSystemSessionSource` defaults to `.claude/projects`; this inspection found no Codex/Gemini source adapter in the source/parser directories. | Specify and verify how non-Claude agents contribute and retrieve durable context. An MCP read surface alone does not prove cross-harness ingestion or end-to-end continuity. |

## Product, documentation, and operations

Implemented surfaces include local session sync/search/context, facts, friction, provider-backed embeddings/extraction, canonical events and projection replay, governance, persona, graph/ranking, controlled dreaming, explicit remote sync, secret auditing, and backup/restore/migration commands. The internal nine-fixture eval pass exercises useful behavior but does not measure public benchmark parity or whole-product reliability.

The README documents installation, hooks, usage, and recovery commands; release notes, ADRs, a threat model, and a remote-sync runbook exist. Fresh installation on an isolated machine, live hook delivery, provider egress/recovery, large-database behavior, and backup restoration were not requalified in this status assessment. There is no new HTTP/MCP server to security-certify yet.

No implementation of `MemoryQueryFacade`, `ServerDatabaseProvider`, MCP integration, `memory serve`, or public LongMemEval/LOCOMO harness was found in `src`/`scripts`. The v6 roadmap owns these through Phase 53. Native server writes remain explicitly deferred under SRVW-01.

## Restart order

1. Preserve the recovered July research/requirements/roadmap work in the normal reviewed Git workflow, and reconcile current status claims. Do not change the product goal to make the checklist easier.
2. Repair baseline correctness and dependency failures; implement the missing risk-tier/CI enforcement and close the historical friction pollution with recovery proof.
3. Finish desktop runtime-data and operational qualification separately from source classification; cutover remains a project-scoped operation with its established session/authority gates.
4. Plan Phase 45 from the recovered roadmap. Prove long-lived SQLite concurrency and privacy-preserving shared query behavior before layering server transports. Demonstrate a real cross-agent consumer workflow early.
5. Use reproducible benchmarks and independent final-revision review to support measured claims. Do not treat internal eval success or roadmap completion as market leadership.

## Assessment boundaries and session edits

This is an evidence-backed project status/recovery assessment, not an exhaustive per-file security, architecture, or mutation audit. Known failures were recorded instead of pivoting into implementation during a status request. Complete review and runtime acceptance remain future work with the owners/triggers above.

This session triaged all three active inbox reports, added this assessment and retained evidence, and added current-status pointers to STATE and CLAUDE guidance. It preserved prior planning edits. It did not commit, push, merge, publish, delete desktop files, or clean the production memory store.

The full test run temporarily touched a help snapshot, but final Git status/diff shows no snapshot or executable-source changes. The read-only friction query was repeated after testing: counts and the 27 listed fixture rows were unchanged. Detailed test, build, typecheck, and redacted gitleaks logs are retained locally as ignored `.log` evidence files alongside the JSON inventory and dependency audit. This does not establish that all production data surfaces were untouched by every test.
