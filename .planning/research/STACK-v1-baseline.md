# Stack Research: memory-nexus

**Project:** Claude Code Session Extraction and Search System
**Researched:** 2026-01-27
**Research Type:** Ecosystem

## Executive Summary

memory-nexus is a CLI tool for extracting Claude Code JSONL sessions into a searchable SQLite database. The stack must support:

1. **High-performance SQLite** with FTS5 full-text search
2. **Streaming JSONL parsing** for large session files (10K+ lines)
3. **CLI framework** compatible with aidev integration
4. **TypeScript** with bun runtime

The key finding is that **better-sqlite3 is NOT compatible with Bun** due to ABI version mismatches. Bun's built-in `bun:sqlite` module is the correct choice - it's faster (3-6x), has FTS5 support, and requires no native compilation.

---

## Recommended Stack

### Runtime

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **Bun** | 1.2.x+ | JavaScript/TypeScript runtime | User preference (WoW standard), native SQLite driver, fastest JSONL parsing. Bun's built-in SQLite is 3-6x faster than better-sqlite3. |

**Confidence:** HIGH (user tooling preference + official Bun documentation)

### Database

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **bun:sqlite** | Built-in | SQLite driver | Native to Bun, no npm dependency, FTS5 support enabled (since v0.6.12 on Linux). API inspired by better-sqlite3 but faster. |
| **SQLite FTS5** | Built-in | Full-text search | Porter tokenizer, BM25 ranking, snippet extraction. No external dependencies. |

**Confidence:** HIGH

**Important Notes:**
- FTS5 is enabled in Bun's SQLite on Linux builds since v0.6.12
- macOS uses Apple's SQLite build which disables extensions by default; may need `Database.setCustomSQLite()` to load FTS5-enabled SQLite library
- Windows support needs verification (likely works, FTS5 is compiled in)

### CLI Framework

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **Commander.js** | ^14.0.0 | CLI parsing | Best TypeScript support via @commander-js/extra-typings. Simple API, zero dependencies, great DX. User's aidev CLI is bash-based, so memory-nexus will be a standalone executable that aidev calls. |
| **@commander-js/extra-typings** | ^14.0.0 | Type inference | Infers strong types for options and action handlers. Version must match Commander major.minor. |

**Confidence:** HIGH

**Alternative considered:** Yargs
- More feature-rich but heavier
- TypeScript support less ergonomic (async typing issues)
- Commander is simpler and sufficient for this use case

### JSONL Parsing

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **Native Bun streaming** | Built-in | Large file processing | Use `Bun.file(path).stream()` + line buffering for JSONL. No external library needed. Bun can process 1 billion rows under 10 seconds with proper chunking. |

**Confidence:** HIGH

**Pattern for JSONL streaming:**
```typescript
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

// For large files, use fs.createReadStream (works better than Bun.file().stream() for readline)
const rl = createInterface({
  input: createReadStream(filePath),
  crlfDelay: Infinity
});

for await (const line of rl) {
  const event = JSON.parse(line);
  // Process event
}
```

**Alternative considered:** stream-json v1.9.1
- Overkill for JSONL (designed for complex JSON streaming)
- Native readline is simpler and sufficient
- Only use stream-json if we need SAX-style parsing or memory-constrained environments

### Validation

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **Zod** | ^4.3.5 | Schema validation | TypeScript-first validation. v4 has 14x faster string parsing, 7x faster array parsing. New @zod/mini (~1.9KB) available for tree-shaking if bundle size matters later. |

**Confidence:** HIGH

### Testing

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **bun:test** | Built-in | Unit/integration tests | Native to Bun, Jest-compatible API, no configuration needed. |

**Confidence:** HIGH

### Build & Development

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **TypeScript** | ^5.5.0 | Type safety | Zod v4 requires TypeScript 5.0+. Commander extra-typings requires TypeScript 5.0+. |
| **Bun bundler** | Built-in | Bundling | `bun build` for creating standalone executable. |

**Confidence:** HIGH

---

## Full Package Dependencies

```json
{
  "dependencies": {
    "commander": "^14.0.0",
    "@commander-js/extra-typings": "^14.0.0",
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/bun": "latest"
  }
}
```

**Installation command:**
```bash
bun add commander @commander-js/extra-typings zod
bun add -d typescript @types/bun
```

---

## What NOT to Use

### better-sqlite3

**DO NOT USE.** Despite being mentioned in project docs, better-sqlite3 is incompatible with Bun:

