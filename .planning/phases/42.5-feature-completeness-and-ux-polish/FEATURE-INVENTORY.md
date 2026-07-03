# Phase 42.5 Feature Inventory

Created: 2026-07-01
Completed: 2026-07-03
Status: complete

## Inventory Method

Checked:

- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/PROJECT.md`
- `docs/prd/2026-06-05-v5-market-leader-memory-platform.md`
- `docs/reviews/2026-07-01-memory-market-fit-review.html`
- `README.md`
- `src/presentation/cli/index.ts`
- `src/presentation/cli/commands/**`
- `scripts/eval-v5/**`
- Active and archived inbox items relevant to embedding, remote sync, and Tailscale/Ollama egress

## Current Public Command Surface

Query:

- `query`
- `search`
- `context`
- `show`
- `list`
- `related`
- `stats`
- `facts`
- `governance`
- `profile`
- `dream`

Data:

- `sync`
- `backfill`
- `export`
- `import`
- `purge`
- `migrate`
- `extract`
- `remote`

System:

- `install`
- `uninstall`
- `status`
- `doctor`
- `audit-secrets`
- `completion`
- `browse`

Feedback:

- `friction`

## Completion Status

| Surface | Status | Evidence | Phase 42.5 Action |
| --- | --- | --- | --- |
| Local sync/search/list/show/context/stats/related/query | implemented | CLI commands, tests, README | Polish only if UAT finds issues |
| Facts/extraction | implemented | `facts`, `extract`, extraction pipeline | Polish only if UAT finds issues |
| Hybrid/vector embedding | implemented | embedding providers, 4.0.2 resilience fix | No Phase 42.5 action unless UAT fails |
| Friction | implemented | stable list contract, dashboard, tests | No Phase 42.5 action unless UAT fails |
| Governance/consent | implemented | governance command, repository, events | Include in trace and UAT |
| Persona/profile | implemented | `profile`, context integration, tests | Include in trace and UAT |
| Temporal graph | implemented | graph projection/service/context | Include in trace and UAT |
| Ranking/utility | implemented | ranking service/context integration | Include in trace and UAT |
| Dreaming consolidation | implemented | `dream` command, service, repository | Include in trace and UAT |
| Provider egress consent | implemented | config, doctor/status, provider policy | Include in UAT |
| Remote sync | implemented but market gate incomplete | `remote`, explicit `sync --remote`, one contract-only eval remains | Phase 43 owns conflict fixture; Phase 42.5 should improve discoverability only |
| Local backup/restore | partial naming mismatch | `export`/`import`; PRD says `backup create/verify` and `restore` | Add compatibility commands |
| Remote backup/restore/rollback | implemented | `remote backup/restore/rollback` | Keep as remote-specific surface |
| Upgrade readiness | partial naming mismatch | `doctor` exists; PRD says `doctor --upgrade` | Add diagnostic option |
| Migration dry-run/confirm/JSON | partial | `migrate --from-windows` exists but lacks dry-run/json/confirm | Extend migrate |
| Projection rebuild/verify | missing public surface | projection registry exists; no CLI command | Add `projections rebuild --verify` |
| MCP/local server | missing | market review gap | Phase 43 owner or later explicit phase |
| External benchmark claims | missing | market review gap | Phase 43 owner; do not fake parity |
| Interop import/export bridges for other memory tools | missing | market review gap | Phase 43 owner or future explicit phase |

## Active Gaps To Fix In Phase 42.5

1. DONE: Added local backup/restore compatibility commands matching the PRD.
2. DONE: Added projection rebuild/verify command surface.
3. DONE: Added migrate dry-run/JSON/confirm ergonomics.
4. DONE: Added doctor upgrade diagnostic path.
5. DONE: Updated completion/help/README and programmatic exports.
6. DONE: Added UAT and dist smoke coverage for fresh-user command discovery and safe mutation controls.

## Explicitly Owned Later

| Gap | Owner | Rationale |
| --- | --- | --- |
| Remote conflict eval fixture | Phase 43 | It is the remaining market-readiness behavior/contract decision and belongs in final readiness proof. |
| MCP/local server agent-native surface | Phase 43 decision or post-v5 phase | Important for market competitiveness, but not necessary to make existing CLI/API surfaces coherent. |
| Public benchmark parity | Phase 43 | Requires external benchmark design and honest comparison, not internal fixture relabeling. |
| Interop bridges for MemPalace/Mem0/MEMORY.md/DREAMS.md | Phase 43 decision or post-v5 phase | Product positioning decision; should not be bolted into Phase 42.5 without design. |
