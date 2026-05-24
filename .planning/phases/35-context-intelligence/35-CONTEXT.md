# Phase 35 Context: Memory as a Tool for Agents vs. Agent Runtime

This document outlines the critical conceptual shift when designing a memory system meant as a **Tool used by external AI agents** (like Claude Code) rather than an **Agent's own internal runtime memory** (like in OpenClaw or Hermes Agent).

---

## 1. The Core Conceptual Shift

In Hermes Agent and OpenClaw, memory is an **internal, self-managed capability**. The agent decides when to read/write its own files, can pause to reflect, and updates its prompt layout dynamically.

In `memory-nexus`, the database is an **external tool** accessed via a CLI. The agent using it (e.g. Claude Code) is running in its own loop, has a limited context window, and treats the memory CLI as a fast, high-density knowledge oracle.

This leads to several critical design constraints:

| Dimension | Hermes/OpenClaw (Agent-Internal Memory) | memory-nexus (Tool-for-Agents) |
|---|---|---|
| **Control Loop** | Internal: Agent reflective cycles run continuously. | External: CLI commands are run on-demand or via brief pre/post-session hooks. |
| **Token Budgeting** | Coarse: Agent pastes its whole memory history or relies on complex vector retrieval. | Strict: Precision-budgeted context to save LLM tokens and prevent context pollution. |
| **Formatting** | Flexible: Agent reads arbitrary Markdown diaries. | Predictable: Standard, structured, semantic briefings that any future LLM can parse instantly. |
| **Programmatic Use** | Manual: Agent writes code to read/write text files. | Automated: Standardized `--json` envelopes for reliable tool-use integration. |
| **Recovery / Recovery Cost** | Hard: Custom HRR representations or locked services. | Zero-Cost: Plain-text `events.jsonl` SSOT guarantees readability without database tooling. |

---

## 2. Key Architectural Decisions for Phase 35

### A. Context Window Protection (Precision Budgeting)
* External agents are cost-sensitive and context-constrained. `SmartContextService` must prioritize facts dynamically (Decisions > Learnings > Preferences > Friction) and truncate content using `allocateBudget()` to ensure the briefing strictly fits under the specified `--budget` (defaulting to a safe `1500` tokens).

### B. High-Density Unified Facts (No Content Dumps)
* Instead of dumping raw transcripts or unparsed files, `memory context` delivers derived, deduplicated facts.
* It queries the active facts projection directly. This eliminates legacy markdown parsing and disk reads.

### C. Standard Markdown Divider Architecture
* To make the context briefing highly readable for other developer agents, the output is formatted as a structured Markdown document with standard thematic dividers (`---`) and clear headers (`## Section Name`):
  ```markdown
  ## Active Decisions
  - [decision-uuid-1]: We decided to use Bun instead of Node.js for backend runtime.
  
  ---
  
  ## Recent Learnings
  - [learning-uuid-2]: Bun's WebSocket support requires `Bun.serve` on Windows.
  ```

### D. Zero-Friction Fallback
* If a project is brand new and has no extracted facts yet, the service must not crash or return a blank output. It gracefully falls back to querying recent session timestamps to return a clean "Recent Session History" list, showing the agent what files were previously modified.

---

## 3. Deprecation of ~/.memory/
The legacy `~/.memory/` text-file directory is fully deprecated. All knowledge is stored inside the SQLite database (`memory.db`), backed up in the plain-text `events.jsonl` SSOT. 
* We check for `~/.memory/` during database startup or CLI context initialization.
* If present, we output a clean, non-obtrusive warning advising the agent:
  `[DEPRECATION WARNING] Legacy memory directory ~/.memory/ is deprecated. Your context is safely persisted in the database.`
* We provide a migration check-in to ingest legacy `.md` files directly into our `events.jsonl` event log and SQLite projections.
