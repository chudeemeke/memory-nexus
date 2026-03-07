# qmd Integration Notes

**Date:** 2026-03-06
**Status:** Investigation complete, action items identified

## What is qmd?

[@tobilu/qmd](https://github.com/tobi/qmd) by Tobi Lutke -- hybrid search for markdown files with BM25, vector search, and LLM reranking. Installed globally via `bun add -g @tobilu/qmd` from GitHub commit `#d6f3688`.

## Current State

- Installed at `C:/Users/Destiny/node_modules/@tobilu/qmd/` (bun global)
- **Not a dependency of memory-nexus** -- separate tool, no code references
- memory-nexus has its own hybrid search (FTS5 + sqlite-vec + RRF fusion)
- qmd is complementary: it searches markdown files on disk; memory searches session JSONL in SQLite

## Installation Friction (2026-03-06)

1. `bun add -g` from GitHub ref installs source but does NOT run build (`dist/` missing)
2. Build script uses `cat -` which fails on MINGW/Git Bash
3. Even after manual build, bun didn't create `~/.bun/bin/qmd` symlink
4. ESM dist with bare imports can't run via direct node invocation -- needs package context
5. **Fix applied:** wrapper script at `~/.bun/bin/qmd` that runs node from the package directory

## Relationship to memory-nexus

| Concern | memory-nexus | qmd |
|---------|-------------|-----|
| Data source | Session JSONL -> SQLite | Markdown files on disk |
| Search tech | FTS5 + sqlite-vec + RRF fusion | BM25 + vector + LLM rerank |
| Use case | Cross-session recall, decision search | Document search, knowledge base |
| MCP support | No (CLI only) | Yes (`qmd mcp`) |

### Potential Integration Points

1. **Memory file search:** The PRD knowledge layer writes `.planning/memory/*.md` files. qmd could index these for semantic search, complementing memory's JSONL-based search.
2. **MCP server:** qmd's MCP mode could serve as a document search tool alongside memory's CLI.
3. **Not a dependency:** qmd should NOT be bundled with memory-nexus. They serve different purposes. If integration happens, it would be as an optional peer/companion tool.

## Action Items

- [ ] Consider qmd as optional companion for `.planning/memory/` file search (future milestone)
- [ ] If integrated, document as optional dependency with setup instructions
- [ ] File upstream issue on qmd: build script `cat -` fails on MINGW/Git Bash
