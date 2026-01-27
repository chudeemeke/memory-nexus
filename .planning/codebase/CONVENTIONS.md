# Coding Conventions

**Analysis Date:** 2026-01-27

**Note:** This project is documentation-only. These conventions are derived from documented WoW (Ways of Working) standards that will apply when implementation begins.

## Code Style

**Formatting:**
- Use Prettier or equivalent for consistent formatting
- No specific config file exists yet (create during Phase 1)

**Linting:**
- Use ESLint for JavaScript/Node.js code
- Enforce consistent style rules

**Language:**
- Primary: Node.js/JavaScript
- Database: SQL (SQLite dialect)

## Naming Patterns

**Files:**
- Use kebab-case for all source files: `jsonl-parser.js`, `entity-extractor.js`
- Test files: `<module>.test.js` pattern
- Config files: `<name>.json`

**Functions:**
- Use camelCase: `parseSessionFile`, `extractMessages`, `buildFtsQuery`
- Async generators use `*` syntax: `async function* parseSessionFile()`

**Variables:**
- Use camelCase for variables and parameters
- Use UPPER_SNAKE_CASE for constants

**Classes:**
- Use PascalCase: `SearchEngine`, `Database`

**Directories:**
- Use lowercase: `src/parser/`, `src/db/`, `src/search/`, `src/cli/`

## Architecture

**Pattern:** Hexagonal Architecture (Domain-Application-Infrastructure-Presentation)

**Layers:**
- Domain: Core business logic, no external dependencies
- Application: Use case orchestration
- Infrastructure: Database, file system, external integrations
- Presentation: CLI commands

**Principles:**
- SOLID principles in all design decisions
- Dependency injection, not hard-coded dependencies
- Domain layer has zero external dependencies

## Import Organization

**Order:**
1. Node.js built-in modules (`fs`, `readline`, `path`)
2. External packages (`better-sqlite3`, `commander`, `chalk`)
3. Internal modules (`../search/search`, `./filters`)

## Error Handling

**Patterns:**
- Graceful degradation: Skip malformed lines, log warnings, continue processing
- Use try/catch at appropriate boundaries
- Log errors with context (line numbers, file paths)

**Example from docs:**
```javascript
try {
    const event = JSON.parse(line);
    yield { ...event, _lineNumber: lineNumber };
} catch (error) {
    console.warn(`Parse error at line ${lineNumber}: ${error.message}`);
}
```

## Git Standards

**Author:** `Chude <chude@emeke.org>` (MANDATORY)

**Commit Format:**
```
type(scope): concise description

- Bullet point detail 1
- Bullet point detail 2
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring (no behavior change)
- `test`: Adding/updating tests
- `docs`: Documentation changes
- `chore`: Build, CI, tooling changes

**Prohibited:**
- NO emojis anywhere (commits, docs, code)
- NO AI attribution ("Generated with Claude", "Co-Authored-By: Claude")
- NO marketing language ("revolutionary", "game-changing", "cutting-edge")

## Documentation Standards

**Requirements:**
- Professional, factual tone
- Clear, direct, unambiguous language
- Substance over style
- No emojis in markdown, README, or any documentation

**JSDoc:**
- Document all public functions
- Include parameter types and descriptions
- Include return type descriptions

**Example:**
```javascript
/**
 * Parse a Claude Code session JSONL file
 * @param {string} filePath - Path to JSONL file
 * @returns {AsyncGenerator<Object>} Parsed events
 */
async function* parseSessionFile(filePath) {
```

## Module Design

**Exports:**
- Export named functions/classes from modules
- Use `module.exports = { func1, func2 }` pattern

**File Size:**
- Keep modules focused on single responsibility
- Split large modules by concern

## CLI Conventions

**Framework:** Commander.js (matches aidev ecosystem)

**Pattern:**
- Main command with subcommands: `aidev memory <action>`
- Options use standard flags: `-v, --verbose`, `-f, --full`
- Provide help text for all commands and options

**Output:**
- Use chalk for terminal colors
- Show progress for long operations
- Provide clear success/error messages

---

*Convention analysis derived from documented WoW standards: 2026-01-27*