- Compiled against different Node.js ABI version
- Requires recompilation which often fails
- bun:sqlite is faster anyway (3-6x for reads)

If you need better-sqlite3 API compatibility for some library, use the compatibility shim:
```bash
bun add better-sqlite3@nounder/bun-better-sqlite3
```

But for memory-nexus, use `bun:sqlite` directly.

### stream-json / @streamparser/json

**NOT NEEDED.** These are powerful but overkill for JSONL parsing:

- JSONL is line-delimited, not nested JSON
- Native readline + JSON.parse per line is simpler
- Only use if SAX-style parsing or extreme memory constraints arise

### Drizzle ORM / Kysely / Other ORMs

**NOT NEEDED.** SQLite schema is simple enough for raw SQL:

- Only 5 tables with straightforward relationships
- FTS5 virtual tables don't work well with ORMs
- Raw SQL via bun:sqlite is more performant and transparent

### npm

**DO NOT USE.** User's WoW standard requires bun for all package operations.

---

## Integration Architecture

### How memory-nexus integrates with aidev

The aidev CLI is bash-based (`aidev.sh`). memory-nexus will be a **standalone Bun executable**:

```
aidev memory <command>  -->  memory-nexus-cli <command>
```

**Integration options:**

1. **Shell script wrapper** (simplest):
   ```bash
   # In aidev.sh
   aidev_memory() {
     bun run ~/Projects/memory-nexus/src/cli/index.ts "$@"
   }
   ```

2. **Compiled executable**:
   ```bash
   # Build standalone binary
   bun build src/cli/index.ts --compile --outfile memory-nexus
   ```

3. **npm global install** (if published):
   ```bash
   bun add -g @chude/memory-nexus
   ```

**Recommendation:** Start with option 1 during development, then compile to standalone binary for production.

---

## Platform-Specific Considerations

### Windows

- bun:sqlite works on Windows
- FTS5 availability needs testing (likely enabled)
- Path handling: Use path.posix or normalize paths for SQLite

### macOS

- Apple's SQLite build disables extensions (including FTS5)
- May need to install vanilla SQLite via Homebrew
- Use `Database.setCustomSQLite("/opt/homebrew/Cellar/sqlite/<version>/libsqlite3.dylib")`

### Linux (WSL)

- FTS5 fully supported since Bun v0.6.12
- Best platform for this tool

---

## Confidence Assessment

| Component | Confidence | Reason |
|-----------|------------|--------|
| Bun runtime | HIGH | User WoW standard, official docs |
| bun:sqlite | HIGH | Official Bun docs, GitHub discussions confirm FTS5 |
| Commander.js | HIGH | npm registry, official typings package |
| Zod v4 | HIGH | npm registry, official release notes |
| Native JSONL parsing | HIGH | Bun docs, community benchmarks |
| macOS FTS5 workaround | MEDIUM | Documented but not personally tested |
| Windows FTS5 | LOW | Assumed based on Bun's SQLite build, needs verification |

---

## Open Questions

1. **Windows FTS5 support:** Does Bun's Windows build have FTS5 enabled? Needs testing.

2. **macOS SQLite path:** What's the exact libsqlite3.dylib path for current Homebrew installations?

3. **aidev integration mechanism:** Should memory-nexus be:
   - A shell function in aidev.sh?
   - A standalone binary called by aidev?
   - A separate npm package?

4. **Database location:** Where should the SQLite database live?
   - `~/.config/memory-nexus/sessions.db` (XDG standard)
   - `~/.memory-nexus/sessions.db` (simpler)
   - Configurable via environment variable

---

## Sources

- [Bun SQLite Documentation](https://bun.sh/docs/api/sqlite)
- [Bun v0.6.12 Release Notes - FTS5 enabled](https://github.com/oven-sh/bun/discussions/3468)
- [better-sqlite3 Bun compatibility discussion](https://github.com/oven-sh/bun/discussions/16049)
- [Commander.js npm package](https://www.npmjs.com/package/commander)
- [@commander-js/extra-typings](https://www.npmjs.com/package/@commander-js/extra-typings)
- [Zod v4 release](https://www.infoq.com/news/2025/08/zod-v4-available/)
- [stream-json npm](https://www.npmjs.com/package/stream-json)
- [SQLite FTS5 Extension](https://sqlite.org/fts5.html)
- [Parsing 1 Billion Rows in Bun](https://www.taekim.dev/writing/parsing-1b-rows-in-bun)
- [Building CLI apps with TypeScript in 2026](https://dev.to/hongminhee/building-cli-apps-with-typescript-in-2026-5c9d)
