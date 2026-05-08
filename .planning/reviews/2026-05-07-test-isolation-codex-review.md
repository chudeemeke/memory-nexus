OpenAI Codex v0.125.0 (research preview)
--------
workdir: C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus
model: gpt-5.5
provider: openai
approval: never
sandbox: read-only
reasoning effort: high
reasoning summaries: none
session id: 019e06eb-19fa-7043-9a90-aa87b3e3d61b
--------
user
# Plan for review: Standardise CLI command test isolation

You are reviewing a plan, not code. Be adversarial. Identify weaknesses, missed cases, alternative framings, and risks. The user asked specifically for first-principles validation — push back if any reasoning is weak.

## Context

`@chude/memory` is a TypeScript CLI tool (Bun runtime, hexagonal architecture). 41 tests fail when `bun test` runs the full suite, but 0 fail when files run in isolation. Same code, different ordering. This is test pollution.

## Root cause (claimed)

`browse.test.ts` calls `mock.module("./show.js", ...)`, `mock.module("./search.js", ...)`, `mock.module("./context.js", ...)`, `mock.module("./related.js", ...)` to mock dispatch targets. Bun's `mock.module()` is process-wide and persists across test files. When `browse.test.ts` runs first, the mocked exports replace the real implementations for all subsequent files in the same `bun test` invocation. The 4 affected test files (show/search/context/related) end up testing the no-op mocks (which return `exitCode: 0`) instead of the real code.

40 of 41 failures fall into this bucket. The 41st is `friction/dashboard.test.ts`, which doesn't pass a `dbPath` and so hits the real user database (slow, non-deterministic).

## Audit of the broader pattern

Three inconsistent approaches to the same concern (testable DB path) across 16 commands:

**Pattern A — DI via options (clean, used by 4):**
```ts
const dbPath = options.dbPath ?? getDefaultDbPath();
```
Files: context.ts, related.ts, search.ts, status.ts (partially), friction/index.ts (just added).

**Pattern B — Module-level `let testDbPath` + setter (smelly, used by 4):**
```ts
let testDbPath: string | null = null;
export function setTestDbPath(path: string | null) { testDbPath = path; }
const dbPath = testDbPath ?? getDefaultDbPath();
```
Files: browse.ts, purge.ts, show.ts, status.ts (also has options.dbPath, hybrid).

**Pattern C — No test seam at all (worst, used by 8):**
```ts
const dbPath = getDefaultDbPath();
```
Files: backfill.ts, doctor.ts, export.ts, import.ts, list.ts, stats.ts, sync/index.ts, doctor.ts (and friction/index.ts before this session).

## Proposed plan (the one I want validated)

### Stage 1 — Eliminate test pollution from `mock.module()` (in progress)

Refactor `browse.ts` to accept a `BrowseDispatchers` object via parameter (DI). Tests inject mocks per-call instead of using `mock.module()`. **Already done; reduced 41 → 1 failure.**

Audit other `mock.module()` usages:
- `transformers-js-provider.test.ts` mocks `@huggingface/transformers` (third-party). Verify it doesn't leak; the test file is the only consumer of that import.
- `sync/embedding-pass.test.ts` mocks `node:readline` (built-in). Same — verify scope.
- `sync/lazy-loaders.test.ts` mocks 4 internal modules. The file's own docstring says it's "Placed in a separate file to prevent mock.module leakage" — meaning the team already knows the pollution problem and has been working around it instead of solving it. Move to DI.

### Stage 2 — Standardise all 16 CLI commands on Pattern A

For every `executeXCommand`:
1. Add `dbPath?: string` to its options interface.
2. Replace `getDefaultDbPath()` with `options.dbPath ?? getDefaultDbPath()`.
3. Remove module-level `let testDbPath` + `setTestDbPath()`.
4. Update existing tests that called `setTestDbPath()` to pass `dbPath` via options.

For `browse.ts` specifically: it ALSO calls `setShowTestDbPath(path)` to propagate the test path to show. With DI, this propagation goes through the dispatchers parameter and the dbPath option, no setter needed.

### Stage 3 — Verify hermetic execution

Acceptance criteria:
- `bun test` produces 0 failures with the same set of tests, regardless of order.
- No test file uses `mock.module()` for first-party modules.
- No production module exports a `setX()` mutator that tests use to inject state.
- Test isolation does not require running files separately.

### Stage 4 — Document the convention

Add a section to project CLAUDE.md (or equivalent) documenting:
- DI via options is the canonical seam.
- `mock.module()` is forbidden for first-party modules.
- Module-level mutable state is forbidden in production code.

## What I'm explicitly asking codex to challenge

1. **Is the DI-via-options pattern the right canonical seam, or is there a better one?** Alternatives considered: a DependencyContainer/IoC system; environment variables; a global injector singleton. I rejected those as overkill for a CLI tool of this size, but is that judgment right?

2. **Are there test-pollution sources I'm missing?** `mock.module` is the obvious one, but also: process.env mutations, process.exitCode, file system state, time mocks (Date.now), shared in-memory caches in singletons.

3. **Is the audit complete?** I grep'd for `getDefaultDbPath()`, `mock.module(`, and `let testDbPath`. What other anti-patterns should I check?

4. **Is "all 16 commands standardised" too aggressive a scope?** The user's directive was "no excuses, no known issues." But I want a sanity check: is there any command where Pattern C is actually correct (e.g., a bootstrap command that legitimately can't accept an injected DB)?

5. **What's the right rollout?** All-at-once mega-PR or incremental per-command? I lean incremental (atomic commits per command, easier review), but the user values systems-level coherence which suggests all-at-once. Tradeoff?

6. **Beyond test isolation, what other architectural defects does this audit hint at?** When I see 3 inconsistent patterns for the same concern, what other concerns might have the same fragmentation? I should search for them now, not later.

## Constraints / non-goals

- This is a `@chude/memory` Bun TypeScript project, not Node. Some patterns differ.
- Hexagonal architecture: domain layer must stay pure (no DB).
- 95%+ coverage at each metric required.
- Git author: `Chude <chude@emeke.org>`, no AI attribution in commits, no emojis.
- The project ships as an OSS-quality CLI; "industry-standard" is the bar, not "good enough for solo".

hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart Completed
hook: SessionStart Completed
hook: SessionStart Completed
hook: SessionStart Failed
hook: SessionStart Completed
codex
I’ll use the `hexagonal`, `tdd`, and `quality-standards` skills for this review because the plan touches architecture boundaries, isolation testing, and coverage expectations. I’m reviewing the plan only, so I’ll keep this to validation and risks rather than code changes.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -LiteralPath 'C:\\Users\\Destiny\\.agents\\skills\\hexagonal\\SKILL.md' -TotalCount 220" in C:\Projects\memory-nexus
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -LiteralPath 'C:\\Users\\Destiny\\.agents\\skills\\tdd\\SKILL.md' -TotalCount 220" in C:\Projects\memory-nexus
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -LiteralPath 'C:\\Users\\Destiny\\.agents\\skills\\quality-standards\\SKILL.md' -TotalCount 220" in C:\Projects\memory-nexus
 succeeded in 2290ms:
---
name: quality-standards
description: Quality gate implementation guide. Coverage configuration (Jest, pytest, kcov), enforcement layers, handling gaps, aidev release integration. Referenced by quality-standards rule.
disable-model-invocation: true
---

**Version:** 1.0
**Last Updated:** 2026-04-03
**Sources:** Jest docs, pytest-cov docs, aidev release integration
**Changelog:**
- 1.0 (2026-04-03): Initial structured version from rules/skills architecture refactor

# Quality Standards Implementation Guide

The always-on rule (`rules/quality-standards.md`) provides thresholds and the quality gate checklist. This skill provides configuration examples, enforcement layer details, and gap remediation.

## Coverage Configuration

### Jest (Node.js/TypeScript)

```javascript
// jest.config.js
coverageThreshold: {
  global: {
    branches: 95,
    functions: 95,
    lines: 95,
    statements: 95,
  },
},
```

### pytest (Python)

```ini
# pytest.ini
[pytest]
addopts = --cov=src --cov-branch --cov-fail-under=95
```

### Shell scripts (kcov/bashcov)

```bash
kcov --threshold=95 coverage/ ./run-tests.sh
```

## What to Exclude from Coverage

Only exclude files with ZERO executable logic:

```javascript
// jest.config.js
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/**/*.d.ts',           // Type definitions (no runtime code)
  '!src/index.ts',            // Main entry point (bootstrapping only)
  '!src/**/index.ts',         // Barrel files (pure re-exports)
  '!src/schemas/*.ts',        // Pure schema definitions (data only)
],
```

**NOT EXCLUDED (contains executable code):**
- Generated code (GraphQL clients, Prisma, OpenAPI)
- Configuration files with logic (webpack.config.js with conditionals)
- Test utilities (they should be tested too)
- Any file with functions, classes, or conditional logic

## Enforcement Layers (Defense in Depth)

### Layer 1: Local Development
```bash
npm test
# Coverage report: 96.88% statements, 95.2% branches, 97.4% functions, 96.96% lines
# ALL metrics must show >= 95%
```

### Layer 2: Pre-commit Hook
```bash
#!/bin/bash
npm test --coverage
if [ $? -ne 0 ]; then
  echo "ERROR: Tests failed or coverage below 95%. Commit blocked."
  exit 1
fi
```

### Layer 3: CI/CD Pipeline
```yaml
- name: Fail if any coverage metric drops
  run: |
    for metric in statements branches functions lines; do
      if grep -q "$metric.*below threshold" coverage/coverage-summary.txt; then
        echo "Coverage for $metric dropped below 95%!"
        exit 1
      fi
    done
```

### Layer 4: aidev release Gate
```bash
aidev release patch
# 1. Runs npm test (BLOCKS if tests fail)
# 2. Checks EACH coverage metric (BLOCKS if ANY < 95%)
# 3. Runs security audit (BLOCKS if vulnerabilities)
# 4. Runs docTruth (BLOCKS if docs outdated)
# 5. Bumps version (only if ALL gates pass)
# 6. Creates git tag
# 7. Pushes to remote
```

**Never bypass**: Do not use `--force` or `--no-verify` to skip quality gates.

## Handling Coverage Gaps

### 1. Identify Uncovered Code
```bash
npm test -- --coverage --coverageReporters=html
open coverage/lcov-report/index.html
```

### 2. Prioritize by Risk
- Critical paths (auth, payments, data mutations) -- should be 100%
- Happy paths -- 95%+
- Error handling -- 90%+ minimum
- Edge cases -- 85%+ minimum

### 3. Write Targeted Tests
```typescript
describe('edge cases', () => {
  it('should handle null input', () => {
    expect(myFunction(null)).toThrow('Input required');
  });

  it('should handle empty array', () => {
    expect(myFunction([])).toEqual([]);
  });
});
```

### 4. Refactor Untestable Code
If code is truly untestable, refactor it. Untestable code is usually poorly designed:
- Extract pure functions from side-effect-heavy code
- Use dependency injection for external dependencies
- Break large functions into smaller, testable units

hook: PostToolUse
 succeeded in 27436ms:
---
name: tdd
description: Test-driven development with red-green-refactor loop. Use when user wants to build features or fix bugs using TDD, mentions "red-green-refactor", wants integration tests, or asks for test-first development.
---

# Test-Driven Development

## Philosophy

**Core principle**: Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style: they exercise real code paths through public APIs. They describe _what_ the system does, not _how_ it does it. A good test reads like a specification - "user can checkout with valid cart" tells you exactly what capability exists. These tests survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation. They mock internal collaborators, test private methods, or verify through external means (like querying a database directly instead of using the interface). The warning sign: your test breaks when you refactor, but behavior hasn't changed. If you rename an internal function and tests fail, those tests were testing implementation, not behavior.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Anti-Pattern: Horizontal Slices

**DO NOT write all tests first, then all implementation.** This is "horizontal slicing" - treating RED as "write all tests" and GREEN as "write all code."

This produces **crap tests**:

- Tests written in bulk test _imagined_ behavior, not _actual_ behavior
- You end up testing the _shape_ of things (data structures, function signatures) rather than user-facing behavior
- Tests become insensitive to real changes - they pass when behavior breaks, fail when behavior is fine
- You outrun your headlights, committing to test structure before understanding the implementation

**Correct approach**: Vertical slices via tracer bullets. One test â†’ one implementation â†’ repeat. Each test responds to what you learned from the previous cycle. Because you just wrote the code, you know exactly what behavior matters and how to verify it.

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  REDâ†’GREEN: test1â†’impl1
  REDâ†’GREEN: test2â†’impl2
  REDâ†’GREEN: test3â†’impl3
  ...
```

## Workflow

### 1. Planning

When exploring the codebase, use the project's domain glossary so that test names and interface vocabulary match the project's language, and respect ADRs in the area you're touching.

Before writing any code:

- [ ] Confirm with user what interface changes are needed
- [ ] Confirm with user which behaviors to test (prioritize)
- [ ] Identify opportunities for [deep modules](deep-modules.md) (small interface, deep implementation)
- [ ] Design interfaces for [testability](interface-design.md)
- [ ] List the behaviors to test (not implementation steps)
- [ ] Get user approval on the plan

Ask: "What should the public interface look like? Which behaviors are most important to test?"

**You can't test everything.** Confirm with the user exactly which behaviors matter most. Focus testing effort on critical paths and complex logic, not every possible edge case.

### 2. Tracer Bullet

Write ONE test that confirms ONE thing about the system:

```
RED:   Write test for first behavior â†’ test fails
GREEN: Write minimal code to pass â†’ test passes
```

This is your tracer bullet - proves the path works end-to-end.

### 3. Incremental Loop

For each remaining behavior:

```
RED:   Write next test â†’ fails
GREEN: Minimal code to pass â†’ passes
```

Rules:

- One test at a time
- Only enough code to pass current test
- Don't anticipate future tests
- Keep tests focused on observable behavior

### 4. Refactor

After all tests pass, look for [refactor candidates](refactoring.md):

- [ ] Extract duplication
- [ ] Deepen modules (move complexity behind simple interfaces)
- [ ] Apply SOLID principles where natural
- [ ] Consider what new code reveals about existing code
- [ ] Run tests after each refactor step

**Never refactor while RED.** Get to GREEN first.

## Checklist Per Cycle

```
[ ] Test describes behavior, not implementation
[ ] Test uses public interface only
[ ] Test would survive internal refactor
[ ] Code is minimal for this test
[ ] No speculative features added
```

hook: PostToolUse
 succeeded in 27552ms:
---
name: hexagonal
description: Hexagonal Architecture implementation guide. Port/adapter patterns, dependency injection, import enforcement, composition root examples. Referenced by hexagonal-architecture rule.
disable-model-invocation: true
effort: high
---

**Version:** 1.0
**Last Updated:** 2026-04-03
**Sources:** Alistair Cockburn's Ports & Adapters, Clean Architecture (Robert C. Martin)
**Changelog:**
- 1.0 (2026-04-03): Initial structured version from rules/skills architecture refactor

# Hexagonal Architecture Implementation Guide

Comprehensive implementation reference for Ports & Adapters architecture. The always-on rule (`rules/hexagonal-architecture.md`) provides layer constraints and forbidden/required lists. This skill provides the patterns, code examples, and enforcement tooling.

## Example Directory Structure

```
src/
â”œâ”€â”€ domain/              # Core business logic
â”‚   â”œâ”€â”€ entities/        # Business objects with identity
â”‚   â”œâ”€â”€ value-objects/   # Immutable objects without identity
â”‚   â”œâ”€â”€ ports/           # Interfaces (repositories, services)
â”‚   â””â”€â”€ services/        # Domain services
â”œâ”€â”€ application/         # Use cases
â”‚   â”œâ”€â”€ commands/        # Write operations
â”‚   â”œâ”€â”€ queries/         # Read operations
â”‚   â””â”€â”€ services/        # Application services
â”œâ”€â”€ infrastructure/      # Adapters
â”‚   â”œâ”€â”€ database/        # Implements domain ports
â”‚   â”œâ”€â”€ api-clients/     # External API integrations
â”‚   â””â”€â”€ file-system/     # File operations
â””â”€â”€ presentation/        # UI/API
    â”œâ”€â”€ controllers/     # HTTP/CLI handlers
    â””â”€â”€ views/           # UI components
```

## Port and Adapter Pattern

### Defining Ports (Domain Layer)

```typescript
// domain/ports/IUserRepository.ts
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
}

// domain/ports/IEmailService.ts
export interface IEmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}
```

### Implementing Adapters (Infrastructure Layer)

```typescript
// infrastructure/database/PostgresUserRepository.ts
import { IUserRepository } from '../../domain/ports/IUserRepository';

export class PostgresUserRepository implements IUserRepository {
  constructor(private pool: Pool) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] ? this.mapToUser(result.rows[0]) : null;
  }

  async save(user: User): Promise<void> {
    await this.pool.query(
      'INSERT INTO users (id, email, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET email = $2, name = $3',
      [user.id, user.email, user.name]
    );
  }

  async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
  }
}
```

### Using in Application Layer

```typescript
// application/commands/CreateUserCommand.ts
import { IUserRepository } from '../../domain/ports/IUserRepository';
import { IEmailService } from '../../domain/ports/IEmailService';
import { User } from '../../domain/entities/User';

export class CreateUserCommand {
  constructor(
    private userRepository: IUserRepository,
    private emailService: IEmailService
  ) {}

  async execute(dto: CreateUserDto): Promise<User> {
    const user = User.create(dto.email, dto.name);
    await this.userRepository.save(user);
    await this.emailService.send(user.email, 'Welcome!', 'Thanks for joining.');
    return user;
  }
}
```

## Dependency Injection

### Composition Root (Entry Point)

```typescript
// main.ts or app.ts
import { PostgresUserRepository } from './infrastructure/database/PostgresUserRepository';
import { SendGridEmailService } from './infrastructure/email/SendGridEmailService';
import { CreateUserCommand } from './application/commands/CreateUserCommand';

// Create infrastructure
const userRepository = new PostgresUserRepository(pool);
const emailService = new SendGridEmailService(apiKey);

// Wire up application
const createUserCommand = new CreateUserCommand(userRepository, emailService);

// Expose to presentation
const userController = new UserController(createUserCommand);
```

## Import Rules Enforcement

### ESLint Rules

```javascript
// .eslintrc.js
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['**/infrastructure/**'],
          importNames: ['*'],
          message: 'Domain cannot import from Infrastructure'
        },
        {
          group: ['**/presentation/**'],
          importNames: ['*'],
          message: 'Domain cannot import from Presentation'
        }
      ]
    }]
  }
}
```

### TypeScript Path Aliases

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@domain/*": ["src/domain/*"],
      "@application/*": ["src/application/*"],
      "@infrastructure/*": ["src/infrastructure/*"],
      "@presentation/*": ["src/presentation/*"]
    }
  }
}
```

## Supporting Files

- [anti-patterns.md](anti-patterns.md) -- Common violations with code examples
- [checklist.md](checklist.md) -- Architecture verification checklist and testing benefits per layer

hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PostToolUse Completed
codex
I’m going to sanity-check the plan’s audit claims with read-only searches from `C:\Projects\memory-nexus`. That lets me separate “plan logic is sound” from “the inventory may be incomplete.”
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"mock\\.module\\(|getDefaultDbPath\\(|let testDbPath|set[A-Za-z0-9_]*TestDbPath|process\\.env|process\\.exitCode|Date\\.now\\(|new Date\\(|setSystemTime|mock\\.restore|mock\\.clearAllMocks|afterEach|beforeEach\" ." in C:\Projects\memory-nexus
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short' in C:\Projects\memory-nexus
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg --files .' in C:\Projects\memory-nexus
 succeeded in 3510ms:
.\README.md
.\package.json
.\MIGRATION.md
.\TO-DOS.md
.\bunfig.toml
.\bun.lock
.\CLAUDE.md
.\vitest.config.ts
.\tsconfig.lib.json
.\tsconfig.json
.\stryker.config.js
.\deprecation-stub\package.json
.\deprecation-stub\index.js
.\docs\SCRATCHPAD.md
.\docs\05-IMPLEMENTATION.md
.\docs\04-ARCHITECTURE.md
.\docs\03-DECISION-JOURNEY.md
.\docs\02-RESEARCH.md
.\docs\01-VISION.md
.\docs\agent-write-protocol.md
.\docs\HOOKS.md
.\docs\plans\qmd-integration-notes.md
.\docs\plans\PRD-knowledge-layer.md
.\docs\plans\handoff-user-thoughts.md
.\docs\plans\handoff-claude-analysis.md
.\docs\plans\2026-03-07-knowledge-layer-friction-design.md
.\docs\audits\2026-04-26-CONSOLIDATED.md
.\docs\audits\2026-04-26-adversarial-ux-dx.md
.\docs\audits\2026-04-26-adversarial-security.md
.\docs\audits\2026-04-26-adversarial-reliability.md
.\docs\audits\2026-04-26-adversarial-perf-tests.md
.\docs\audits\2026-04-26-adversarial-architecture.md
.\src\index.ts
.\src\application\services\temporal-decay.ts
.\src\application\services\temporal-decay.test.ts
.\src\application\services\sync-service.ts
.\src\application\services\sync-service.test.ts
.\src\application\services\sync-service.integration.test.ts
.\src\application\services\smart-context-service.ts
.\src\application\services\smart-context-service.test.ts
.\src\application\services\rrf-fusion.ts
.\src\application\services\rrf-fusion.test.ts
.\src\application\services\recovery-service.ts
.\src\application\services\recovery-service.test.ts
.\src\application\services\pattern-extractor.ts
.\src\application\services\pattern-extractor.test.ts
.\src\application\services\memory-file-sync-service.ts
.\src\application\services\memory-file-sync-service.test.ts
.\src\application\services\llm-extractor.ts
.\src\application\services\llm-extractor.test.ts
.\src\application\services\index.ts
.\src\application\services\fts-sanitizer.ts
.\src\application\services\fts-sanitizer.test.ts
.\src\application\services\friction-service.ts
.\src\application\services\friction-service.test.ts
.\src\application\services\export-service.ts
.\src\application\services\export-service.test.ts
.\src\application\services\embedding-service.ts
.\src\application\services\embedding-service.test.ts
.\src\application\services\budget-allocator.ts
.\src\application\services\budget-allocator.test.ts
.\src\application\services\backfill-service.ts
.\src\application\services\backfill-service.test.ts
.\src\application\services\ambient-context-service.ts
.\src\application\services\ambient-context-service.test.ts
.\src\application\index.ts
.\src\domain\value-objects\search-result.ts
.\src\domain\value-objects\search-result.test.ts
.\src\domain\value-objects\search-query.ts
.\src\domain\value-objects\search-query.test.ts
.\src\domain\value-objects\project-path.ts
.\src\domain\value-objects\project-path.test.ts
.\src\domain\value-objects\index.ts
.\src\domain\value-objects\embedding-result.ts
.\src\domain\value-objects\embedding-result.test.ts
.\src\domain\value-objects\embedding-config.ts
.\src\domain\value-objects\embedding-config.test.ts
.\src\domain\index.ts
.\src\domain\services\query-parser.ts
.\src\domain\services\query-parser.test.ts
.\src\domain\services\path-decoder.ts
.\src\domain\services\path-decoder.test.ts
.\src\domain\services\index.ts
.\src\domain\services\content-extractor.ts
.\src\domain\services\content-extractor.test.ts
.\src\domain\errors\memory-error.ts
.\src\domain\errors\memory-error.test.ts
.\src\domain\errors\index.ts
.\src\domain\errors\error-codes.ts
.\src\domain\errors\error-codes.test.ts
.\tests\helpers\test-database.ts
.\src\infrastructure\sources\session-source.ts
.\src\infrastructure\sources\session-source.test.ts
.\src\infrastructure\sources\project-name-resolver.ts
.\src\infrastructure\sources\project-name-resolver.test.ts
.\src\infrastructure\sources\memory-file-scanner.ts
.\src\infrastructure\sources\memory-file-scanner.test.ts
.\src\infrastructure\sources\integration.test.ts
.\src\infrastructure\sources\index.ts
.\src\domain\ports\types.ts
.\src\domain\ports\sources.ts
.\src\domain\ports\signals.ts
.\src\domain\ports\services.ts
.\src\domain\ports\repositories.ts
.\src\domain\ports\ports.test.ts
.\src\domain\ports\index.ts
.\src\domain\ports\embedding.ts
.\src\domain\ports\embedding.test.ts
.\src\domain\entities\tool-use.ts
.\src\domain\entities\tool-use.test.ts
.\src\domain\entities\session.ts
.\src\domain\entities\session.test.ts
.\src\domain\entities\message.ts
.\src\domain\entities\message.test.ts
.\src\domain\entities\memory-file.ts
.\src\domain\entities\memory-file.test.ts
.\src\domain\entities\link.ts
.\src\domain\entities\link.test.ts
.\src\domain\entities\index.ts
.\src\domain\entities\friction-entry.ts
.\src\domain\entities\friction-entry.test.ts
.\src\domain\entities\extraction-state.ts
.\src\domain\entities\extraction-state.test.ts
.\src\domain\entities\entity.ts
.\src\domain\entities\entity.test.ts
.\src\domain\entities\backfill-state.ts
.\src\domain\entities\backfill-state.test.ts
.\tests\generators\large-session.ts
.\tests\integration\sync-with-memory-files.test.ts
.\tests\integration\programmatic-api.test.ts
.\tests\integration\large-file.test.ts
.\tests\integration\interrupted-sync.test.ts
.\tests\integration\index.ts
.\tests\integration\concurrent-commands.test.ts
.\tests\integration\api-consumption.test.ts
.\tests\fixtures\with-tools.jsonl
.\tests\fixtures\valid-session.jsonl
.\tests\fixtures\malformed.jsonl
.\tests\fixtures\empty.jsonl
.\src\infrastructure\signals\signal-handler.ts
.\src\infrastructure\signals\signal-handler.test.ts
.\src\infrastructure\signals\index.ts
.\src\infrastructure\signals\checkpoint-manager.ts
.\src\infrastructure\signals\checkpoint-manager.test.ts
.\src\infrastructure\signals\adapters.ts
.\src\infrastructure\paths.ts
.\src\infrastructure\paths.test.ts
.\src\presentation\cli\progress-reporter.ts
.\src\presentation\cli\progress-reporter.test.ts
.\src\infrastructure\llm\claude-summary-generator.ts
.\src\infrastructure\llm\claude-summary-generator.test.ts
.\src\infrastructure\index.ts
.\src\presentation\cli\pickers\session-picker.ts
.\src\presentation\cli\pickers\session-picker.test.ts
.\src\presentation\cli\pickers\index.ts
.\src\infrastructure\hooks\sync-logger-adapter.ts
.\src\infrastructure\hooks\sync-hook-script.ts
.\src\infrastructure\hooks\sync-hook-script.test.ts
.\src\infrastructure\hooks\settings-manager.ts
.\src\infrastructure\hooks\settings-manager.test.ts
.\src\infrastructure\hooks\log-writer.ts
.\src\infrastructure\hooks\log-writer.test.ts
.\src\infrastructure\hooks\index.ts
.\src\infrastructure\hooks\hook-runner.ts
.\src\infrastructure\hooks\hook-runner.test.ts
.\src\infrastructure\hooks\config-manager.ts
.\src\infrastructure\hooks\config-manager.test.ts
.\src\infrastructure\hooks\auto-memory-writer.ts
.\src\infrastructure\hooks\auto-memory-writer.test.ts
.\src\presentation\cli\db-startup.test.ts
.\src\presentation\cli\command-result.ts
.\src\infrastructure\external\qmd-runner.ts
.\src\infrastructure\external\qmd-runner.test.ts
.\src\infrastructure\external\index.ts
.\src\presentation\cli\db-startup.ts
.\src\presentation\cli\index.ts
.\src\infrastructure\migration.test.ts
.\src\infrastructure\migration.ts
.\src\infrastructure\database\index.ts
.\src\infrastructure\database\health-checker.ts
.\src\infrastructure\database\health-checker.test.ts
.\src\infrastructure\database\connection.ts
.\src\infrastructure\database\connection.test.ts
.\src\presentation\cli\parsers\index.ts
.\src\presentation\cli\parsers\date-parser.ts
.\src\presentation\cli\parsers\date-parser.test.ts
.\src\infrastructure\database\integration.test.ts
.\src\infrastructure\database\schema.test.ts
.\src\infrastructure\database\schema.ts
.\src\infrastructure\parsers\timestamp.ts
.\src\infrastructure\parsers\timestamp.test.ts
.\src\infrastructure\parsers\jsonl-parser.ts
.\src\infrastructure\parsers\jsonl-parser.test.ts
.\src\infrastructure\parsers\integration.test.ts
.\src\infrastructure\parsers\index.ts
.\src\infrastructure\parsers\event-classifier.ts
.\src\infrastructure\parsers\event-classifier.test.ts
.\tests\presentation\cli\commands\friction.test.ts
.\src\presentation\cli\formatters\timestamp-formatter.ts
.\src\presentation\cli\formatters\timestamp-formatter.test.ts
.\src\presentation\cli\formatters\text-width.ts
.\src\presentation\cli\formatters\text-width.test.ts
.\src\presentation\cli\formatters\stats-formatter.ts
.\src\presentation\cli\formatters\stats-formatter.test.ts
.\src\presentation\cli\formatters\show-formatter.ts
.\src\presentation\cli\formatters\show-formatter.test.ts
.\src\presentation\cli\formatters\related-formatter.ts
.\src\presentation\cli\formatters\related-formatter.test.ts
.\src\presentation\cli\formatters\output-formatter.ts
.\src\presentation\cli\formatters\output-formatter.test.ts
.\src\presentation\cli\formatters\list-formatter.ts
.\src\presentation\cli\formatters\list-formatter.test.ts
.\src\presentation\cli\formatters\index.ts
.\src\presentation\cli\formatters\friction-dashboard.ts
.\src\presentation\cli\formatters\friction-dashboard.test.ts
.\src\presentation\cli\formatters\error-formatter.ts
.\src\presentation\cli\formatters\error-formatter.test.ts
.\src\presentation\cli\formatters\context-formatter.ts
.\src\presentation\cli\formatters\context-formatter.test.ts
.\src\presentation\cli\formatters\color.ts
.\src\presentation\cli\formatters\color.test.ts
.\src\presentation\cli\formatters\ai-formatter.ts
.\src\presentation\cli\formatters\ai-formatter.test.ts
.\src\infrastructure\embedding\ollama-provider.test.ts
.\src\infrastructure\embedding\index.ts
.\src\infrastructure\embedding\embedding-provider-factory.ts
.\src\infrastructure\embedding\embedding-provider-factory.test.ts
.\src\infrastructure\embedding\background-embedder.ts
.\src\infrastructure\embedding\background-embedder.test.ts
.\src\infrastructure\embedding\openai-provider.ts
.\src\infrastructure\embedding\openai-provider.test.ts
.\src\infrastructure\embedding\ollama-provider.ts
.\src\infrastructure\embedding\transformers-js-provider.test.ts
.\src\infrastructure\embedding\transformers-js-provider.ts
.\tests\presentation\cli\formatters\friction-dashboard.test.ts
.\src\infrastructure\database\services\context-service.ts
.\src\infrastructure\database\services\context-service.test.ts
.\src\infrastructure\database\services\hybrid-search-service.test.ts
.\src\infrastructure\database\services\hybrid-search-service.ts
.\src\infrastructure\database\services\index.ts
.\src\infrastructure\database\services\search-service.ts
.\src\infrastructure\database\services\search-service.test.ts
.\src\infrastructure\database\services\stats-service.test.ts
.\src\infrastructure\database\services\stats-service.ts
.\src\infrastructure\database\repositories\tool-use-repository.ts
.\src\infrastructure\database\repositories\tool-use-repository.test.ts
.\src\infrastructure\database\repositories\session-repository.ts
.\src\infrastructure\database\repositories\session-repository.test.ts
.\src\infrastructure\database\repositories\message-repository.ts
.\src\infrastructure\database\repositories\message-repository.test.ts
.\src\infrastructure\database\repositories\memory-file-repository.ts
.\src\infrastructure\database\repositories\memory-file-repository.test.ts
.\src\infrastructure\database\repositories\link-repository.ts
.\src\infrastructure\database\repositories\link-repository.test.ts
.\src\infrastructure\database\repositories\index.ts
.\src\infrastructure\database\repositories\friction-repository.ts
.\src\infrastructure\database\repositories\friction-repository.test.ts
.\src\infrastructure\database\repositories\extraction-state-repository.ts
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts
.\src\infrastructure\database\repositories\entity-repository.ts
.\src\infrastructure\database\repositories\entity-repository.test.ts
.\src\infrastructure\database\repositories\embedding-repository.ts
.\src\infrastructure\database\repositories\embedding-repository.test.ts
.\src\infrastructure\database\repositories\backfill-state-repository.ts
.\src\infrastructure\database\repositories\backfill-state-repository.test.ts
.\src\presentation\cli\commands\browse.test.ts
.\src\presentation\cli\commands\backfill.ts
.\src\presentation\cli\commands\backfill.test.ts
.\src\presentation\cli\commands\completion.ts
.\src\presentation\cli\commands\completion.test.ts
.\src\presentation\cli\commands\browse.ts
.\src\presentation\cli\commands\context.ts
.\src\presentation\cli\commands\context.test.ts
.\src\presentation\cli\commands\doctor.test.ts
.\src\presentation\cli\commands\uninstall.ts
.\src\presentation\cli\commands\uninstall.test.ts
.\src\presentation\cli\commands\purge.test.ts
.\src\presentation\cli\commands\list.ts
.\src\presentation\cli\commands\list.test.ts
.\src\presentation\cli\commands\install.ts
.\src\presentation\cli\commands\install.test.ts
.\src\presentation\cli\commands\index.ts
.\src\presentation\cli\commands\import.ts
.\src\presentation\cli\commands\import.test.ts
.\src\presentation\cli\commands\show.test.ts
.\src\presentation\cli\commands\search.ts
.\src\presentation\cli\commands\search.test.ts
.\src\presentation\cli\commands\related.ts
.\src\presentation\cli\commands\related.test.ts
.\src\presentation\cli\commands\purge.ts
.\src\presentation\cli\commands\stats.ts
.\src\presentation\cli\commands\stats.test.ts
.\src\presentation\cli\commands\show.ts
.\src\presentation\cli\commands\status.test.ts
.\src\presentation\cli\commands\status.ts
.\src\presentation\cli\commands\export.test.ts
.\src\presentation\cli\commands\doctor.ts
.\src\presentation\cli\commands\export.ts
.\tests\smoke\cli-commands.test.ts
.\src\presentation\cli\commands\sync\types.ts
.\src\presentation\cli\commands\sync\memory-files.ts
.\src\presentation\cli\commands\sync\memory-files.test.ts
.\src\presentation\cli\commands\sync\lazy-loaders.test.ts
.\src\presentation\cli\commands\sync\integration.test.ts
.\src\presentation\cli\commands\sync\index.ts
.\src\presentation\cli\commands\sync\index.test.ts
.\src\presentation\cli\commands\sync\helpers.ts
.\src\presentation\cli\commands\sync\helpers.test.ts
.\src\presentation\cli\commands\sync\embedding-pass.ts
.\src\presentation\cli\commands\sync\embedding-pass.test.ts
.\src\presentation\cli\commands\sync\background.ts
.\src\presentation\cli\commands\sync\background.test.ts
.\src\presentation\cli\commands\sync\ambient.ts
.\src\presentation\cli\commands\sync\ambient.test.ts
.\tests\infrastructure\database\repositories\friction-repository.test.ts
.\src\presentation\cli\commands\friction\wontfix.ts
.\src\presentation\cli\commands\friction\wontfix.test.ts
.\src\presentation\cli\commands\friction\types.ts
.\src\presentation\cli\commands\friction\resolve.ts
.\src\presentation\cli\commands\friction\resolve.test.ts
.\src\presentation\cli\commands\friction\purge.ts
.\src\presentation\cli\commands\friction\purge.test.ts
.\src\presentation\cli\commands\friction\log.ts
.\src\presentation\cli\commands\friction\log.test.ts
.\src\presentation\cli\commands\friction\list.ts
.\src\presentation\cli\commands\friction\list.test.ts
.\src\presentation\cli\commands\friction\index.ts
.\src\presentation\cli\commands\friction\index.test.ts
.\src\presentation\cli\commands\friction\dashboard.ts
.\src\presentation\cli\commands\friction\dashboard.test.ts

hook: PostToolUse
 succeeded in 6819ms:
.\docs\05-IMPLEMENTATION.md:750:    return process.env.MEMORY_NEXUS_DB ||
.\docs\05-IMPLEMENTATION.md:751:           `${process.env.HOME}/.memory-nexus/memory.db`;
.\docs\05-IMPLEMENTATION.md:897:            const date = new Date(r.timestamp);
.\docs\audits\2026-04-26-adversarial-architecture.md:45:- **What's wrong:** Production code has top-level `let testDbPath: string | null = null` (and similar for `testConfigPath`, `testPathOverrides`, `askConfirmationFn`, etc.) plus exported `setTestDbPath(path)` / `resetTestPaths()` mutators. Tests flip the global to redirect production code paths. This is the explicit symptom that DI was missing — the seam was added because there was nowhere to inject.
.\docs\audits\2026-04-26-adversarial-architecture.md:47:- **Recommended fix:** Replace each `let testXxx` + `setTestXxx()` pair with constructor injection through a port. `getDefaultDbPath()` becomes `IPathProvider.getDbPath()`. The composition root in production wires the real `PathProvider`; tests wire a fake. Delete every `setTestXxx` export.
.\docs\audits\2026-04-26-CONSOLIDATED.md:154:- C4. Remove the 13 module-level test-seam globals (`setTestDbPath` etc) — replace with constructor injection.
.\src\presentation\cli\db-startup.test.ts:7:import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
.\src\presentation\cli\db-startup.test.ts:47:  beforeEach(() => {
.\src\presentation\cli\db-startup.test.ts:61:  afterEach(() => {
.\docs\audits\2026-04-26-adversarial-ux-dx.md:351:**Recommended fix:** Detect via `process.env.npm_package_json` or path heuristic; show "reinstall the package" for globally-installed users.
.\tests\generators\large-session.ts:23:  const baseTime = new Date("2026-01-28T10:00:00.000Z").getTime();
.\tests\generators\large-session.ts:27:    const timestamp = new Date(baseTime + i * 1000).toISOString();
.\tests\generators\large-session.ts:81:  const baseTime = new Date("2026-01-28T10:00:00.000Z").getTime();
.\tests\generators\large-session.ts:88:      timestamp: new Date(baseTime).toISOString(),
.\tests\generators\large-session.ts:95:    const timestamp = new Date(baseTime + i * 1000).toISOString();
.\tests\generators\large-session.ts:193:      timestamp: new Date(baseTime + (lineCount - 1) * 1000).toISOString(),
.\docs\audits\2026-04-26-adversarial-perf-tests.md:306:When running `bun test --coverage`, several integration tests print large quantities of output to stdout (real `memory list --json` output, real session scan traces). This pollutes CI logs, makes failure debugging harder, and obscures coverage summary tables. Tests should suppress production output via a quiet mode or stdout capture in `beforeEach`.
.\src\presentation\cli\progress-reporter.test.ts:7:import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from "bun:test";
.\src\presentation\cli\progress-reporter.test.ts:29:  beforeEach(() => {
.\src\presentation\cli\progress-reporter.test.ts:31:      MSYSTEM: process.env.MSYSTEM,
.\src\presentation\cli\progress-reporter.test.ts:32:      WT_SESSION: process.env.WT_SESSION,
.\src\presentation\cli\progress-reporter.test.ts:33:      TERMINUS_SUBLIME: process.env.TERMINUS_SUBLIME,
.\src\presentation\cli\progress-reporter.test.ts:34:      ConEmuTask: process.env.ConEmuTask,
.\src\presentation\cli\progress-reporter.test.ts:35:      TERM_PROGRAM: process.env.TERM_PROGRAM,
.\src\presentation\cli\progress-reporter.test.ts:36:      TERM: process.env.TERM,
.\src\presentation\cli\progress-reporter.test.ts:37:      TERMINAL_EMULATOR: process.env.TERMINAL_EMULATOR,
.\src\presentation\cli\progress-reporter.test.ts:41:    delete process.env.MSYSTEM;
.\src\presentation\cli\progress-reporter.test.ts:42:    delete process.env.WT_SESSION;
.\src\presentation\cli\progress-reporter.test.ts:43:    delete process.env.TERMINUS_SUBLIME;
.\src\presentation\cli\progress-reporter.test.ts:44:    delete process.env.ConEmuTask;
.\src\presentation\cli\progress-reporter.test.ts:45:    delete process.env.TERM_PROGRAM;
.\src\presentation\cli\progress-reporter.test.ts:46:    delete process.env.TERM;
.\src\presentation\cli\progress-reporter.test.ts:47:    delete process.env.TERMINAL_EMULATOR;
.\src\presentation\cli\progress-reporter.test.ts:50:  afterEach(() => {
.\src\presentation\cli\progress-reporter.test.ts:53:        delete process.env[key];
.\src\presentation\cli\progress-reporter.test.ts:55:        process.env[key] = value;
.\src\presentation\cli\progress-reporter.test.ts:63:    process.env.MSYSTEM = "MINGW64";
.\src\presentation\cli\progress-reporter.test.ts:74:    process.env.TERM = "linux";
.\src\presentation\cli\progress-reporter.test.ts:80:    process.env.WT_SESSION = "some-guid";
.\src\presentation\cli\progress-reporter.test.ts:86:    process.env.TERM_PROGRAM = "vscode";
.\src\presentation\cli\progress-reporter.test.ts:99:  beforeEach(() => {
.\src\presentation\cli\progress-reporter.test.ts:100:    savedMSYSTEM = process.env.MSYSTEM;
.\src\presentation\cli\progress-reporter.test.ts:103:  afterEach(() => {
.\src\presentation\cli\progress-reporter.test.ts:105:      delete process.env.MSYSTEM;
.\src\presentation\cli\progress-reporter.test.ts:107:      process.env.MSYSTEM = savedMSYSTEM;
.\src\presentation\cli\progress-reporter.test.ts:121:    process.env.MSYSTEM = "MINGW64";
.\src\presentation\cli\progress-reporter.test.ts:176:    beforeEach(() => {
.\src\presentation\cli\progress-reporter.test.ts:180:    afterEach(() => {
.\src\presentation\cli\progress-reporter.test.ts:301:    afterEach(() => {
.\src\presentation\cli\progress-reporter.test.ts:486:    beforeEach(() => {
.\src\presentation\cli\progress-reporter.test.ts:490:    afterEach(() => {
.\src\presentation\cli\progress-reporter.test.ts:552:  afterEach(() => {
.\src\presentation\cli\progress-reporter.test.ts:602:  beforeEach(async () => {
.\src\presentation\cli\progress-reporter.test.ts:643:  afterEach(() => {
.\src\application\services\ambient-context-service.ts:132:        const today = new Date().toISOString().split("T")[0];
.\src\application\services\ambient-context-service.test.ts:9:import { describe, expect, it, beforeEach } from "bun:test";
.\src\application\services\backfill-service.test.ts:9:import { describe, it, expect, beforeEach } from "bun:test";
.\src\application\services\backfill-service.test.ts:49:    timestamp: new Date("2026-03-08T10:00:00Z"),
.\src\application\services\backfill-service.test.ts:142:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z")),
.\src\application\services\backfill-service.test.ts:143:        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T11:00:00Z")),
.\src\application\services\backfill-service.test.ts:144:        createMockSession("s3", "C:\\Projects\\proj1", new Date("2026-03-08T12:00:00Z")),
.\src\application\services\backfill-service.test.ts:152:          backfilledAt: new Date(),
.\src\application\services\backfill-service.test.ts:174:        createMockSession("s1", "C:\\Projects\\kanbanflow", new Date("2026-03-08T10:00:00Z")),
.\src\application\services\backfill-service.test.ts:175:        createMockSession("s2", "C:\\Projects\\memory-nexus", new Date("2026-03-08T11:00:00Z")),
.\src\application\services\backfill-service.test.ts:176:        createMockSession("s3", "C:\\Projects\\kanbanflow", new Date("2026-03-08T12:00:00Z")),
.\src\application\services\backfill-service.test.ts:194:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z")),
.\src\application\services\backfill-service.test.ts:201:          backfilledAt: new Date(),
.\src\application\services\backfill-service.test.ts:225:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:226:        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T11:00:00Z"), new Date("2026-03-08T11:30:00Z")),
.\src\application\services\backfill-service.test.ts:227:        createMockSession("s3", "C:\\Projects\\proj1", new Date("2026-03-08T12:00:00Z"), new Date("2026-03-08T12:30:00Z")),
.\src\application\services\backfill-service.test.ts:264:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:300:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:340:          createMockSession(`s${i}`, "C:\\Projects\\proj1", new Date(`2026-03-0${i + 1}T10:00:00Z`), new Date(`2026-03-0${i + 1}T11:00:00Z`)),
.\src\application\services\backfill-service.test.ts:364:        createMockSession("s1", "C:\\Projects\\kanbanflow", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:365:        createMockSession("s2", "C:\\Projects\\memory-nexus", new Date("2026-03-08T11:00:00Z"), new Date("2026-03-08T11:30:00Z")),
.\src\application\services\backfill-service.test.ts:366:        createMockSession("s3", "C:\\Projects\\kanbanflow", new Date("2026-03-08T12:00:00Z"), new Date("2026-03-08T12:30:00Z")),
.\src\application\services\backfill-service.test.ts:389:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:390:        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T11:00:00Z"), new Date("2026-03-08T11:30:00Z")),
.\src\application\services\backfill-service.test.ts:391:        createMockSession("s3", "C:\\Projects\\proj1", new Date("2026-03-08T12:00:00Z"), new Date("2026-03-08T12:30:00Z")),
.\src\application\services\backfill-service.test.ts:399:          backfilledAt: new Date(),
.\src\application\services\backfill-service.test.ts:425:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:426:        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T11:00:00Z"), new Date("2026-03-08T11:30:00Z")),
.\src\application\services\backfill-service.test.ts:427:        createMockSession("s3", "C:\\Projects\\proj1", new Date("2026-03-08T12:00:00Z"), new Date("2026-03-08T12:30:00Z")),
.\src\application\services\backfill-service.test.ts:464:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:490:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:491:        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T14:00:00Z"), new Date("2026-03-08T14:30:00Z")),
.\src\application\services\backfill-service.test.ts:519:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:520:        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T11:00:00Z"), new Date("2026-03-08T11:30:00Z")),
.\src\application\services\backfill-service.test.ts:521:        createMockSession("s3", "C:\\Projects\\proj1", new Date("2026-03-08T12:00:00Z"), new Date("2026-03-08T12:30:00Z")),
.\src\application\services\backfill-service.test.ts:553:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:554:        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T11:00:00Z"), new Date("2026-03-08T11:30:00Z")),
.\src\application\services\backfill-service.test.ts:575:            backfilledAt: new Date(),
.\src\application\services\backfill-service.test.ts:607:        createMockSession("s1", "C:\\Users\\Destiny\\Projects\\kanbanflow", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:651:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:685:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-07T10:00:00Z"), new Date("2026-03-07T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:686:        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-07T14:00:00Z"), new Date("2026-03-07T14:30:00Z")),
.\src\application\services\backfill-service.test.ts:687:        createMockSession("s3", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
.\src\application\services\backfill-service.test.ts:713:        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z")),
.\src\application\services\backfill-service.ts:163:            backfilledAt: new Date(),
.\src\application\services\backfill-service.ts:180:            backfilledAt: new Date(),
.\tests\smoke\cli-commands.test.ts:8:import { describe, expect, it, beforeEach, afterEach } from "bun:test";
.\tests\smoke\cli-commands.test.ts:77:  beforeEach(() => {
.\tests\smoke\cli-commands.test.ts:84:  afterEach(() => {
.\src\infrastructure\embedding\background-embedder.test.ts:8:import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
.\src\infrastructure\embedding\background-embedder.test.ts:34:  beforeEach(() => {
.\src\infrastructure\embedding\background-embedder.test.ts:35:    testDir = join(tmpdir(), `memory-bg-embed-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
.\src\infrastructure\embedding\background-embedder.test.ts:39:  afterEach(() => {
.\src\infrastructure\embedding\background-embedder.test.ts:49:        startedAt: new Date().toISOString(),
.\src\infrastructure\embedding\background-embedder.test.ts:60:      const now = new Date().toISOString();
.\src\infrastructure\embedding\background-embedder.test.ts:77:      const isoTimestamp = new Date().toISOString();
.\src\infrastructure\embedding\background-embedder.test.ts:88:      const parsed = new Date(content.startedAt);
.\src\infrastructure\embedding\background-embedder.test.ts:127:        startedAt: new Date().toISOString(),
.\src\infrastructure\embedding\background-embedder.test.ts:207:  beforeEach(() => {
.\src\infrastructure\embedding\background-embedder.test.ts:208:    testDir = join(tmpdir(), `memory-bg-spawn-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
.\src\infrastructure\embedding\background-embedder.test.ts:214:  afterEach(() => {
.\src\infrastructure\embedding\background-embedder.test.ts:366:        startedAt: new Date().toISOString(),
.\src\infrastructure\embedding\background-embedder.test.ts:390:  beforeEach(() => {
.\src\infrastructure\embedding\background-embedder.test.ts:391:    testDir = join(tmpdir(), `memory-bg-cleanup-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
.\src\infrastructure\embedding\background-embedder.test.ts:395:  afterEach(() => {
.\src\infrastructure\embedding\background-embedder.test.ts:404:      startedAt: new Date().toISOString(),
.\src\infrastructure\embedding\background-embedder.test.ts:422:  const originalEnv = process.env.MEMORY_EMBED_BACKGROUND;
.\src\infrastructure\embedding\background-embedder.test.ts:424:  afterEach(() => {
.\src\infrastructure\embedding\background-embedder.test.ts:426:      delete process.env.MEMORY_EMBED_BACKGROUND;
.\src\infrastructure\embedding\background-embedder.test.ts:428:      process.env.MEMORY_EMBED_BACKGROUND = originalEnv;
.\src\infrastructure\embedding\background-embedder.test.ts:433:    process.env.MEMORY_EMBED_BACKGROUND = "1";
.\src\infrastructure\embedding\background-embedder.test.ts:438:    delete process.env.MEMORY_EMBED_BACKGROUND;
.\src\infrastructure\embedding\background-embedder.test.ts:443:    process.env.MEMORY_EMBED_BACKGROUND = "0";
.\src\presentation\cli\parsers\date-parser.ts:43:  const reference = referenceDate ?? new Date();
.\src\presentation\cli\parsers\date-parser.ts:57:  const resultDay = new Date(result.getFullYear(), result.getMonth(), result.getDate());
.\src\presentation\cli\parsers\date-parser.ts:58:  const referenceDay = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
.\src\application\services\embedding-service.test.ts:9:import { describe, expect, test, beforeEach, mock } from "bun:test";
.\src\presentation\cli\parsers\date-parser.test.ts:7:import { describe, it, expect, beforeEach } from "bun:test";
.\src\presentation\cli\parsers\date-parser.test.ts:12:  const referenceDate = new Date("2026-01-29T12:00:00Z");
.\src\presentation\cli\parsers\date-parser.test.ts:121:        expect(result.getTime()).toBeLessThan(Date.now());
.\src\application\services\embedding-service.ts:165:        const startTime = Date.now();
.\src\application\services\embedding-service.ts:197:        const durationMs = Date.now() - startTime;
.\src\application\services\export-service.test.ts:8:import { describe, test, expect, beforeEach, afterEach } from "bun:test";
.\src\application\services\export-service.test.ts:29:  beforeEach(() => {
.\src\application\services\export-service.test.ts:41:  afterEach(() => {
.\src\application\services\export-service.test.ts:99:      const beforeExport = new Date();
.\src\application\services\export-service.test.ts:101:      const afterExport = new Date();
.\src\application\services\export-service.test.ts:106:      const exportedAt = new Date(data.exportedAt);
.\src\application\services\export-service.test.ts:327:        exportedAt: new Date().toISOString(),
.\tests\infrastructure\database\repositories\friction-repository.test.ts:8:import { describe, test, expect, beforeEach, afterEach } from "bun:test";
.\tests\infrastructure\database\repositories\friction-repository.test.ts:37:        loggedAt: new Date(),
.\tests\infrastructure\database\repositories\friction-repository.test.ts:45:    beforeEach(() => {
.\tests\infrastructure\database\repositories\friction-repository.test.ts:50:    afterEach(() => {
.\tests\infrastructure\database\repositories\friction-repository.test.ts:56:            const reviewDate = new Date("2026-03-20T10:00:00Z");
.\tests\infrastructure\database\repositories\friction-repository.test.ts:65:                loggedAt: new Date(),
.\tests\infrastructure\database\repositories\friction-repository.test.ts:126:            const now = new Date("2026-03-21T12:00:00Z");
.\src\presentation\cli\pickers\session-picker.test.ts:7:import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
.\src\presentation\cli\pickers\session-picker.test.ts:46:  const startTime = overrides.startTime ?? new Date("2026-01-31T10:00:00Z");
.\src\presentation\cli\pickers\session-picker.test.ts:58:      timestamp: new Date(startTime.getTime() + i * 1000),
.\src\presentation\cli\pickers\session-picker.test.ts:66:  beforeEach(async () => {
.\src\presentation\cli\pickers\session-picker.test.ts:85:  afterEach(() => {
.\src\presentation\cli\pickers\session-picker.test.ts:161:  beforeEach(async () => {
.\src\presentation\cli\pickers\session-picker.test.ts:167:  afterEach(() => {
.\src\presentation\cli\pickers\session-picker.test.ts:185:  beforeEach(async () => {
.\src\presentation\cli\pickers\session-picker.test.ts:200:  afterEach(() => {
.\src\presentation\cli\pickers\session-picker.test.ts:216:    const now = new Date();
.\src\presentation\cli\pickers\session-picker.test.ts:221:        startTime: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
.\src\application\services\export-service.ts:277:    exportedAt: new Date().toISOString(),
.\src\infrastructure\database\connection.test.ts:8:import { describe, test, expect, afterEach } from "bun:test";
.\src\infrastructure\database\connection.test.ts:50:    afterEach(() => {
.\src\infrastructure\database\connection.test.ts:230:            const path = getDefaultDbPath();
.\src\infrastructure\database\connection.test.ts:235:            const path = getDefaultDbPath();
.\src\application\services\friction-service.test.ts:8:import { describe, expect, it, beforeEach, spyOn, afterEach } from "bun:test";
.\src\application\services\friction-service.test.ts:110:                resolvedAt: new Date(),
.\src\application\services\friction-service.test.ts:173:    beforeEach(() => {
.\src\application\services\friction-service.test.ts:252:            const date = new Date("2026-03-08T00:00:00Z");
.\src\application\services\friction-service.test.ts:450:        beforeEach(() => {
.\src\application\services\friction-service.ts:81:            loggedAt: params.loggedAt ?? new Date(),
.\src\application\services\friction-service.ts:240:                        ? new Date(raw.date + "T00:00:00Z")
.\src\application\services\friction-service.ts:241:                        : new Date(),
.\src\application\services\friction-service.ts:278:        await this.repository.markReviewed(tool, new Date());
.\tests\helpers\test-database.ts:80: * beforeEach(() => {
.\tests\helpers\test-database.ts:86: * afterEach(() => {
.\tests\helpers\test-database.ts:150: * beforeEach(() => {
.\tests\helpers\test-database.ts:154: * afterEach(() => {
.\tests\presentation\cli\commands\friction.test.ts:8:import { describe, expect, it, beforeEach, afterEach, spyOn, mock } from "bun:test";
.\tests\presentation\cli\commands\friction.test.ts:69:    beforeEach(() => {
.\tests\presentation\cli\commands\friction.test.ts:80:    afterEach(() => {
.\tests\integration\concurrent-commands.test.ts:8:import { describe, test, expect, beforeEach, afterEach } from "bun:test";
.\tests\integration\concurrent-commands.test.ts:38:  const timestamp = new Date().toISOString();
.\tests\integration\concurrent-commands.test.ts:103:  beforeEach(() => {
.\tests\integration\concurrent-commands.test.ts:118:        modifiedTime: new Date(),
.\tests\integration\concurrent-commands.test.ts:127:  afterEach(() => {
.\src\infrastructure\embedding\transformers-js-provider.test.ts:9:import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
.\src\infrastructure\embedding\transformers-js-provider.test.ts:56:mock.module("@huggingface/transformers", () => ({
.\src\infrastructure\embedding\transformers-js-provider.test.ts:64:beforeEach(() => {
.\src\infrastructure\database\health-checker.test.ts:7:import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
.\src\infrastructure\database\health-checker.test.ts:30:    const testDir = join(tmpdir(), `health-checker-test-${Date.now()}`);
.\src\infrastructure\database\health-checker.test.ts:179:        afterEach(() => {
.\src\infrastructure\database\health-checker.test.ts:284:        afterEach(() => {
.\src\infrastructure\database\health-checker.test.ts:322:            const timestamp = new Date().toISOString();
.\src\infrastructure\database\health-checker.test.ts:343:        afterEach(() => {
.\src\infrastructure\database\health-checker.test.ts:482:        afterEach(() => {
.\tests\presentation\cli\formatters\friction-dashboard.test.ts:38:        loggedAt: new Date(),
.\tests\integration\sync-with-memory-files.test.ts:12:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\tests\integration\sync-with-memory-files.test.ts:26:  beforeEach(() => {
.\tests\integration\sync-with-memory-files.test.ts:32:  afterEach(() => {
.\tests\integration\sync-with-memory-files.test.ts:142:      "# Learnings\n\n## Bun test mock leakage\n- **Context:** When testing with spyOn\n- **Wrong approach:** Not restoring mocks\n- **Correct approach:** Always restore in afterEach\n- **Applies to:** cross-project\n"
.\tests\integration\interrupted-sync.test.ts:8:import { describe, test, expect, beforeEach, afterEach } from "bun:test";
.\tests\integration\interrupted-sync.test.ts:50:    modifiedTime: new Date(),
.\tests\integration\interrupted-sync.test.ts:59:  const timestamp = new Date().toISOString();
.\tests\integration\interrupted-sync.test.ts:64:      uuid: `msg-${Date.now()}-1`,
.\tests\integration\interrupted-sync.test.ts:73:      uuid: `msg-${Date.now()}-2`,
.\tests\integration\interrupted-sync.test.ts:99:  beforeEach(() => {
.\tests\integration\interrupted-sync.test.ts:137:  afterEach(() => {
.\tests\integration\interrupted-sync.test.ts:257:      startedAt: new Date().toISOString(),
.\tests\integration\interrupted-sync.test.ts:261:      lastCompletedAt: new Date().toISOString(),
.\tests\integration\interrupted-sync.test.ts:328:      startedAt: new Date().toISOString(),
.\tests\integration\interrupted-sync.test.ts:332:      lastCompletedAt: new Date().toISOString(),
.\src\application\services\llm-extractor.test.ts:23:      id: id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
.\src\application\services\llm-extractor.test.ts:26:      timestamp: new Date(),
.\src\infrastructure\database\connection.ts:76:export function getDefaultDbPath(): string {
.\tests\integration\programmatic-api.test.ts:476:      const savedExitCode = process.exitCode;
.\tests\integration\programmatic-api.test.ts:477:      process.exitCode = undefined;
.\tests\integration\programmatic-api.test.ts:480:      expect(process.exitCode).toBeUndefined();
.\tests\integration\programmatic-api.test.ts:483:      expect(process.exitCode).toBeUndefined();
.\tests\integration\programmatic-api.test.ts:486:      expect(process.exitCode).toBeUndefined();
.\tests\integration\programmatic-api.test.ts:489:      process.exitCode = savedExitCode;
.\tests\integration\index.ts:183:      modifiedTime: new Date(),
.\tests\integration\index.ts:210:  const baseTime = Date.now();
.\tests\integration\index.ts:213:    const timestamp = new Date(baseTime + i * 1000).toISOString();
.\tests\integration\index.ts:305:  const startTime = Date.now();
.\tests\integration\index.ts:307:  while (Date.now() - startTime < timeoutMs) {
.\src\infrastructure\database\integration.test.ts:9:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\integration.test.ts:72:    beforeEach(() => {
.\src\infrastructure\database\integration.test.ts:80:    afterEach(() => {
.\src\infrastructure\database\integration.test.ts:673:    beforeEach(() => {
.\src\infrastructure\database\integration.test.ts:675:        dbPath = join(tmpdir(), `memory-nexus-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
.\src\infrastructure\database\integration.test.ts:688:    afterEach(() => {
.\src\infrastructure\database\integration.test.ts:765:    beforeEach(() => {
.\src\infrastructure\database\integration.test.ts:773:    afterEach(() => {
.\src\infrastructure\database\integration.test.ts:992:    beforeEach(() => {
.\src\infrastructure\database\integration.test.ts:1003:    afterEach(() => {
.\src\infrastructure\database\integration.test.ts:1013:            startTime: new Date("2024-06-15T10:00:00Z"),
.\src\infrastructure\database\integration.test.ts:1029:                timestamp: new Date(Date.now() + i * 1000),
.\src\infrastructure\database\integration.test.ts:1042:            startedAt: new Date(),
.\src\infrastructure\database\integration.test.ts:1045:            completedAt: new Date(),
.\src\infrastructure\database\integration.test.ts:1091:            startTime: new Date(),
.\src\infrastructure\database\integration.test.ts:1096:            startTime: new Date(),
.\src\infrastructure\database\integration.test.ts:1107:            timestamp: new Date(),
.\src\infrastructure\database\integration.test.ts:1113:            timestamp: new Date(),
.\src\infrastructure\database\integration.test.ts:1138:            startTime: new Date(),
.\src\infrastructure\database\integration.test.ts:1154:            timestamp: new Date(),
.\src\infrastructure\database\integration.test.ts:1169:            startTime: new Date(),
.\src\infrastructure\database\integration.test.ts:1179:                timestamp: new Date(Date.now() + i),
.\src\infrastructure\embedding\openai-provider.test.ts:8:import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
.\src\infrastructure\embedding\openai-provider.test.ts:16:    afterEach(() => {
.\src\infrastructure\embedding\openai-provider.test.ts:80:        beforeEach(async () => {
.\src\infrastructure\embedding\openai-provider.test.ts:160:        beforeEach(async () => {
.\src\infrastructure\database\health-checker.ts:264:        lastRun: logs.length > 0 ? new Date(logs[0].timestamp) : null,
.\src\infrastructure\database\health-checker.ts:413:    const dbPath = effectiveOverrides?.dbPath ?? getDefaultDbPath();
.\src\application\services\memory-file-sync-service.ts:101:          lastIndexedAt: new Date(),
.\tests\integration\large-file.test.ts:25:  const baseTime = Date.now();
.\tests\integration\large-file.test.ts:28:    const timestamp = new Date(baseTime + i * 1000).toISOString();
.\tests\integration\large-file.test.ts:121:  const baseTime = Date.now();
.\tests\integration\large-file.test.ts:146:    const timestamp = new Date(baseTime + i * 1000).toISOString();
.\src\infrastructure\database\schema.test.ts:7:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\schema.test.ts:41:    beforeEach(() => {
.\src\infrastructure\database\schema.test.ts:46:    afterEach(() => {
.\src\infrastructure\database\schema.test.ts:208:        beforeEach(() => {
.\src\infrastructure\database\schema.test.ts:314:        beforeEach(() => {
.\src\infrastructure\database\schema.test.ts:367:        beforeEach(() => {
.\src\infrastructure\database\schema.test.ts:499:        beforeEach(() => {
.\src\infrastructure\database\schema.test.ts:588:        beforeEach(() => {
.\src\infrastructure\database\schema.test.ts:638:            const before = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
.\src\infrastructure\database\schema.test.ts:671:        beforeEach(() => {
.\src\infrastructure\database\schema.test.ts:770:        beforeEach(() => {
.\src\infrastructure\database\schema.test.ts:970:            beforeEach(() => {
.\src\infrastructure\database\schema.test.ts:1105:            beforeEach(() => {
.\src\infrastructure\database\schema.test.ts:1570:            beforeEach(() => {
.\src\infrastructure\database\schema.test.ts:1713:            beforeEach(() => {
.\src\infrastructure\database\schema.test.ts:1729:            beforeEach(() => {
.\src\application\services\memory-file-sync-service.test.ts:8:import { describe, it, expect, beforeEach, mock } from "bun:test";
.\src\application\services\memory-file-sync-service.test.ts:49:    lastIndexedAt: overrides.lastIndexedAt ?? new Date(),
.\src\application\services\memory-file-sync-service.test.ts:58:  beforeEach(() => {
.\src\application\services\pattern-extractor.test.ts:23:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:39:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:59:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:75:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:91:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:107:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:128:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:135:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:142:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:161:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:184:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:191:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:202:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:209:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:230:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:237:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:245:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:257:      const timestamp = new Date("2025-01-15T10:30:00Z");
.\src\application\services\pattern-extractor.test.ts:289:      const timestamp = new Date("2025-01-15T10:30:00Z");
.\src\application\services\pattern-extractor.test.ts:318:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:325:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:332:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:352:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:359:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:367:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:374:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:394:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:401:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:427:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:434:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:441:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:448:          timestamp: new Date(),
.\src\application\services\pattern-extractor.test.ts:497:        { path: "/src/new.ts", operation: "Write", timestamp: new Date() },
.\src\application\services\pattern-extractor.test.ts:498:        { path: "/src/edit.ts", operation: "Edit", timestamp: new Date() },
.\src\application\services\pattern-extractor.test.ts:515:        { path: "/src/file.ts", operation: "Write", timestamp: new Date() },
.\src\infrastructure\embedding\ollama-provider.test.ts:8:import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
.\src\infrastructure\embedding\ollama-provider.test.ts:16:    afterEach(() => {
.\src\infrastructure\embedding\ollama-provider.test.ts:118:        beforeEach(async () => {
.\src\infrastructure\embedding\ollama-provider.test.ts:207:        beforeEach(async () => {
.\src\domain\value-objects\search-result.ts:42:    this._timestamp = new Date(params.timestamp.getTime());
.\src\domain\value-objects\search-result.ts:104:    return new Date(this._timestamp.getTime());
.\src\application\services\recovery-service.test.ts:8:import { describe, test, expect, beforeEach, afterEach } from "bun:test";
.\src\application\services\recovery-service.test.ts:26:    modifiedTime: new Date(),
.\src\application\services\recovery-service.test.ts:38:    startedAt: new Date(),
.\src\application\services\recovery-service.test.ts:40:    completedAt: new Date(),
.\src\application\services\recovery-service.test.ts:60:  beforeEach(() => {
.\src\application\services\recovery-service.test.ts:126:  afterEach(() => {
.\src\application\services\recovery-service.test.ts:240:        startedAt: new Date(),
.\src\application\services\recovery-service.test.ts:257:        startedAt: new Date(),
.\src\infrastructure\embedding\embedding-provider-factory.test.ts:8:import { describe, expect, test, beforeEach } from "bun:test";
.\src\infrastructure\embedding\embedding-provider-factory.test.ts:19:    beforeEach(() => {
.\src\infrastructure\embedding\background-embedder.ts:171:    { pid, startedAt: new Date().toISOString(), totalMessages },
.\src\infrastructure\embedding\background-embedder.ts:230:      ...process.env,
.\src\infrastructure\embedding\background-embedder.ts:276:  return process.env.MEMORY_EMBED_BACKGROUND === "1";
.\src\domain\value-objects\search-result.test.ts:11:    timestamp: new Date("2024-01-15T10:30:00Z"),
.\src\domain\value-objects\search-result.test.ts:22:      expect(result.timestamp).toEqual(new Date("2024-01-15T10:30:00Z"));
.\src\domain\value-objects\search-result.test.ts:84:      const originalDate = new Date("2024-01-15T10:30:00Z");
.\src\infrastructure\paths.test.ts:7:import { afterEach, beforeEach, describe, expect, test } from "bun:test";
.\src\infrastructure\paths.test.ts:33:    beforeEach(() => {
.\src\infrastructure\paths.test.ts:34:        savedXdgConfigHome = process.env.XDG_CONFIG_HOME;
.\src\infrastructure\paths.test.ts:35:        savedXdgDataHome = process.env.XDG_DATA_HOME;
.\src\infrastructure\paths.test.ts:36:        delete process.env.XDG_CONFIG_HOME;
.\src\infrastructure\paths.test.ts:37:        delete process.env.XDG_DATA_HOME;
.\src\infrastructure\paths.test.ts:41:    afterEach(() => {
.\src\infrastructure\paths.test.ts:43:            process.env.XDG_CONFIG_HOME = savedXdgConfigHome;
.\src\infrastructure\paths.test.ts:45:            delete process.env.XDG_CONFIG_HOME;
.\src\infrastructure\paths.test.ts:48:            process.env.XDG_DATA_HOME = savedXdgDataHome;
.\src\infrastructure\paths.test.ts:50:            delete process.env.XDG_DATA_HOME;
.\src\infrastructure\paths.test.ts:62:            process.env.XDG_CONFIG_HOME = "/custom/config";
.\src\infrastructure\paths.test.ts:75:            process.env.XDG_DATA_HOME = "/custom/data";
.\src\infrastructure\paths.test.ts:83:            process.env.XDG_CONFIG_HOME = "/custom/config";
.\src\infrastructure\paths.test.ts:89:            process.env.XDG_DATA_HOME = "/custom/data";
.\src\infrastructure\paths.test.ts:95:            process.env.XDG_CONFIG_HOME = "/custom/config";
.\src\infrastructure\paths.test.ts:96:            process.env.XDG_DATA_HOME = "/custom/data";
.\src\infrastructure\paths.test.ts:109:            process.env.XDG_CONFIG_HOME = "/custom/config";
.\src\infrastructure\paths.test.ts:115:            process.env.XDG_DATA_HOME = "/custom/data";
.\src\infrastructure\paths.test.ts:153:            process.env.XDG_CONFIG_HOME = "/xdg/config";
.\src\infrastructure\paths.test.ts:154:            process.env.XDG_DATA_HOME = "/xdg/data";
.\src\infrastructure\paths.test.ts:207:            process.env.XDG_CONFIG_HOME = "/xdg/config";
.\src\infrastructure\paths.test.ts:236:            process.env.XDG_CONFIG_HOME = "/custom/config";
.\src\infrastructure\paths.test.ts:241:            process.env.XDG_DATA_HOME = "/custom/data";
.\src\presentation\cli\formatters\timestamp-formatter.ts:36:  const ref = reference ?? new Date();
.\src\infrastructure\sources\memory-file-scanner.test.ts:8:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\sources\memory-file-scanner.test.ts:21:    beforeEach(async () => {
.\src\infrastructure\sources\memory-file-scanner.test.ts:27:    afterEach(async () => {
.\src\infrastructure\sources\memory-file-scanner.test.ts:59:        beforeEach(async () => {
.\src\infrastructure\paths.ts:64:    const xdgConfig = process.env.XDG_CONFIG_HOME;
.\src\infrastructure\paths.ts:87:    const xdgData = process.env.XDG_DATA_HOME;
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:16:  const referenceDate = new Date("2026-01-29T14:30:00");
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:20:      const date = new Date(referenceDate.getTime() - 30 * 1000); // 30 seconds ago
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:28:      const date = new Date(referenceDate.getTime() - 15 * 60 * 1000); // 15 minutes ago
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:35:      const date = new Date(referenceDate.getTime() - 5 * 60 * 60 * 1000); // 5 hours ago
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:42:      const date = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:49:      const date = new Date(referenceDate.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:56:      const date = new Date(referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 1 week ago
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:63:      const date = new Date(referenceDate.getTime() - 3 * 7 * 24 * 60 * 60 * 1000); // 3 weeks ago
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:70:      const date = new Date(referenceDate.getTime() - 30 * 24 * 60 * 60 * 1000); // ~1 month ago
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:77:      const date = new Date(referenceDate.getTime() - 90 * 24 * 60 * 60 * 1000); // ~3 months ago
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:84:      const date = new Date(Date.now() - 60 * 1000); // 1 minute ago
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:93:      const date = new Date("2026-01-27T14:30:00");
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:100:      const date = new Date("2026-03-05T09:05:00");
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:107:      const date = new Date("2026-01-15T00:00:00");
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:116:      const date = new Date(referenceDate.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:126:      const date = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
.\src\presentation\cli\formatters\timestamp-formatter.test.ts:134:      const date = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
.\src\infrastructure\sources\session-source.test.ts:7:import { describe, expect, test, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\sources\session-source.test.ts:18:    beforeEach(() => {
.\src\infrastructure\sources\session-source.test.ts:20:        testDir = join(tmpdir(), `session-source-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
.\src\infrastructure\sources\session-source.test.ts:25:    afterEach(() => {
.\src\infrastructure\database\services\context-service.test.ts:13:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\services\context-service.test.ts:33:  const time = startTime ?? new Date();
.\src\infrastructure\database\services\context-service.test.ts:72:  const time = timestamp ?? new Date();
.\src\infrastructure\database\services\context-service.test.ts:108:  beforeEach(() => {
.\src\infrastructure\database\services\context-service.test.ts:114:  afterEach(() => {
.\src\infrastructure\database\services\context-service.test.ts:126:      const oldDate = new Date();
.\src\infrastructure\database\services\context-service.test.ts:288:      const now = new Date();
.\src\infrastructure\database\services\context-service.test.ts:289:      const yesterday = new Date(now);
.\src\infrastructure\database\services\context-service.test.ts:291:      const lastWeek = new Date(now);
.\src\infrastructure\database\services\context-service.test.ts:306:      const now = new Date();
.\src\infrastructure\database\services\context-service.test.ts:307:      const lastWeek = new Date(now);
.\src\infrastructure\database\services\context-service.test.ts:328:      const now = new Date();
.\src\infrastructure\database\services\context-service.test.ts:329:      const lastWeek = new Date(now);
.\src\infrastructure\database\services\context-service.test.ts:417:      const older = new Date("2026-01-01T10:00:00Z");
.\src\infrastructure\database\services\context-service.test.ts:418:      const newer = new Date("2026-01-28T15:30:00Z");
.\src\infrastructure\database\services\context-service.test.ts:462:  beforeEach(() => {
.\src\infrastructure\database\services\context-service.test.ts:468:  afterEach(() => {
.\src\infrastructure\llm\claude-summary-generator.ts:25:      const env = { ...process.env };
.\src\infrastructure\sources\project-name-resolver.test.ts:8:import { describe, expect, test, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\sources\project-name-resolver.test.ts:17:  beforeEach(() => {
.\src\infrastructure\sources\project-name-resolver.test.ts:20:      `resolver-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
.\src\infrastructure\sources\project-name-resolver.test.ts:25:  afterEach(() => {
.\src\presentation\cli\commands\export.test.ts:7:import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\export.test.ts:21:  beforeEach(() => {
.\src\presentation\cli\commands\export.test.ts:50:  afterEach(() => {
.\src\infrastructure\database\services\context-service.ts:120:      const now = new Date();
.\src\infrastructure\database\services\context-service.ts:121:      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
.\src\infrastructure\database\services\context-service.ts:122:      sinceDate = new Date(startOfToday.getTime() - (options.days - 1) * 24 * 60 * 60 * 1000);
.\src\infrastructure\database\services\context-service.ts:242:        ? new Date(aggregateRow.lastActivity)
.\src\infrastructure\llm\claude-summary-generator.test.ts:8:import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
.\src\infrastructure\llm\claude-summary-generator.test.ts:52:  beforeEach(() => {
.\src\infrastructure\llm\claude-summary-generator.test.ts:54:    originalClaudeCode = process.env.CLAUDECODE;
.\src\infrastructure\llm\claude-summary-generator.test.ts:57:  afterEach(() => {
.\src\infrastructure\llm\claude-summary-generator.test.ts:61:      process.env.CLAUDECODE = originalClaudeCode;
.\src\infrastructure\llm\claude-summary-generator.test.ts:63:      delete process.env.CLAUDECODE;
.\src\infrastructure\llm\claude-summary-generator.test.ts:113:    process.env.CLAUDECODE = "1";
.\src\presentation\cli\commands\completion.test.ts:7:import { afterEach, beforeEach, describe, expect, it } from "bun:test";
.\src\presentation\cli\commands\completion.test.ts:25:    beforeEach(() => {
.\src\presentation\cli\commands\completion.test.ts:32:    afterEach(() => {
.\src\infrastructure\database\services\hybrid-search-service.test.ts:13:import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
.\src\infrastructure\database\services\hybrid-search-service.test.ts:57:  const ts = timestamp?.toISOString() ?? new Date().toISOString();
.\src\infrastructure\database\services\hybrid-search-service.test.ts:88:    [rowid, new Date().toISOString(), modelHash, modelName]
.\src\infrastructure\database\services\hybrid-search-service.test.ts:105:    [rowid, new Date().toISOString(), modelHash, modelName]
.\src\infrastructure\database\services\hybrid-search-service.test.ts:171:  beforeEach(() => {
.\src\infrastructure\database\services\hybrid-search-service.test.ts:185:  afterEach(() => {
.\src\infrastructure\database\services\hybrid-search-service.test.ts:428:      const ts = new Date("2024-06-15T10:30:00Z");
.\src\infrastructure\database\services\hybrid-search-service.test.ts:532:      const oldDate = new Date("2020-01-01T00:00:00Z");
.\src\infrastructure\database\services\hybrid-search-service.test.ts:533:      const newDate = new Date();
.\src\infrastructure\database\services\hybrid-search-service.test.ts:571:      const oldDate = new Date("2020-01-01T00:00:00Z");
.\src\infrastructure\database\services\hybrid-search-service.test.ts:572:      const newDate = new Date();
.\src\infrastructure\database\services\hybrid-search-service.test.ts:1020:      const oldDate = new Date("2020-01-01T00:00:00Z");
.\src\infrastructure\database\services\hybrid-search-service.test.ts:1021:      const newDate = new Date();
.\src\infrastructure\database\services\hybrid-search-service.test.ts:1053:      const oldDate = new Date("2020-01-01T00:00:00Z");
.\src\infrastructure\database\services\hybrid-search-service.test.ts:1054:      const newDate = new Date();
.\src\infrastructure\database\services\hybrid-search-service.test.ts:1087:      const oldDate = new Date("2020-01-01T00:00:00Z");
.\src\infrastructure\database\services\hybrid-search-service.test.ts:1088:      const newDate = new Date();
.\src\infrastructure\database\services\hybrid-search-service.test.ts:1123:      const oldDate = new Date("2020-01-01T00:00:00Z");
.\src\infrastructure\database\services\hybrid-search-service.test.ts:1124:      const newDate = new Date();
.\src\infrastructure\database\services\hybrid-search-service.test.ts:1189:      const oldDate = new Date("2020-01-01T00:00:00Z");
.\src\infrastructure\database\services\hybrid-search-service.test.ts:1190:      const newDate = new Date();
.\src\presentation\cli\commands\doctor.ts:102:    const now = Date.now();
.\src\presentation\cli\commands\doctor.ts:134:    const dbPath = getDefaultDbPath();
.\src\presentation\cli\commands\doctor.ts:330:        messages.push(`  2. Delete the database: rm ${getDefaultDbPath()}`);
.\src\presentation\cli\commands\doctor.ts:353:            process.exitCode = result.exitCode;
.\src\presentation\cli\commands\browse.ts:16:import { executeShowCommand, setTestDbPath as setShowTestDbPath } from "./show.js";
.\src\presentation\cli\commands\browse.ts:29: * When set, executeBrowseCommand uses this path instead of getDefaultDbPath().
.\src\presentation\cli\commands\browse.ts:31:let testDbPath: string | null = null;
.\src\presentation\cli\commands\browse.ts:39:export function setTestDbPath(path: string | null): void {
.\src\presentation\cli\commands\browse.ts:42:  setShowTestDbPath(path);
.\src\presentation\cli\commands\browse.ts:56: * Injected so tests can substitute mocks without `mock.module()`,
.\src\presentation\cli\commands\browse.ts:88:      process.exitCode = result.exitCode;
.\src\presentation\cli\commands\browse.ts:117:  const dbPath = testDbPath ?? getDefaultDbPath();
.\src\infrastructure\database\services\hybrid-search-service.ts:286:    const now = new Date();
.\src\infrastructure\database\services\hybrid-search-service.ts:505:          timestamp: new Date(meta.timestamp),
.\src\infrastructure\database\services\hybrid-search-service.ts:671:          timestamp: new Date(meta.timestamp),
.\src\infrastructure\database\services\hybrid-search-service.ts:764:      const msgDate = new Date(meta.timestamp);
.\src\infrastructure\database\services\hybrid-search-service.ts:769:      const msgDate = new Date(meta.timestamp);
.\src\presentation\cli\commands\doctor.test.ts:7:import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from "bun:test";
.\src\presentation\cli\commands\doctor.test.ts:27:    const testDir = join(tmpdir(), `doctor-test-${Date.now()}`);
.\src\presentation\cli\commands\doctor.test.ts:78:    afterEach(() => {
.\src\presentation\cli\commands\doctor.test.ts:126:                lastRun: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
.\src\presentation\cli\commands\doctor.test.ts:278:                lastRun: new Date(),
.\src\application\services\temporal-decay.ts:46:    now: Date = new Date()
.\src\application\services\temporal-decay.ts:94:    now: Date = new Date()
.\src\presentation\cli\commands\browse.test.ts:8: * Why DI instead of mock.module: Bun's mock.module() persists across
.\src\presentation\cli\commands\browse.test.ts:13:import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
.\src\presentation\cli\commands\browse.test.ts:17:  setTestDbPath,
.\src\presentation\cli\commands\browse.test.ts:99:  beforeEach(() => {
.\src\presentation\cli\commands\browse.test.ts:137:    setTestDbPath(dbPath);
.\src\presentation\cli\commands\browse.test.ts:152:  afterEach(() => {
.\src\presentation\cli\commands\browse.test.ts:160:    setTestDbPath(null);
.\src\presentation\cli\formatters\show-formatter.test.ts:34:    startTime: overrides.startTime ?? new Date("2026-01-15T10:00:00Z"),
.\src\presentation\cli\formatters\show-formatter.test.ts:37:      : new Date("2026-01-15T11:30:00Z"),
.\src\presentation\cli\formatters\show-formatter.test.ts:55:    timestamp: overrides.timestamp ?? new Date("2026-01-15T10:05:00Z"),
.\src\presentation\cli\formatters\show-formatter.test.ts:75:    timestamp: overrides.timestamp ?? new Date("2026-01-15T10:06:00Z"),
.\src\presentation\cli\formatters\show-formatter.test.ts:103:        startTime: new Date("2026-01-15T10:00:00Z"),
.\src\presentation\cli\formatters\show-formatter.test.ts:104:        endTime: new Date("2026-01-15T11:30:00Z"),
.\src\presentation\cli\formatters\show-formatter.test.ts:130:          timestamp: new Date("2026-01-15T10:05:00Z"),
.\src\presentation\cli\formatters\show-formatter.test.ts:136:          timestamp: new Date("2026-01-15T10:06:00Z"),
.\src\presentation\cli\formatters\show-formatter.test.ts:142:          timestamp: new Date("2026-01-15T10:07:00Z"),
.\src\presentation\cli\formatters\show-formatter.test.ts:191:        startTime: new Date("2026-01-15T10:00:00Z"),
.\src\application\services\temporal-decay.test.ts:17:    const now = new Date("2026-02-27T12:00:00Z");
.\src\application\services\temporal-decay.test.ts:20:        return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
.\src\application\services\temporal-decay.test.ts:141:    const now = new Date("2026-02-27T12:00:00Z");
.\src\application\services\temporal-decay.test.ts:144:        return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
.\src\infrastructure\parsers\timestamp.ts:27:    const date = new Date(value);
.\src\infrastructure\parsers\timestamp.ts:39:    const date = new Date(ts);
.\src\infrastructure\parsers\timestamp.ts:51:  return new Date().toISOString();
.\src\presentation\cli\formatters\related-formatter.test.ts:29:    startTime: overrides.startTime ?? new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\formatters\related-formatter.test.ts:236:          startTime: new Date("2026-01-30T14:23:45Z"),
.\src\presentation\cli\formatters\related-formatter.test.ts:313:          startTime: new Date("2026-01-30T14:23:45Z"),
.\src\presentation\cli\formatters\related-formatter.test.ts:336:          startTime: new Date("2026-01-30T14:23:45.000Z"),
.\src\application\services\sync-service.ts:135:    const startTime = Date.now();
.\src\application\services\sync-service.ts:205:      startedAt: new Date().toISOString(),
.\src\application\services\sync-service.ts:242:          currentCheckpoint.lastCompletedAt = new Date().toISOString();
.\src\application\services\sync-service.ts:270:    result.durationMs = Date.now() - startTime;
.\src\application\services\sync-service.ts:430:      startedAt: new Date(),
.\src\application\services\sync-service.ts:449:        startTime: firstTimestamp ?? new Date(),
.\src\application\services\sync-service.ts:477:          .complete(new Date());
.\src\application\services\sync-service.ts:519:        const timestamp = new Date(event.data.timestamp);
.\src\application\services\sync-service.ts:534:            timestamp: new Date(event.data.timestamp),
.\src\application\services\sync-service.ts:571:                timestamp: new Date(event.data.timestamp),
.\src\application\services\sync-service.ts:582:            timestamp: new Date(event.data.timestamp),
.\src\application\services\sync-service.ts:594:            timestamp: new Date(event.data.timestamp),
.\src\infrastructure\parsers\timestamp.test.ts:80:      const date = new Date("2026-01-28T10:00:00.000Z");
.\src\infrastructure\parsers\timestamp.test.ts:86:      const date = new Date(1769558400000);
.\src\infrastructure\parsers\timestamp.test.ts:112:      const before = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:114:      const after = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:116:      const resultDate = new Date(result);
.\src\infrastructure\parsers\timestamp.test.ts:122:      const before = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:124:      const after = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:126:      const resultDate = new Date(result);
.\src\infrastructure\parsers\timestamp.test.ts:132:      const before = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:134:      const after = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:136:      const resultDate = new Date(result);
.\src\infrastructure\parsers\timestamp.test.ts:142:      const before = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:144:      const after = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:146:      const resultDate = new Date(result);
.\src\infrastructure\parsers\timestamp.test.ts:152:      const before = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:154:      const after = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:156:      const resultDate = new Date(result);
.\src\infrastructure\parsers\timestamp.test.ts:162:      const before = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:164:      const after = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:166:      const resultDate = new Date(result);
.\src\infrastructure\parsers\timestamp.test.ts:172:      const before = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:174:      const after = new Date();
.\src\infrastructure\parsers\timestamp.test.ts:176:      const resultDate = new Date(result);
.\src\infrastructure\parsers\timestamp.test.ts:195:      const expected = new Date(1000000000000 * 1000).toISOString();
.\src\infrastructure\parsers\timestamp.test.ts:203:      const expected = new Date(999999999999 * 1000).toISOString();
.\src\infrastructure\parsers\timestamp.test.ts:217:      // Actually, NaN * 1000 = NaN, new Date(NaN) = Invalid Date
.\src\presentation\cli\commands\backfill.ts:195:      const dbPath = getDefaultDbPath();
.\src\infrastructure\database\services\search-service.test.ts:13:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\services\search-service.test.ts:53:  const ts = timestamp?.toISOString() ?? new Date().toISOString();
.\src\infrastructure\database\services\search-service.test.ts:71:  beforeEach(() => {
.\src\infrastructure\database\services\search-service.test.ts:86:  afterEach(() => {
.\src\infrastructure\database\services\search-service.test.ts:477:      const oldDate = new Date("2024-01-01T00:00:00Z");
.\src\infrastructure\database\services\search-service.test.ts:478:      const newDate = new Date("2024-06-01T00:00:00Z");
.\src\infrastructure\database\services\search-service.test.ts:479:      const filterDate = new Date("2024-03-01T00:00:00Z");
.\src\infrastructure\database\services\search-service.test.ts:508:      const oldDate = new Date("2024-01-01T00:00:00Z");
.\src\infrastructure\database\services\search-service.test.ts:509:      const newDate = new Date("2024-06-01T00:00:00Z");
.\src\infrastructure\database\services\search-service.test.ts:510:      const filterDate = new Date("2024-03-01T00:00:00Z");
.\src\infrastructure\database\services\search-service.test.ts:539:      const date1 = new Date("2024-01-01T00:00:00Z");
.\src\infrastructure\database\services\search-service.test.ts:540:      const date2 = new Date("2024-03-01T00:00:00Z");
.\src\infrastructure\database\services\search-service.test.ts:541:      const date3 = new Date("2024-06-01T00:00:00Z");
.\src\infrastructure\database\services\search-service.test.ts:570:        sinceDate: new Date("2024-02-01T00:00:00Z"),
.\src\infrastructure\database\services\search-service.test.ts:571:        beforeDate: new Date("2024-05-01T00:00:00Z"),
.\src\infrastructure\database\services\search-service.test.ts:733:      const date1 = new Date("2024-01-01T00:00:00Z");
.\src\infrastructure\database\services\search-service.test.ts:734:      const date2 = new Date("2024-06-01T00:00:00Z");
.\src\infrastructure\database\services\search-service.test.ts:773:        sinceDate: new Date("2024-03-01T00:00:00Z"),
.\src\infrastructure\database\services\search-service.test.ts:942:      const timestamp = new Date("2024-06-15T10:30:00Z");
.\src\presentation\cli\commands\context.ts:107:      process.exitCode = result.exitCode;
.\src\presentation\cli\commands\context.ts:140:  const dbPath = options.dbPath ?? getDefaultDbPath();
.\src\application\services\sync-service.test.ts:8:import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
.\src\application\services\sync-service.test.ts:67:  const timestamp = new Date().toISOString();
.\src\application\services\sync-service.test.ts:114:  beforeEach(() => {
.\src\application\services\sync-service.test.ts:225:  afterEach(() => {
.\src\application\services\sync-service.test.ts:234:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:250:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:273:        createMockSessionInfo("session-1", "C:\\Projects\\test1", new Date(), 1000),
.\src\application\services\sync-service.test.ts:274:        createMockSessionInfo("session-2", "C:\\Projects\\test2", new Date(), 2000),
.\src\application\services\sync-service.test.ts:294:        createMockSessionInfo("session-1", "C:\\Projects\\frontend", new Date(), 1000),
.\src\application\services\sync-service.test.ts:295:        createMockSessionInfo("session-2", "C:\\Projects\\backend", new Date(), 2000),
.\src\application\services\sync-service.test.ts:296:        createMockSessionInfo("session-3", "C:\\Projects\\frontend-app", new Date(), 3000),
.\src\application\services\sync-service.test.ts:315:        createMockSessionInfo("session-1", "C:\\Projects\\frontend", new Date(), 1000),
.\src\application\services\sync-service.test.ts:329:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:330:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
.\src\application\services\sync-service.test.ts:347:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:360:      const mtime = new Date("2024-01-01");
.\src\application\services\sync-service.test.ts:370:        startedAt: new Date(),
.\src\application\services\sync-service.test.ts:389:      const mtime = new Date("2024-01-01T12:00:00Z");
.\src\application\services\sync-service.test.ts:400:        startedAt: new Date(),
.\src\application\services\sync-service.test.ts:412:      const oldMtime = new Date("2024-01-01T12:00:00Z");
.\src\application\services\sync-service.test.ts:413:      const newMtime = new Date("2024-01-02T12:00:00Z");
.\src\application\services\sync-service.test.ts:424:        startedAt: new Date(),
.\src\application\services\sync-service.test.ts:440:      const mtime = new Date("2024-01-01T12:00:00Z");
.\src\application\services\sync-service.test.ts:452:        startedAt: new Date(),
.\src\application\services\sync-service.test.ts:469:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:487:      const mtime = new Date("2024-01-01T12:00:00Z");
.\src\application\services\sync-service.test.ts:497:        startedAt: new Date(),
.\src\application\services\sync-service.test.ts:513:      const mtime = new Date("2024-01-01T12:00:00Z");
.\src\application\services\sync-service.test.ts:523:        startedAt: new Date(),
.\src\application\services\sync-service.test.ts:539:      const mtime = new Date("2024-01-01T12:00:00Z");
.\src\application\services\sync-service.test.ts:549:        startedAt: new Date(),
.\src\application\services\sync-service.test.ts:568:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:569:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
.\src\application\services\sync-service.test.ts:570:        createMockSessionInfo("session-3", "C:\\Projects\\test", new Date(), 3000),
.\src\application\services\sync-service.test.ts:598:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:599:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
.\src\application\services\sync-service.test.ts:628:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:629:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
.\src\application\services\sync-service.test.ts:666:        createMockSessionInfo("session-1", "C:\\Projects\\frontend", new Date(), 1000),
.\src\application\services\sync-service.test.ts:667:        createMockSessionInfo("session-2", "C:\\Projects\\backend", new Date(), 2000),
.\src\application\services\sync-service.test.ts:691:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:695:      const timestamp = new Date().toISOString();
.\src\application\services\sync-service.test.ts:741:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:745:      const timestamp = new Date().toISOString();
.\src\application\services\sync-service.test.ts:790:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:794:      const timestamp = new Date().toISOString();
.\src\application\services\sync-service.test.ts:818:        createMockSessionInfo("session-mc", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:822:      const timestamp = new Date().toISOString();
.\src\application\services\sync-service.test.ts:865:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:866:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
.\src\application\services\sync-service.test.ts:877:        startedAt: new Date().toISOString(),
.\src\application\services\sync-service.test.ts:881:        lastCompletedAt: new Date().toISOString(),
.\src\application\services\sync-service.test.ts:893:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:894:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
.\src\application\services\sync-service.test.ts:912:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:923:        startedAt: new Date().toISOString(),
.\src\application\services\sync-service.test.ts:938:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:939:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
.\src\application\services\sync-service.test.ts:965:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:976:        startedAt: new Date().toISOString(),
.\src\application\services\sync-service.test.ts:993:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:994:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
.\src\application\services\sync-service.test.ts:1016:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:1017:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
.\src\application\services\sync-service.test.ts:1018:        createMockSessionInfo("session-3", "C:\\Projects\\test", new Date(), 3000),
.\src\application\services\sync-service.test.ts:1041:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:1061:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:1079:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:1098:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:1117:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\application\services\sync-service.test.ts:1136:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
.\src\presentation\cli\formatters\output-formatter.test.ts:26:      timestamp: new Date("2026-01-27T14:30:00Z"),
.\src\presentation\cli\formatters\output-formatter.test.ts:34:      timestamp: new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\formatters\output-formatter.test.ts:274:        timestamp: new Date("2026-01-27T14:30:00Z"),
.\src\presentation\cli\formatters\output-formatter.test.ts:365:          timestamp: new Date("2026-01-27T14:30:00Z"),
.\src\presentation\cli\formatters\output-formatter.test.ts:394:        timestamp: new Date("2026-01-27T14:30:00Z"),
.\src\presentation\cli\formatters\output-formatter.test.ts:475:        timestamp: new Date("2026-01-27T14:30:00Z"),
.\src\presentation\cli\formatters\output-formatter.test.ts:497:        timestamp: new Date("2026-01-27T14:30:00Z"),
.\src\presentation\cli\formatters\output-formatter.test.ts:518:        timestamp: new Date("2026-01-27T14:30:00Z"),
.\src\presentation\cli\formatters\output-formatter.test.ts:536:        timestamp: new Date("2026-01-27T14:30:00Z"),
.\src\presentation\cli\formatters\output-formatter.test.ts:561:        timestamp: new Date("2026-01-27T14:30:00Z"),
.\src\presentation\cli\commands\backfill.test.ts:9:import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\backfill.test.ts:18:  beforeEach(() => {
.\src\presentation\cli\commands\backfill.test.ts:23:  afterEach(() => {
.\src\infrastructure\database\services\search-service.ts:110:        timestamp: new Date(row.timestamp),
.\src\presentation\cli\commands\context.test.ts:7:import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\context.test.ts:213:  beforeEach(() => {
.\src\presentation\cli\commands\context.test.ts:222:  afterEach(() => {
.\src\infrastructure\parsers\jsonl-parser.test.ts:17:  const testDir = join(tmpdir(), "jsonl-parser-test-" + Date.now());
.\src\presentation\cli\command-result.ts:5: * instead of mutating process.exitCode directly, keeping handlers
.\src\application\services\sync-service.integration.test.ts:8:import { describe, test, expect, beforeEach, afterEach } from "bun:test";
.\src\application\services\sync-service.integration.test.ts:52:function createMinimalEvents(timestamp: string = new Date().toISOString()): object[] {
.\src\application\services\sync-service.integration.test.ts:56:      uuid: `user-${Date.now()}`,
.\src\application\services\sync-service.integration.test.ts:62:      uuid: `asst-${Date.now()}`,
.\src\application\services\sync-service.integration.test.ts:103:  beforeEach(() => {
.\src\application\services\sync-service.integration.test.ts:105:    tempDir = join(tmpdir(), `sync-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
.\src\application\services\sync-service.integration.test.ts:113:  afterEach(() => {
.\src\application\services\sync-service.integration.test.ts:203:        uuid: `user-new-${Date.now()}`,
.\src\application\services\sync-service.integration.test.ts:205:        timestamp: new Date().toISOString(),
.\src\application\services\sync-service.integration.test.ts:236:        timestamp: new Date().toISOString(),
.\src\application\services\sync-service.integration.test.ts:368:      const timestamp = new Date().toISOString();
.\src\application\services\sync-service.integration.test.ts:396:      const timestamp = new Date().toISOString();
.\src\application\services\sync-service.integration.test.ts:461:          timestamp: new Date().toISOString(),
.\src\infrastructure\database\services\stats-service.test.ts:12:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\services\stats-service.test.ts:85:  beforeEach(() => {
.\src\infrastructure\database\services\stats-service.test.ts:91:  afterEach(() => {
.\src\presentation\cli\commands\completion.ts:494:            process.exitCode = result.exitCode;
.\src\presentation\cli\formatters\list-formatter.test.ts:29:    startTime: overrides.startTime ?? new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\formatters\list-formatter.test.ts:154:        startTime: new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\formatters\list-formatter.test.ts:175:        startTime: new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\formatters\list-formatter.test.ts:176:        endTime: new Date("2026-01-28T11:00:00Z"),
.\src\infrastructure\signals\signal-handler.test.ts:8:import { afterEach, beforeEach, describe, expect, test } from "bun:test";
.\src\infrastructure\signals\signal-handler.test.ts:24:    beforeEach(() => {
.\src\infrastructure\signals\signal-handler.test.ts:28:    afterEach(() => {
.\src\application\services\smart-context-service.ts:128:    const date = new Date(match[1] + "T00:00:00Z");
.\src\application\services\smart-context-service.ts:157:        this.now = deps.now ?? (() => new Date());
.\src\application\services\smart-context-service.ts:280:        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
.\src\infrastructure\signals\checkpoint-manager.test.ts:7:import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
.\src\infrastructure\signals\checkpoint-manager.test.ts:25:    beforeEach(() => {
.\src\infrastructure\signals\checkpoint-manager.test.ts:27:        testDir = join(tmpdir(), `memory-nexus-checkpoint-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
.\src\infrastructure\signals\checkpoint-manager.test.ts:33:    afterEach(() => {
.\src\infrastructure\signals\checkpoint-manager.test.ts:281:                startedAt: new Date().toISOString(),
.\src\infrastructure\signals\checkpoint-manager.test.ts:293:            checkpoint.lastCompletedAt = new Date().toISOString();
.\src\presentation\cli\commands\list.ts:92:      process.exitCode = result.exitCode;
.\src\presentation\cli\commands\list.ts:121:    const now = new Date();
.\src\presentation\cli\commands\list.ts:122:    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
.\src\presentation\cli\commands\list.ts:123:    sinceDate = new Date(startOfToday.getTime() - (options.days - 1) * 24 * 60 * 60 * 1000);
.\src\presentation\cli\commands\list.ts:149:  const dbPath = getDefaultDbPath();
.\src\presentation\cli\commands\search.test.ts:8:import { describe, expect, it, beforeEach, afterEach, spyOn, mock } from "bun:test";
.\src\presentation\cli\commands\search.test.ts:32:  beforeEach(() => {
.\src\presentation\cli\commands\search.test.ts:37:  afterEach(() => {
.\src\presentation\cli\commands\search.test.ts:334:    beforeEach(() => {
.\src\presentation\cli\commands\search.test.ts:341:    afterEach(() => {
.\src\presentation\cli\commands\search.test.ts:392:          startTime: new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\commands\search.test.ts:400:          timestamp: new Date("2026-01-28T10:01:00Z"),
.\src\presentation\cli\commands\search.test.ts:434:          startTime: new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\commands\search.test.ts:441:          timestamp: new Date("2026-01-28T10:02:00Z"),
.\src\presentation\cli\commands\search.test.ts:469:          startTime: new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\commands\search.test.ts:483:            timestamp: new Date(`2026-01-28T10:0${i}:00Z`),
.\src\presentation\cli\commands\search.test.ts:507:          startTime: new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\commands\search.test.ts:514:          timestamp: new Date("2026-01-28T10:01:00Z"),
.\src\presentation\cli\commands\search.test.ts:543:          startTime: new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\commands\search.test.ts:550:          timestamp: new Date("2026-01-28T10:01:00Z"),
.\src\presentation\cli\commands\search.test.ts:557:          timestamp: new Date("2026-01-28T10:02:00Z"),
.\src\presentation\cli\commands\search.test.ts:593:          startTime: new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\commands\search.test.ts:600:          startTime: new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\commands\search.test.ts:614:          timestamp: new Date("2026-01-28T10:01:00Z"),
.\src\presentation\cli\commands\search.test.ts:622:          timestamp: new Date("2026-01-28T10:01:00Z"),
.\src\presentation\cli\commands\search.test.ts:932:      timestamp: new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\commands\search.test.ts:995:        createMockResult("Using <mark>process.env</mark> variable", "m1"),
.\src\presentation\cli\commands\search.test.ts:999:      const filtered = filterCaseSensitive(results, "process.env", 10);
.\src\presentation\cli\commands\search.test.ts:1402:          startTime: new Date("2026-01-28T10:00:00Z"),
.\src\presentation\cli\commands\search.test.ts:1420:            timestamp: new Date(`2026-01-28T10:${String(i % 60).padStart(2, "0")}:00Z`),
.\src\application\services\smart-context-service.test.ts:9:import { describe, expect, test, beforeEach } from "bun:test";
.\src\application\services\smart-context-service.test.ts:42:        lastIndexedAt: overrides.lastIndexedAt ?? new Date(),
.\src\application\services\smart-context-service.test.ts:64:        loggedAt: new Date(),
.\src\application\services\smart-context-service.test.ts:165:    beforeEach(() => {
.\src\application\services\smart-context-service.test.ts:586:                now: () => new Date("2026-03-10T12:00:00Z"),
.\src\presentation\cli\formatters\friction-dashboard.ts:181:        daysOpen: Math.floor((Date.now() - e.loggedAt.getTime()) / 86400000),
.\src\presentation\cli\formatters\friction-dashboard.ts:316:  <div class="generated">Generated ${new Date().toISOString().split("T")[0]}</div>
.\src\presentation\cli\commands\import.ts:58:      process.exitCode = result.exitCode;
.\src\presentation\cli\commands\import.ts:90:  const dbPath = getDefaultDbPath();
.\src\presentation\cli\commands\install.test.ts:8:import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\install.test.ts:41:    beforeEach(() => {
.\src\presentation\cli\commands\install.test.ts:73:    afterEach(() => {
.\src\presentation\cli\commands\install.test.ts:225:            // Override is already set in beforeEach
.\src\presentation\cli\formatters\friction-dashboard.test.ts:45:            loggedAt: new Date(Date.now() - 14 * 86400000),
.\src\presentation\cli\formatters\friction-dashboard.test.ts:54:            loggedAt: new Date(Date.now() - 3 * 86400000),
.\src\presentation\cli\commands\import.test.ts:7:import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\import.test.ts:31:  beforeEach(async () => {
.\src\presentation\cli\commands\import.test.ts:76:  afterEach(() => {
.\src\presentation\cli\formatters\error-formatter.test.ts:5:import { describe, expect, test, beforeEach, afterEach } from "bun:test";
.\src\presentation\cli\commands\list.test.ts:7:import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\list.test.ts:137:  beforeEach(() => {
.\src\presentation\cli\commands\list.test.ts:142:  afterEach(() => {
.\src\presentation\cli\commands\list.test.ts:236:  beforeEach(() => {
.\src\presentation\cli\commands\list.test.ts:241:  afterEach(() => {
.\src\presentation\cli\commands\related.ts:102:      process.exitCode = result.exitCode;
.\src\presentation\cli\commands\related.ts:122:  const dbPath = options.dbPath ?? getDefaultDbPath();
.\src\presentation\cli\formatters\context-formatter.test.ts:32:    lastActivity: new Date("2026-01-30T14:23:45Z"),
.\src\presentation\cli\commands\related.test.ts:7:import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\related.test.ts:220:  beforeEach(() => {
.\src\presentation\cli\commands\related.test.ts:229:  afterEach(() => {
.\src\presentation\cli\commands\install.ts:53:            process.exitCode = result.exitCode;
.\src\presentation\cli\formatters\color.ts:29:  const noColor = options?.noColor ?? !!process.env.NO_COLOR;
.\src\presentation\cli\formatters\color.ts:30:  const forceColor = options?.forceColor ?? !!process.env.FORCE_COLOR;
.\src\presentation\cli\formatters\color.test.ts:7:import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
.\src\presentation\cli\formatters\color.test.ts:19:  const originalNoColor = process.env.NO_COLOR;
.\src\presentation\cli\formatters\color.test.ts:20:  const originalForceColor = process.env.FORCE_COLOR;
.\src\presentation\cli\formatters\color.test.ts:22:  beforeEach(() => {
.\src\presentation\cli\formatters\color.test.ts:24:    delete process.env.NO_COLOR;
.\src\presentation\cli\formatters\color.test.ts:25:    delete process.env.FORCE_COLOR;
.\src\presentation\cli\formatters\color.test.ts:28:  afterEach(() => {
.\src\presentation\cli\formatters\color.test.ts:31:      process.env.NO_COLOR = originalNoColor;
.\src\presentation\cli\formatters\color.test.ts:33:      delete process.env.NO_COLOR;
.\src\presentation\cli\formatters\color.test.ts:36:      process.env.FORCE_COLOR = originalForceColor;
.\src\presentation\cli\formatters\color.test.ts:38:      delete process.env.FORCE_COLOR;
.\src\presentation\cli\formatters\color.test.ts:54:      process.env.NO_COLOR = "1";
.\src\presentation\cli\formatters\color.test.ts:60:      process.env.FORCE_COLOR = "1";
.\src\presentation\cli\formatters\color.test.ts:66:      process.env.NO_COLOR = "1";
.\src\presentation\cli\formatters\color.test.ts:67:      process.env.FORCE_COLOR = "1";
.\src\presentation\cli\commands\purge.ts:23:let testDbPath: string | null = null;
.\src\presentation\cli\commands\purge.ts:30:export function setTestDbPath(path: string | null): void {
.\src\presentation\cli\commands\purge.ts:89:  const now = new Date();
.\src\presentation\cli\commands\purge.ts:94:      cutoffDate = new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
.\src\presentation\cli\commands\purge.ts:97:      cutoffDate = new Date(now.getFullYear(), now.getMonth() - value, now.getDate());
.\src\presentation\cli\commands\purge.ts:100:      cutoffDate = new Date(now.getFullYear() - value, now.getMonth(), now.getDate());
.\src\presentation\cli\commands\purge.ts:178:      process.exitCode = result.exitCode;
.\src\presentation\cli\commands\purge.ts:207:  const dbPath = testDbPath ?? getDefaultDbPath();
.\src\presentation\cli\db-startup.ts:27:  /** Custom database path (defaults to getDefaultDbPath()) */
.\src\presentation\cli\db-startup.ts:76:  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
.\src\presentation\cli\db-startup.ts:174:  const dbPath = options.dbPath ?? getDefaultDbPath();
.\src\presentation\cli\commands\purge.test.ts:7:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\presentation\cli\commands\purge.test.ts:15:  setTestDbPath,
.\src\presentation\cli\commands\purge.test.ts:96:      const now = new Date();
.\src\presentation\cli\commands\purge.test.ts:97:      const expected = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
.\src\presentation\cli\commands\purge.test.ts:105:      const now = new Date();
.\src\presentation\cli\commands\purge.test.ts:106:      const expected = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
.\src\presentation\cli\commands\purge.test.ts:113:      const now = new Date();
.\src\presentation\cli\commands\purge.test.ts:114:      const expected = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
.\src\presentation\cli\commands\purge.test.ts:123:      const now = new Date();
.\src\presentation\cli\commands\purge.test.ts:124:      const expected = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
.\src\presentation\cli\commands\purge.test.ts:132:      const now = new Date();
.\src\presentation\cli\commands\purge.test.ts:133:      const expected = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
.\src\presentation\cli\commands\purge.test.ts:142:      const now = new Date();
.\src\presentation\cli\commands\purge.test.ts:143:      const expected = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
.\src\presentation\cli\commands\purge.test.ts:150:      const now = new Date();
.\src\presentation\cli\commands\purge.test.ts:151:      const expected = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
.\src\presentation\cli\commands\purge.test.ts:160:      const now = new Date();
.\src\presentation\cli\commands\purge.test.ts:161:      const expected = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
.\src\presentation\cli\commands\purge.test.ts:168:      const now = new Date();
.\src\presentation\cli\commands\purge.test.ts:169:      const expected = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
.\src\presentation\cli\commands\purge.test.ts:176:      const now = new Date();
.\src\presentation\cli\commands\purge.test.ts:177:      const expected = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
.\src\presentation\cli\commands\purge.test.ts:216:  let testDbPath: string;
.\src\presentation\cli\commands\purge.test.ts:232:      startTime: new Date(updatedAt),
.\src\presentation\cli\commands\purge.test.ts:239:  beforeEach(() => {
.\src\presentation\cli\commands\purge.test.ts:241:    testDir = path.join(os.tmpdir(), `purge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
.\src\presentation\cli\commands\purge.test.ts:244:    setTestDbPath(testDbPath);
.\src\presentation\cli\commands\purge.test.ts:266:  afterEach(() => {
.\src\presentation\cli\commands\purge.test.ts:272:    setTestDbPath(null);
.\src\presentation\cli\commands\search.ts:170:      process.exitCode = result.exitCode;
.\src\presentation\cli\commands\search.ts:206:  const dbPath = options.dbPath ?? getDefaultDbPath();
.\src\presentation\cli\commands\search.ts:252:      const now = new Date();
.\src\presentation\cli\commands\search.ts:253:      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
.\src\presentation\cli\commands\search.ts:254:      sinceDate = new Date(startOfToday.getTime() - (options.days - 1) * 24 * 60 * 60 * 1000);
.\src\infrastructure\migration.test.ts:7:import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
.\src\infrastructure\migration.test.ts:43:    beforeEach(() => {
.\src\infrastructure\migration.test.ts:51:        originalHome = process.env.HOME;
.\src\infrastructure\migration.test.ts:52:        process.env.HOME = testDir;
.\src\infrastructure\migration.test.ts:53:        process.env.USERPROFILE = testDir;
.\src\infrastructure\migration.test.ts:59:    afterEach(() => {
.\src\infrastructure\migration.test.ts:62:            process.env.HOME = originalHome;
.\src\infrastructure\migration.test.ts:63:            process.env.USERPROFILE = originalHome;
.\src\presentation\cli\commands\show.ts:33: * When set, executeShowCommand uses this path instead of getDefaultDbPath().
.\src\presentation\cli\commands\show.ts:35:let testDbPath: string | null = null;
.\src\presentation\cli\commands\show.ts:43:export function setTestDbPath(path: string | null): void {
.\src\presentation\cli\commands\show.ts:87:      process.exitCode = result.exitCode;
.\src\presentation\cli\commands\show.ts:149:  const dbPath = testDbPath ?? getDefaultDbPath();
.\src\presentation\cli\commands\show.test.ts:7:import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\show.test.ts:8:import { createShowCommand, executeShowCommand, setTestDbPath } from "./show.js";
.\src\presentation\cli\commands\show.test.ts:27:const TEST_DIR = path.join(os.tmpdir(), `memory-nexus-show-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
.\src\presentation\cli\commands\show.test.ts:63:    startTime: new Date("2026-01-15T10:00:00Z"),
.\src\presentation\cli\commands\show.test.ts:64:    endTime: new Date("2026-01-15T11:30:00Z"),
.\src\presentation\cli\commands\show.test.ts:72:      timestamp: new Date("2026-01-15T10:05:00Z"),
.\src\presentation\cli\commands\show.test.ts:78:      timestamp: new Date("2026-01-15T10:06:00Z"),
.\src\presentation\cli\commands\show.test.ts:85:      timestamp: new Date("2026-01-15T10:07:00Z"),
.\src\presentation\cli\commands\show.test.ts:93:    timestamp: new Date("2026-01-15T10:06:30Z"),
.\src\presentation\cli\commands\show.test.ts:105:    setTestDbPath(TEST_DB_PATH);
.\src\presentation\cli\commands\show.test.ts:117:    setTestDbPath(null);
.\src\presentation\cli\commands\show.test.ts:129:  afterEach(() => {
.\src\presentation\cli\commands\show.test.ts:299:        startTime: new Date("2026-01-16T10:00:00Z"),
.\src\presentation\cli\commands\show.test.ts:300:        endTime: new Date("2026-01-16T11:00:00Z"),
.\src\presentation\cli\commands\stats.ts:78:      process.exitCode = result.exitCode;
.\src\presentation\cli\commands\stats.ts:97:  const dbPath = getDefaultDbPath();
.\src\presentation\cli\commands\status.ts:30:let testDbPath: string | null = null;
.\src\presentation\cli\commands\status.ts:37:export function setTestDbPath(path: string | null): void {
.\src\presentation\cli\commands\status.ts:94:            process.exitCode = result.exitCode;
.\src\presentation\cli\commands\status.ts:140:    const dbPath = options.dbPath ?? testDbPath ?? getDefaultDbPath();
.\src\presentation\cli\commands\status.ts:279:    const diff = Date.now() - new Date(isoTimestamp).getTime();
.\src\infrastructure\hooks\config-manager.test.ts:7:import { describe, expect, test, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\hooks\config-manager.test.ts:35:    beforeEach(() => {
.\src\infrastructure\hooks\config-manager.test.ts:39:            `config-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
.\src\infrastructure\hooks\config-manager.test.ts:44:        originalHome = process.env.HOME ?? "";
.\src\infrastructure\hooks\config-manager.test.ts:45:        process.env.HOME = testDir;
.\src\infrastructure\hooks\config-manager.test.ts:47:        process.env.USERPROFILE = testDir;
.\src\infrastructure\hooks\config-manager.test.ts:50:    afterEach(() => {
.\src\infrastructure\hooks\config-manager.test.ts:52:        process.env.HOME = originalHome;
.\src\infrastructure\hooks\config-manager.test.ts:53:        process.env.USERPROFILE = originalHome;
.\src\infrastructure\database\repositories\friction-repository.ts:145:        ).run(resolution, new Date().toISOString(), id);
.\src\infrastructure\database\repositories\friction-repository.ts:250:        const now = new Date();
.\src\infrastructure\database\repositories\friction-repository.ts:252:            const d = new Date(now);
.\src\infrastructure\database\repositories\friction-repository.ts:257:            const janFirst = new Date(year, 0, 1);
.\src\infrastructure\database\repositories\friction-repository.ts:271:        `).all(new Date(now.getTime() - weeks * 7 * 86400000).toISOString());
.\src\infrastructure\database\repositories\friction-repository.ts:282:        `).all(new Date(now.getTime() - weeks * 7 * 86400000).toISOString());
.\src\infrastructure\database\repositories\friction-repository.ts:346:            lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : undefined,
.\src\infrastructure\database\repositories\friction-repository.ts:349:            loggedAt: new Date(row.logged_at),
.\src\infrastructure\database\repositories\friction-repository.ts:350:            resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
.\src\presentation\cli\commands\status.test.ts:8:import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\status.test.ts:22:    setTestDbPath,
.\src\presentation\cli\commands\status.test.ts:63:    beforeEach(() => {
.\src\presentation\cli\commands\status.test.ts:78:        setTestDbPath(testDbPath);
.\src\presentation\cli\commands\status.test.ts:87:    afterEach(() => {
.\src\presentation\cli\commands\status.test.ts:92:        setTestDbPath(null);
.\src\presentation\cli\commands\status.test.ts:156:            // Uses test database path via setTestDbPath override
.\src\presentation\cli\commands\status.test.ts:164:            const isolatedDir = join(tmpdir(), `memory-status-embed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
.\src\presentation\cli\commands\status.test.ts:173:                startedAt: new Date().toISOString(),
.\src\presentation\cli\commands\status.test.ts:179:            setTestDbPath(embeddingTestDb);
.\src\presentation\cli\commands\status.test.ts:216:                setTestDbPath(testDbPath); // Restore original test DB path
.\src\presentation\cli\commands\status.test.ts:405:            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
.\src\presentation\cli\commands\status.test.ts:470:            const now = new Date().toISOString();
.\src\presentation\cli\commands\status.test.ts:475:            const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
.\src\presentation\cli\commands\status.test.ts:480:            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
.\src\presentation\cli\commands\status.test.ts:485:            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
.\src\presentation\cli\commands\uninstall.test.ts:8:import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\uninstall.test.ts:34:    beforeEach(() => {
.\src\presentation\cli\commands\uninstall.test.ts:55:    afterEach(() => {
.\src\infrastructure\hooks\auto-memory-writer.test.ts:8:import { describe, expect, test, afterEach } from "bun:test";
.\src\infrastructure\hooks\auto-memory-writer.test.ts:24:            `auto-memory-writer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
.\src\infrastructure\hooks\auto-memory-writer.test.ts:30:    afterEach(() => {
.\src\infrastructure\database\repositories\friction-repository.test.ts:8:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\repositories\friction-repository.test.ts:18:    beforeEach(() => {
.\src\infrastructure\database\repositories\friction-repository.test.ts:25:    afterEach(() => {
.\src\infrastructure\database\repositories\friction-repository.test.ts:47:            loggedAt: new Date("2026-03-08T10:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:80:                loggedAt: new Date("2026-03-01T08:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:81:                resolvedAt: new Date("2026-03-05T14:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:115:                resolvedAt: new Date(),
.\src\infrastructure\database\repositories\friction-repository.test.ts:128:                loggedAt: new Date("2026-03-01T00:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:132:                loggedAt: new Date("2026-03-08T00:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:142:        beforeEach(async () => {
.\src\infrastructure\database\repositories\friction-repository.test.ts:148:                resolvedAt: new Date(),
.\src\infrastructure\database\repositories\friction-repository.test.ts:224:                loggedAt: new Date("2026-03-01T00:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:225:                resolvedAt: new Date("2026-03-04T00:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:232:                resolvedAt: new Date(),
.\src\infrastructure\database\repositories\friction-repository.test.ts:263:                loggedAt: new Date("2026-03-01T00:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:264:                resolvedAt: new Date("2026-03-04T00:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:271:                loggedAt: new Date("2026-03-01T00:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:272:                resolvedAt: new Date("2026-03-08T00:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:284:                loggedAt: new Date("2026-03-08T00:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:288:                loggedAt: new Date("2026-02-01T00:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:303:                loggedAt: new Date("2026-03-01T00:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:307:                loggedAt: new Date("2026-03-08T00:00:00Z"),
.\src\infrastructure\database\repositories\friction-repository.test.ts:322:            const today = new Date();
.\src\domain\services\content-extractor.ts:134:    const date = new Date(data.timestamp);
.\src\infrastructure\database\repositories\tool-use-repository.ts:186:            timestamp: new Date(row.timestamp),
.\src\presentation\cli\commands\uninstall.ts:37:            process.exitCode = result.exitCode;
.\src\domain\services\content-extractor.test.ts:243:      expect(result).toEqual(new Date("2024-01-15T10:30:00Z"));
.\src\infrastructure\database\repositories\extraction-state-repository.ts:92:      startedAt: new Date(row.started_at),
.\src\infrastructure\database\repositories\extraction-state-repository.ts:94:      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
.\src\infrastructure\database\repositories\extraction-state-repository.ts:97:      fileMtime: row.file_mtime ? new Date(row.file_mtime) : undefined,
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:12:import { describe, expect, it, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:23:    beforeEach(() => {
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:30:    afterEach(() => {
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:49:            timestamp: overrides?.timestamp ?? new Date("2026-01-15T10:30:00Z"),
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:82:            const timestamp = new Date("2026-01-15T10:30:45.123Z");
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:198:                    timestamp: new Date("2026-01-15T10:32:00Z"),
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:203:                    timestamp: new Date("2026-01-15T10:30:00Z"),
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:208:                    timestamp: new Date("2026-01-15T10:31:00Z"),
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:301:                    timestamp: new Date(),
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:313:                    timestamp: new Date(Date.now() + i * 1000),
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:333:                    timestamp: new Date(Date.now() + i * 100),
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:352:                    timestamp: new Date(Date.now() + i * 100),
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:380:                    timestamp: new Date(Date.now() + i * 1000),
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:393:                        timestamp: new Date(Date.now() + (i + 10) * 1000),
.\src\infrastructure\database\repositories\tool-use-repository.test.ts:413:                    timestamp: new Date(Date.now() + i * 10),
.\src\infrastructure\hooks\hook-runner.ts:116:        env: { ...process.env, MEMORY_HOOK: "1" },
.\src\infrastructure\hooks\hook-runner.ts:246:    return process.env.MEMORY_HOOK === "1";
.\src\presentation\cli\commands\sync\background.test.ts:66:          startedAt: new Date().toISOString(),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:8:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:18:  beforeEach(() => {
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:25:  afterEach(() => {
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:50:      startedAt: overrides.startedAt ?? new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:65:        startedAt: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:82:        completedAt: new Date("2026-01-28T11:30:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:220:        completedAt: new Date(),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:247:        startedAt: new Date("2026-01-28T12:00:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:253:        startedAt: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:259:        startedAt: new Date("2026-01-28T11:00:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:300:        .complete(new Date("2026-01-28T11:00:00Z"));
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:347:        startedAt: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:373:        startedAt: new Date("2026-01-28T12:00:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:375:        completedAt: new Date("2026-01-28T12:30:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:402:        startedAt: new Date("2026-01-29T10:00:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:416:      const fileMtime = new Date("2026-01-28T09:00:00Z");
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:448:      const fileMtime = new Date("2026-01-28T08:30:00Z");
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:465:      const initialMtime = new Date("2026-01-28T08:00:00Z");
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:476:      const newMtime = new Date("2026-01-28T12:00:00Z");
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:480:        startedAt: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:482:        completedAt: new Date("2026-01-28T12:30:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:495:      const fileMtime = new Date("2026-01-28T07:00:00Z");
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:516:        fileMtime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\extraction-state-repository.test.ts:531:        fileMtime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.ts:119:      startTime: new Date(row.start_time),
.\src\infrastructure\database\repositories\session-repository.ts:120:      endTime: row.end_time ? new Date(row.end_time) : undefined,
.\src\infrastructure\database\repositories\entity-repository.ts:331:      createdAt: new Date(row.created_at),
.\src\infrastructure\external\qmd-runner.test.ts:9:import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
.\src\infrastructure\external\qmd-runner.test.ts:38:  beforeEach(() => {
.\src\infrastructure\external\qmd-runner.test.ts:42:  afterEach(() => {
.\src\infrastructure\external\qmd-runner.test.ts:223:  afterEach(() => {
.\src\infrastructure\hooks\hook-runner.test.ts:9:import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
.\src\infrastructure\hooks\hook-runner.test.ts:34:    beforeEach(() => {
.\src\infrastructure\hooks\hook-runner.test.ts:318:        beforeEach(() => {
.\src\infrastructure\hooks\hook-runner.test.ts:322:                `.memory-nexus-test-hook-extract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
.\src\infrastructure\hooks\hook-runner.test.ts:331:        afterEach(() => {
.\src\infrastructure\hooks\hook-runner.test.ts:363:                startTime: new Date(),
.\src\infrastructure\hooks\hook-runner.test.ts:373:                timestamp: new Date(),
.\src\infrastructure\hooks\hook-runner.test.ts:392:                startTime: new Date(),
.\src\infrastructure\hooks\hook-runner.test.ts:401:                timestamp: new Date(),
.\src\infrastructure\hooks\hook-runner.test.ts:419:                startTime: new Date(),
.\src\infrastructure\hooks\hook-runner.test.ts:428:                timestamp: new Date(),
.\src\infrastructure\hooks\hook-runner.test.ts:445:                startTime: new Date(),
.\src\infrastructure\hooks\hook-runner.test.ts:462:                startTime: new Date(),
.\src\infrastructure\hooks\hook-runner.test.ts:471:                timestamp: new Date(),
.\src\infrastructure\hooks\hook-runner.test.ts:484:        const originalEnv = process.env.MEMORY_HOOK;
.\src\infrastructure\hooks\hook-runner.test.ts:486:        afterEach(() => {
.\src\infrastructure\hooks\hook-runner.test.ts:489:                delete process.env.MEMORY_HOOK;
.\src\infrastructure\hooks\hook-runner.test.ts:491:                process.env.MEMORY_HOOK = originalEnv;
.\src\infrastructure\hooks\hook-runner.test.ts:496:            process.env.MEMORY_HOOK = "1";
.\src\infrastructure\hooks\hook-runner.test.ts:501:            delete process.env.MEMORY_HOOK;
.\src\infrastructure\hooks\hook-runner.test.ts:506:            process.env.MEMORY_HOOK = "0";
.\src\infrastructure\hooks\hook-runner.test.ts:511:            process.env.MEMORY_HOOK = "";
.\src\presentation\cli\commands\sync\embedding-pass.test.ts:7:import { describe, expect, it, afterEach, spyOn, mock } from "bun:test";
.\src\presentation\cli\commands\sync\embedding-pass.test.ts:776:  afterEach(() => {
.\src\presentation\cli\commands\sync\embedding-pass.test.ts:926:  afterEach(() => {
.\src\presentation\cli\commands\sync\embedding-pass.test.ts:941:    mock.module("node:readline", () => ({
.\src\presentation\cli\commands\sync\embedding-pass.test.ts:971:    mock.module("node:readline", () => ({
.\src\presentation\cli\commands\sync\embedding-pass.test.ts:1001:    mock.module("node:readline", () => ({
.\src\infrastructure\hooks\settings-manager.test.ts:8:import { describe, test, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\hooks\settings-manager.test.ts:39:    beforeEach(() => {
.\src\infrastructure\hooks\settings-manager.test.ts:54:    afterEach(() => {
.\src\infrastructure\hooks\sync-hook-script.test.ts:14:import { describe, test, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\hooks\sync-hook-script.test.ts:38:                ...process.env,
.\src\infrastructure\hooks\sync-hook-script.test.ts:74:    beforeEach(() => {
.\src\infrastructure\hooks\sync-hook-script.test.ts:77:            `sync-hook-script-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
.\src\infrastructure\hooks\sync-hook-script.test.ts:83:    afterEach(() => {
.\src\presentation\cli\commands\sync\helpers.ts:127:  const duration = Date.now() - startTime;
.\src\infrastructure\database\repositories\session-repository.test.ts:8:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\repositories\session-repository.test.ts:19:  beforeEach(() => {
.\src\infrastructure\database\repositories\session-repository.test.ts:26:  afterEach(() => {
.\src\infrastructure\database\repositories\session-repository.test.ts:42:      startTime: overrides.startTime ?? new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:51:        startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:66:        startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:67:        endTime: new Date("2026-01-28T11:30:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:92:        startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:97:        startTime: new Date("2026-01-28T11:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:102:        startTime: new Date("2026-01-28T12:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:124:        startTime: new Date("2026-01-27T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:129:        startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:134:        startTime: new Date("2026-01-27T18:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:161:          startTime: new Date("2026-01-25T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:165:          startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:169:          startTime: new Date("2026-01-26T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:189:          startTime: new Date(`2026-01-2${i}T10:00:00Z`),
.\src\infrastructure\database\repositories\session-repository.test.ts:212:            startTime: new Date(`2026-01-${String(i + 10).padStart(2, "0")}T10:00:00Z`),
.\src\infrastructure\database\repositories\session-repository.test.ts:242:            startTime: new Date(Date.now() - i * 1000),
.\src\infrastructure\database\repositories\session-repository.test.ts:281:        startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:302:        startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:308:        startTime: new Date("2026-01-29T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:379:          startTime: new Date("2026-01-25T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:383:          startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:403:          startTime: new Date(Date.now() - i * 1000),
.\src\infrastructure\database\repositories\session-repository.test.ts:432:        startTime: new Date("2026-01-20T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:436:        startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:443:        sinceDate: new Date("2026-01-25T00:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:453:        startTime: new Date("2026-01-20T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:457:        startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:464:        beforeDate: new Date("2026-01-25T00:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:473:        createTestSession({ id: "s1", startTime: new Date("2026-01-15T10:00:00Z") }),
.\src\infrastructure\database\repositories\session-repository.test.ts:474:        createTestSession({ id: "s2", startTime: new Date("2026-01-20T10:00:00Z") }),
.\src\infrastructure\database\repositories\session-repository.test.ts:475:        createTestSession({ id: "s3", startTime: new Date("2026-01-25T10:00:00Z") }),
.\src\infrastructure\database\repositories\session-repository.test.ts:476:        createTestSession({ id: "s4", startTime: new Date("2026-01-30T10:00:00Z") }),
.\src\infrastructure\database\repositories\session-repository.test.ts:484:        sinceDate: new Date("2026-01-18T00:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:485:        beforeDate: new Date("2026-01-27T00:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:500:        startTime: new Date("2026-01-20T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:505:        startTime: new Date("2026-01-25T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:510:        startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:515:        sinceDate: new Date("2026-01-22T00:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:525:        startTime: new Date("2026-01-20T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:540:          startTime: new Date(Date.now() - i * 1000),
.\src\infrastructure\database\repositories\session-repository.test.ts:587:        startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:588:        endTime: new Date("2026-01-28T11:30:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:691:          startTime: new Date("2026-01-10T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:702:          startTime: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:711:        const cutoffDate = new Date("2026-01-20T00:00:00Z");
.\src\infrastructure\database\repositories\session-repository.test.ts:726:        const cutoffDate = new Date("2026-01-01T00:00:00Z");
.\src\infrastructure\database\repositories\session-repository.test.ts:746:        const cutoffDate = new Date("2026-01-30T00:00:00Z");
.\src\infrastructure\database\repositories\session-repository.test.ts:776:        const cutoffDate = new Date("2026-01-20T00:00:00Z");
.\src\infrastructure\database\repositories\session-repository.test.ts:789:        const cutoffDate = new Date("2026-01-01T00:00:00Z");
.\src\infrastructure\database\repositories\session-repository.test.ts:796:        const cutoffDate = new Date("2026-01-30T00:00:00Z");
.\src\infrastructure\database\repositories\session-repository.test.ts:823:        const cutoffDate = new Date("2026-01-20T00:00:00Z");
.\src\infrastructure\database\repositories\session-repository.test.ts:848:        const cutoffDate = new Date("2026-01-01T00:00:00Z");
.\src\infrastructure\database\repositories\session-repository.test.ts:878:        const cutoffDate = new Date("2026-01-20T00:00:00Z");
.\src\infrastructure\database\repositories\session-repository.test.ts:908:        const cutoffDate = new Date("2026-01-20T00:00:00Z");
.\src\infrastructure\database\repositories\session-repository.test.ts:940:        const cutoffDate = new Date("2026-01-20T00:00:00Z");
.\src\infrastructure\database\repositories\session-repository.test.ts:966:        startTime: new Date("2026-01-28T11:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:1017:        startTime: new Date("2026-01-28T11:00:00Z"),
.\src\infrastructure\database\repositories\session-repository.test.ts:1200:          startTime: new Date(Date.now() - i * 1000),
.\src\infrastructure\database\repositories\backfill-state-repository.test.ts:8:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\repositories\backfill-state-repository.test.ts:18:    beforeEach(() => {
.\src\infrastructure\database\repositories\backfill-state-repository.test.ts:25:    afterEach(() => {
.\src\infrastructure\database\repositories\backfill-state-repository.test.ts:38:            backfilledAt: new Date("2026-03-08T10:00:00Z"),
.\src\infrastructure\database\repositories\backfill-state-repository.test.ts:94:                backfilledAt: new Date("2026-03-08T12:00:00Z"),
.\src\infrastructure\database\repositories\backfill-state-repository.test.ts:121:                backfilledAt: new Date("2026-03-01T08:00:00Z"),
.\src\infrastructure\database\repositories\entity-repository.test.ts:8:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\repositories\entity-repository.test.ts:18:  beforeEach(() => {
.\src\infrastructure\database\repositories\entity-repository.test.ts:25:  afterEach(() => {
.\src\infrastructure\database\repositories\entity-repository.test.ts:199:    beforeEach(() => {
.\src\infrastructure\database\repositories\entity-repository.test.ts:204:        ["session-1", "C--Users-test", "C:\\Users\\test", "test", new Date().toISOString()]
.\src\infrastructure\database\repositories\entity-repository.test.ts:239:    beforeEach(async () => {
.\src\infrastructure\database\repositories\entity-repository.test.ts:293:    beforeEach(() => {
.\src\infrastructure\database\repositories\entity-repository.test.ts:298:        ["session-1", "C--Users-test", "C:\\Users\\test", "test", new Date().toISOString()]
.\src\infrastructure\database\repositories\entity-repository.test.ts:460:    beforeEach(() => {
.\src\infrastructure\database\repositories\entity-repository.test.ts:465:        ["session-del", "C--Users-test", "C:\\Users\\test", "test", new Date().toISOString()]
.\src\infrastructure\database\repositories\backfill-state-repository.ts:81:            backfilledAt: new Date(row.backfilled_at),
.\src\infrastructure\database\repositories\message-repository.ts:202:            timestamp: new Date(row.timestamp),
.\src\infrastructure\database\repositories\embedding-repository.test.ts:9:import { describe, expect, test, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\repositories\embedding-repository.test.ts:57:    beforeEach(() => {
.\src\infrastructure\database\repositories\embedding-repository.test.ts:64:    afterEach(() => {
.\src\infrastructure\database\repositories\embedding-repository.test.ts:102:            const now = new Date().toISOString();
.\src\infrastructure\database\repositories\embedding-repository.test.ts:118:            const now = new Date().toISOString();
.\src\infrastructure\database\repositories\embedding-repository.test.ts:160:            expect(() => new Date(stateRow.embedded_at)).not.toThrow();
.\src\infrastructure\database\repositories\embedding-repository.test.ts:161:            expect(new Date(stateRow.embedded_at).toISOString()).toBe(stateRow.embedded_at);
.\src\infrastructure\database\repositories\embedding-repository.test.ts:257:                ).run(rowids[0], new Date().toISOString());
.\src\infrastructure\database\repositories\embedding-repository.test.ts:277:            const now = new Date().toISOString();
.\src\infrastructure\database\repositories\embedding-repository.test.ts:300:            ).run(rowids[0], new Date().toISOString());
.\src\infrastructure\database\repositories\embedding-repository.test.ts:310:            ).run(rowids[0], new Date().toISOString());
.\src\infrastructure\database\repositories\embedding-repository.test.ts:320:            const now = new Date().toISOString();
.\src\infrastructure\database\repositories\embedding-repository.test.ts:372:            const now = new Date().toISOString();
.\src\infrastructure\database\repositories\embedding-repository.ts:79:            const now = new Date().toISOString();
.\src\infrastructure\database\repositories\message-repository.test.ts:7:import { describe, test, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\repositories\message-repository.test.ts:41:        timestamp: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\message-repository.test.ts:54:    beforeEach(() => {
.\src\infrastructure\database\repositories\message-repository.test.ts:63:    afterEach(() => {
.\src\infrastructure\database\repositories\message-repository.test.ts:91:                timestamp: new Date("2026-01-28T10:00:00Z"),
.\src\infrastructure\database\repositories\message-repository.test.ts:97:                timestamp: new Date("2026-01-28T10:01:00Z"),
.\src\infrastructure\database\repositories\message-repository.test.ts:103:                timestamp: new Date("2026-01-28T10:02:00Z"),
.\src\infrastructure\database\repositories\message-repository.test.ts:176:            const timestamp = new Date("2026-01-28T15:30:45.123Z");
.\src\infrastructure\database\repositories\memory-file-repository.test.ts:8:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\repositories\memory-file-repository.test.ts:31:        lastIndexedAt: overrides.lastIndexedAt ?? new Date("2026-03-08T10:00:00Z"),
.\src\infrastructure\database\repositories\memory-file-repository.test.ts:41:    beforeEach(() => {
.\src\infrastructure\database\repositories\memory-file-repository.test.ts:48:    afterEach(() => {
.\src\infrastructure\database\repositories\memory-file-repository.test.ts:265:                    lastIndexedAt: new Date("2026-03-08T10:00:00Z"),
.\src\infrastructure\database\repositories\memory-file-repository.test.ts:273:                    lastIndexedAt: new Date("2026-03-07T10:00:00Z"),
.\src\infrastructure\database\repositories\memory-file-repository.test.ts:401:                    lastIndexedAt: new Date("2026-03-01T10:00:00Z"),
.\src\infrastructure\database\repositories\memory-file-repository.test.ts:409:                    lastIndexedAt: new Date("2026-03-08T10:00:00Z"),
.\src\presentation\cli\commands\friction\dashboard.test.ts:7:import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\friction\dashboard.test.ts:14:    beforeEach(() => {
.\src\presentation\cli\commands\friction\dashboard.test.ts:19:    afterEach(() => {
.\src\infrastructure\database\repositories\memory-file-repository.ts:165:            lastIndexedAt: new Date(row.last_indexed_at),
.\src\infrastructure\database\repositories\memory-file-repository.ts:166:            createdAt: new Date(row.created_at),
.\src\infrastructure\database\repositories\link-repository.test.ts:8:import { describe, it, expect, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\database\repositories\link-repository.test.ts:18:  beforeEach(() => {
.\src\infrastructure\database\repositories\link-repository.test.ts:25:  afterEach(() => {
.\src\presentation\cli\commands\stats.test.ts:8:import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\stats.test.ts:22:  beforeEach(() => {
.\src\presentation\cli\commands\stats.test.ts:27:  afterEach(() => {
.\src\presentation\cli\commands\export.ts:51:      process.exitCode = result.exitCode;
.\src\presentation\cli\commands\export.ts:77:  const dbPath = getDefaultDbPath();
.\src\presentation\cli\commands\sync\index.ts:40:      process.exitCode = result.exitCode;
.\src\presentation\cli\commands\sync\index.ts:51:  const startTime = Date.now();
.\src\presentation\cli\commands\sync\index.ts:64:  const dbPath = getDefaultDbPath();
.\src\presentation\cli\commands\sync\index.ts:135:      const isBackground = process.env.MEMORY_EMBED_BACKGROUND === "1";
.\src\domain\entities\backfill-state.test.ts:16:                backfilledAt: new Date("2026-03-08T10:00:00Z"),
.\src\domain\entities\backfill-state.test.ts:31:                backfilledAt: new Date("2026-03-08T11:00:00Z"),
.\src\domain\entities\backfill-state.test.ts:49:                backfilledAt: new Date(),
.\src\domain\entities\backfill-state.test.ts:59:                backfilledAt: new Date(),
.\src\domain\entities\backfill-state.test.ts:72:                    backfilledAt: new Date(),
.\src\domain\entities\backfill-state.test.ts:82:                    backfilledAt: new Date(),
.\src\domain\entities\backfill-state.test.ts:92:                    backfilledAt: new Date(),
.\src\domain\entities\backfill-state.test.ts:102:                    backfilledAt: new Date(),
.\src\domain\entities\backfill-state.test.ts:111:            const backfilledAt = new Date("2026-03-08T10:00:00Z");
.\src\domain\entities\backfill-state.test.ts:127:            const backfilledAt = new Date("2026-03-08T10:00:00Z");
.\src\domain\entities\backfill-state.test.ts:149:                backfilledAt: new Date(),
.\src\domain\entities\backfill-state.test.ts:160:                backfilledAt: new Date(),
.\src\infrastructure\hooks\log-writer.test.ts:7:import { describe, expect, test, beforeEach, afterEach } from "bun:test";
.\src\infrastructure\hooks\log-writer.test.ts:26:    beforeEach(() => {
.\src\infrastructure\hooks\log-writer.test.ts:30:            `log-writer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
.\src\infrastructure\hooks\log-writer.test.ts:35:        originalHome = process.env.HOME ?? "";
.\src\infrastructure\hooks\log-writer.test.ts:36:        process.env.HOME = testDir;
.\src\infrastructure\hooks\log-writer.test.ts:37:        process.env.USERPROFILE = testDir;
.\src\infrastructure\hooks\log-writer.test.ts:40:    afterEach(() => {
.\src\infrastructure\hooks\log-writer.test.ts:42:        process.env.HOME = originalHome;
.\src\infrastructure\hooks\log-writer.test.ts:43:        process.env.USERPROFILE = originalHome;
.\src\infrastructure\hooks\log-writer.test.ts:196:            const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
.\src\infrastructure\hooks\log-writer.test.ts:206:            const today = new Date().toISOString().split("T")[0];
.\src\infrastructure\hooks\log-writer.test.ts:225:            const today = new Date().toISOString().split("T")[0];
.\src\infrastructure\hooks\log-writer.test.ts:248:            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
.\src\domain\entities\backfill-state.ts:30:        this._backfilledAt = new Date(params.backfilledAt.getTime());
.\src\domain\entities\backfill-state.ts:61:        return new Date(this._backfilledAt.getTime());
.\src\presentation\cli\commands\sync\lazy-loaders.test.ts:10:import { describe, expect, it, beforeEach, spyOn, mock } from "bun:test";
.\src\presentation\cli\commands\sync\lazy-loaders.test.ts:30:mock.module("../../../../infrastructure/embedding/background-embedder.js", () => ({
.\src\presentation\cli\commands\sync\lazy-loaders.test.ts:41:mock.module("../../../../infrastructure/embedding/embedding-provider-factory.js", () => ({
.\src\presentation\cli\commands\sync\lazy-loaders.test.ts:50:mock.module("../../../../infrastructure/hooks/config-manager.js", () => ({
.\src\presentation\cli\commands\sync\lazy-loaders.test.ts:80:mock.module("../../../../infrastructure/database/repositories/embedding-repository.js", () => ({
.\src\presentation\cli\commands\sync\lazy-loaders.test.ts:98:  beforeEach(() => {
.\src\presentation\cli\commands\sync\lazy-loaders.test.ts:139:      startedAt: new Date().toISOString(),
.\src\domain\entities\entity.test.ts:57:      const date = new Date("2026-01-31T10:00:00Z");
.\src\domain\entities\entity.test.ts:310:      const date = new Date("2026-01-31T10:00:00Z");
.\src\domain\entities\entity.test.ts:432:      const date = new Date("2026-01-31T10:00:00Z");
.\src\domain\entities\entity.ts:97:      ? new Date(params.createdAt.getTime())
.\src\domain\entities\entity.ts:174:    return this._createdAt ? new Date(this._createdAt.getTime()) : undefined;
.\src\infrastructure\hooks\log-writer.ts:116:            timestamp: new Date().toISOString(),
.\src\infrastructure\hooks\log-writer.ts:147:        const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
.\src\infrastructure\hooks\log-writer.ts:150:            const archiveDate = new Date().toISOString().split("T")[0];
.\src\domain\entities\extraction-state.test.ts:5:  const timestamp = new Date("2024-01-15T10:30:00Z");
.\src\domain\entities\extraction-state.test.ts:91:      const fileMtime = new Date("2024-01-15T09:00:00Z");
.\src\domain\entities\extraction-state.test.ts:126:        startedAt: new Date("2024-02-01T10:00:00Z"),
.\src\domain\entities\extraction-state.test.ts:150:      const originalDate = new Date("2024-01-15T10:30:00Z");
.\src\domain\entities\extraction-state.test.ts:175:      const originalMtime = new Date("2024-01-15T09:00:00Z");
.\src\domain\entities\extraction-state.test.ts:193:        fileMtime: new Date("2024-01-15T09:00:00Z"),
.\src\domain\entities\extraction-state.test.ts:227:      const completedAt = new Date("2024-01-15T10:35:00Z");
.\src\domain\entities\extraction-state.test.ts:243:      const completed = state.complete(new Date());
.\src\domain\entities\extraction-state.test.ts:277:      const fileMtime = new Date("2024-01-15T09:00:00Z");
.\src\domain\entities\extraction-state.test.ts:293:      const fileMtime = new Date("2024-01-15T09:00:00Z");
.\src\domain\entities\extraction-state.test.ts:303:      const completed = state.complete(new Date("2024-01-15T11:00:00Z"));
.\src\domain\entities\extraction-state.test.ts:310:      const fileMtime = new Date("2024-01-15T09:00:00Z");
.\src\domain\entities\extraction-state.test.ts:357:      const fileMtime = new Date("2024-01-15T09:00:00Z");
.\src\domain\entities\extraction-state.test.ts:382:      const mtime = new Date("2024-01-15T09:00:00Z");
.\src\domain\entities\extraction-state.test.ts:400:      const withMeta = state.withFileMetadata(new Date(), 1024);
.\src\domain\entities\extraction-state.test.ts:415:      expect(() => state.withFileMetadata(new Date(), -1)).toThrow(
.\src\domain\entities\extraction-state.test.ts:427:      const withMeta = state.withFileMetadata(new Date(), 0);
.\src\domain\entities\extraction-state.test.ts:505:        startedAt: new Date("2024-01-15T10:30:00Z"),
.\src\domain\entities\extraction-state.test.ts:507:        completedAt: new Date("2024-01-15T10:35:00Z"),
.\src\domain\ports\ports.test.ts:63:        startTime: new Date(),
.\src\domain\ports\ports.test.ts:107:        timestamp: new Date(),
.\src\domain\ports\ports.test.ts:143:            timestamp: new Date(),
.\src\domain\ports\ports.test.ts:152:            timestamp: new Date(),
.\src\domain\ports\ports.test.ts:169:        timestamp: new Date(),
.\src\domain\ports\ports.test.ts:219:        startedAt: new Date(),
.\src\domain\ports\ports.test.ts:250:        lastIndexedAt: new Date(),
.\src\domain\ports\ports.test.ts:316:        lastIndexedAt: new Date(),
.\src\domain\ports\ports.test.ts:350:        loggedAt: new Date("2026-03-08T10:00:00Z"),
.\src\domain\ports\ports.test.ts:526:        timestamp: new Date(),
.\src\domain\ports\ports.test.ts:556:        sinceDate: new Date("2026-01-01"),
.\src\domain\ports\ports.test.ts:557:        beforeDate: new Date("2026-12-31"),
.\src\domain\ports\ports.test.ts:647:        modifiedTime: new Date(),
.\src\domain\ports\ports.test.ts:675:        modifiedTime: new Date(),
.\src\domain\ports\ports.test.ts:692:            timestamp: new Date().toISOString(),
.\src\domain\ports\ports.test.ts:702:            timestamp: new Date().toISOString(),
.\src\domain\ports\ports.test.ts:762:        timestamp: new Date().toISOString(),
.\src\domain\ports\ports.test.ts:772:        timestamp: new Date().toISOString(),
.\src\domain\ports\ports.test.ts:787:    const timestamp = new Date().toISOString();
.\src\domain\ports\ports.test.ts:902:      timestamp: new Date().toISOString(),
.\src\domain\ports\ports.test.ts:920:      timestamp: new Date().toISOString(),
.\src\domain\ports\ports.test.ts:926:      timestamp: new Date().toISOString(),
.\src\domain\ports\ports.test.ts:942:      timestamp: new Date().toISOString(),
.\src\domain\ports\ports.test.ts:951:      timestamp: new Date().toISOString(),
.\src\domain\ports\ports.test.ts:965:      timestamp: new Date().toISOString(),
.\src\domain\ports\ports.test.ts:970:      timestamp: new Date().toISOString(),
.\src\domain\ports\ports.test.ts:983:            backfilledAt: new Date("2026-03-08T10:00:00Z"),
.\src\domain\ports\ports.test.ts:1053:            backfilledAt: new Date(),
.\src\domain\ports\ports.test.ts:1059:            backfilledAt: new Date(),
.\src\domain\entities\extraction-state.ts:48:    this._startedAt = new Date(params.startedAt.getTime());
.\src\domain\entities\extraction-state.ts:51:      ? new Date(params.completedAt.getTime())
.\src\domain\entities\extraction-state.ts:56:      ? new Date(params.fileMtime.getTime())
.\src\domain\entities\extraction-state.ts:105:    return new Date(this._startedAt.getTime());
.\src\domain\entities\extraction-state.ts:119:    return this._completedAt ? new Date(this._completedAt.getTime()) : undefined;
.\src\domain\entities\extraction-state.ts:141:    return this._fileMtime ? new Date(this._fileMtime.getTime()) : undefined;
.\src\domain\entities\friction-entry.test.ts:23:        loggedAt: new Date("2026-03-08T10:00:00Z"),
.\src\domain\entities\friction-entry.test.ts:44:                loggedAt: new Date(),
.\src\domain\entities\friction-entry.test.ts:57:            const reviewDate = new Date("2026-03-10T12:00:00Z");
.\src\domain\entities\friction-entry.test.ts:69:                loggedAt: new Date("2026-03-01T08:00:00Z"),
.\src\domain\entities\friction-entry.test.ts:70:                resolvedAt: new Date("2026-03-05T14:00:00Z"),
.\src\domain\entities\friction-entry.test.ts:90:                loggedAt: new Date("2026-03-01T00:00:00Z"),
.\src\domain\entities\friction-entry.test.ts:91:                resolvedAt: new Date("2026-03-02T00:00:00Z"),
.\src\domain\entities\friction-entry.test.ts:105:                loggedAt: new Date("2026-03-01T00:00:00Z"),
.\src\domain\entities\friction-entry.test.ts:106:                resolvedAt: new Date("2026-03-03T00:00:00Z"),
.\src\domain\entities\friction-entry.test.ts:181:            const reviewDate = new Date("2026-03-15T10:00:00Z");
.\src\domain\entities\friction-entry.test.ts:195:            const reviewDate = new Date("2026-03-15T10:00:00Z");
.\src\domain\entities\friction-entry.test.ts:264:                    resolvedAt: new Date(),
.\src\domain\entities\friction-entry.test.ts:272:            const loggedAt = new Date("2026-03-08T10:00:00Z");
.\src\domain\entities\friction-entry.test.ts:326:                resolvedAt: new Date("2026-03-09T00:00:00Z"),
.\src\domain\entities\friction-entry.ts:88:            ? new Date(params.lastReviewedAt.getTime())
.\src\domain\entities\friction-entry.ts:92:        this._loggedAt = new Date(params.loggedAt.getTime());
.\src\domain\entities\friction-entry.ts:94:            ? new Date(params.resolvedAt.getTime())
.\src\domain\entities\friction-entry.ts:170:            ? new Date(this._lastReviewedAt.getTime())
.\src\domain\entities\friction-entry.ts:183:        return new Date(this._loggedAt.getTime());
.\src\domain\entities\friction-entry.ts:188:            ? new Date(this._resolvedAt.getTime())
.\src\presentation\cli\commands\friction\index.ts:40:                process.exitCode = result.exitCode;
.\src\presentation\cli\commands\friction\index.ts:55:                process.exitCode = result.exitCode;
.\src\presentation\cli\commands\friction\index.ts:67:                process.exitCode = result.exitCode;
.\src\presentation\cli\commands\friction\index.ts:79:                process.exitCode = result.exitCode;
.\src\presentation\cli\commands\friction\index.ts:91:                process.exitCode = result.exitCode;
.\src\presentation\cli\commands\friction\index.ts:104:                process.exitCode = result.exitCode;
.\src\presentation\cli\commands\friction\index.ts:116:    const dbPath = options.dbPath ?? getDefaultDbPath();
.\src\domain\entities\memory-file.test.ts:21:    lastIndexedAt: new Date("2026-03-07T10:00:00Z"),
.\src\domain\entities\memory-file.test.ts:32:      expect(file.lastIndexedAt).toEqual(new Date("2026-03-07T10:00:00Z"));
.\src\domain\entities\memory-file.test.ts:46:      const before = new Date();
.\src\domain\entities\memory-file.test.ts:48:      const after = new Date();
.\src\domain\entities\memory-file.test.ts:55:      const createdAt = new Date("2026-01-01T00:00:00Z");
.\src\domain\entities\memory-file.test.ts:68:        lastIndexedAt: new Date("2026-03-07T12:00:00Z"),
.\src\domain\entities\memory-file.test.ts:168:      const createdAt = new Date("2026-01-15T00:00:00Z");
.\src\domain\entities\memory-file.test.ts:169:      const lastIndexedAt = new Date("2026-03-07T10:00:00Z");
.\src\domain\entities\memory-file.test.ts:193:      const lastIndexedAt = new Date("2026-03-07T10:00:00Z");
.\src\domain\entities\memory-file.test.ts:194:      const createdAt = new Date("2026-01-15T00:00:00Z");
.\src\domain\entities\memory-file.ts:60:    this._lastIndexedAt = new Date(params.lastIndexedAt.getTime());
.\src\domain\entities\memory-file.ts:62:      ? new Date(params.createdAt.getTime())
.\src\domain\entities\memory-file.ts:63:      : new Date();
.\src\domain\entities\memory-file.ts:141:    return new Date(this._lastIndexedAt.getTime());
.\src\domain\entities\memory-file.ts:148:    return new Date(this._createdAt.getTime());
.\src\domain\entities\message.test.ts:5:  const timestamp = new Date("2024-01-15T10:30:00Z");
.\src\domain\entities\message.test.ts:80:        timestamp: new Date("2024-02-01T10:00:00Z"),
.\src\domain\entities\message.test.ts:106:      const originalDate = new Date("2024-01-15T10:30:00Z");
.\src\presentation\cli\commands\friction\list.test.ts:7:import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\friction\list.test.ts:14:    beforeEach(() => {
.\src\presentation\cli\commands\friction\list.test.ts:19:    afterEach(() => {
.\src\domain\entities\message.ts:36:    this._timestamp = new Date(params.timestamp.getTime());
.\src\domain\entities\message.ts:79:    return new Date(this._timestamp.getTime());
.\src\domain\entities\session.test.ts:8:  const startTime = new Date("2024-01-15T10:00:00Z");
.\src\domain\entities\session.test.ts:26:      const endTime = new Date("2024-01-15T12:00:00Z");
.\src\domain\entities\session.test.ts:67:      const endTime = new Date("2024-01-14T10:00:00Z");
.\src\domain\entities\session.test.ts:89:        startTime: new Date("2024-02-01T10:00:00Z"),
.\src\domain\entities\session.test.ts:184:      const endTime = new Date("2024-01-15T12:30:00Z");
.\src\domain\entities\session.test.ts:214:      const endTime = new Date("2024-01-15T12:00:00Z");
.\src\domain\entities\session.test.ts:227:      const endTime = new Date("2024-01-15T12:00:00Z");
.\src\domain\entities\session.test.ts:241:      const endTime = new Date("2024-01-14T10:00:00Z");
.\src\domain\entities\session.test.ts:332:      const endTime = new Date("2024-01-15T12:00:00Z");
.\src\presentation\cli\commands\friction\list.ts:73:                const ageMs = Date.now() - entry.loggedAt.getTime();
.\src\domain\entities\session.ts:38:    this._startTime = new Date(params.startTime.getTime());
.\src\domain\entities\session.ts:40:      ? new Date(params.endTime.getTime())
.\src\domain\entities\session.ts:79:    return new Date(this._startTime.getTime());
.\src\domain\entities\session.ts:86:    return this._endTime ? new Date(this._endTime.getTime()) : undefined;
.\src\domain\entities\tool-use.test.ts:5:  const timestamp = new Date("2024-01-15T10:30:00Z");
.\src\domain\entities\tool-use.test.ts:85:        timestamp: new Date("2024-02-01T10:00:00Z"),
.\src\domain\entities\tool-use.test.ts:140:      const originalDate = new Date("2024-01-15T10:30:00Z");
.\src\domain\entities\tool-use.ts:38:    this._timestamp = new Date(params.timestamp.getTime());
.\src\domain\entities\tool-use.ts:85:    return new Date(this._timestamp.getTime());
.\src\presentation\cli\commands\friction\log.test.ts:7:import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\friction\log.test.ts:14:    beforeEach(() => {
.\src\presentation\cli\commands\friction\log.test.ts:19:    afterEach(() => {
.\src\presentation\cli\commands\friction\purge.test.ts:7:import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\friction\purge.test.ts:14:    beforeEach(() => {
.\src\presentation\cli\commands\friction\purge.test.ts:19:    afterEach(() => {
.\src\presentation\cli\commands\friction\resolve.test.ts:7:import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\friction\resolve.test.ts:14:    beforeEach(() => {
.\src\presentation\cli\commands\friction\resolve.test.ts:19:    afterEach(() => {
.\src\presentation\cli\commands\friction\wontfix.test.ts:7:import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
.\src\presentation\cli\commands\friction\wontfix.test.ts:14:    beforeEach(() => {
.\src\presentation\cli\commands\friction\wontfix.test.ts:19:    afterEach(() => {
.\src\presentation\cli\commands\friction\types.ts:88:    /** Override database path (for testing). Falls back to getDefaultDbPath(). */

hook: PostToolUse
 succeeded in 4987ms:
 M src/presentation/cli/commands/browse.test.ts
 M src/presentation/cli/commands/browse.ts
 M src/presentation/cli/commands/friction/index.ts
 M src/presentation/cli/commands/friction/types.ts
?? .claude/
?? .planning/reviews/
?? docs/audits/

hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PostToolUse Completed
codex
The broad scan confirms the headline pattern, but it also surfaced two important review facts: there are historical audit docs already calling out more than `setTestDbPath`, and there are other global seams like env and time usage. I’m narrowing that to production command files now so the critique is specific.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"let test|setTest|resetTest|set[A-Za-z0-9_]*(?:Path|Fn|Function|Overrides|Config)|askConfirmationFn|testConfigPath|testPathOverrides\" src tests --glob '"'!**/*.md'"'" in C:\Projects\memory-nexus
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"getDefaultDbPath\\(|testDbPath|set[A-Za-z0-9_]*TestDbPath|mock\\.module\\(\" src tests --glob '"'!**/*.md'"'" in C:\Projects\memory-nexus
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"process\\.env|process\\.exitCode|Date\\.now\\(|new Date\\(\\)|Math\\.random\\(|tmpdir\\(|rmSync|mkdirSync|writeFileSync|unlinkSync|spawn\\(|Bun\\.spawn|setTimeout\\(|setInterval\\(\" src tests --glob '"'!**/*.md'"'" in C:\Projects\memory-nexus
 succeeded in 7606ms:
tests\generators\large-session.ts:7:import { writeFileSync } from "fs";
tests\generators\large-session.ts:64:  writeFileSync(outputPath, lines.join("\n"));
tests\generators\large-session.ts:198:  writeFileSync(outputPath, lines.join("\n"));
tests\helpers\test-database.ts:28:import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
tests\helpers\test-database.ts:98:    const dir = mkdtempSync(join(tmpdir(), prefix));
tests\helpers\test-database.ts:134:                rmSync(dir, { recursive: true, force: true });
tests\helpers\test-database.ts:163:    const dir = mkdtempSync(join(tmpdir(), prefix));
tests\helpers\test-database.ts:169:                rmSync(dir, { recursive: true, force: true });
tests\infrastructure\database\repositories\friction-repository.test.ts:37:        loggedAt: new Date(),
tests\infrastructure\database\repositories\friction-repository.test.ts:65:                loggedAt: new Date(),
src\domain\entities\backfill-state.test.ts:49:                backfilledAt: new Date(),
src\domain\entities\backfill-state.test.ts:59:                backfilledAt: new Date(),
src\domain\entities\backfill-state.test.ts:72:                    backfilledAt: new Date(),
src\domain\entities\backfill-state.test.ts:82:                    backfilledAt: new Date(),
src\domain\entities\backfill-state.test.ts:92:                    backfilledAt: new Date(),
src\domain\entities\backfill-state.test.ts:102:                    backfilledAt: new Date(),
src\domain\entities\backfill-state.test.ts:149:                backfilledAt: new Date(),
src\domain\entities\backfill-state.test.ts:160:                backfilledAt: new Date(),
tests\integration\sync-with-memory-files.test.ts:13:import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
tests\integration\sync-with-memory-files.test.ts:28:    memoryDir = mkdtempSync(join(tmpdir(), "memory-test-memdir-"));
tests\integration\sync-with-memory-files.test.ts:36:      rmSync(memoryDir, { recursive: true, force: true });
tests\integration\sync-with-memory-files.test.ts:44:    mkdirSync(join(memoryDir, "daily"), { recursive: true });
tests\integration\sync-with-memory-files.test.ts:45:    writeFileSync(
tests\integration\sync-with-memory-files.test.ts:49:    writeFileSync(
tests\integration\sync-with-memory-files.test.ts:79:    mkdirSync(join(memoryDir, "daily"), { recursive: true });
tests\integration\sync-with-memory-files.test.ts:80:    writeFileSync(
tests\integration\sync-with-memory-files.test.ts:84:    writeFileSync(
tests\integration\sync-with-memory-files.test.ts:105:    mkdirSync(join(memoryDir, "daily"), { recursive: true });
tests\integration\sync-with-memory-files.test.ts:106:    writeFileSync(
tests\integration\sync-with-memory-files.test.ts:110:    writeFileSync(
tests\integration\sync-with-memory-files.test.ts:123:    writeFileSync(
tests\integration\sync-with-memory-files.test.ts:140:    writeFileSync(
tests\integration\sync-with-memory-files.test.ts:171:    mkdirSync(projectDir, { recursive: true });
tests\integration\sync-with-memory-files.test.ts:172:    writeFileSync(
src\infrastructure\external\qmd-runner.ts:26:      const child = spawn("qmd", ["search", query, "--json"], {
tests\integration\programmatic-api.test.ts:16:import { mkdtempSync, existsSync, rmSync } from "node:fs";
tests\integration\programmatic-api.test.ts:75:    exportDir = mkdtempSync(join(tmpdir(), "memory-api-test-"));
tests\integration\programmatic-api.test.ts:80:      rmSync(exportDir, { recursive: true, force: true });
tests\integration\programmatic-api.test.ts:476:      const savedExitCode = process.exitCode;
tests\integration\programmatic-api.test.ts:477:      process.exitCode = undefined;
tests\integration\programmatic-api.test.ts:480:      expect(process.exitCode).toBeUndefined();
tests\integration\programmatic-api.test.ts:483:      expect(process.exitCode).toBeUndefined();
tests\integration\programmatic-api.test.ts:486:      expect(process.exitCode).toBeUndefined();
tests\integration\programmatic-api.test.ts:489:      process.exitCode = savedExitCode;
tests\integration\large-file.test.ts:11:import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
tests\integration\large-file.test.ts:25:  const baseTime = Date.now();
tests\integration\large-file.test.ts:104:  writeFileSync(filePath, lines.join("\n") + "\n");
tests\integration\large-file.test.ts:121:  const baseTime = Date.now();
tests\integration\large-file.test.ts:126:    if (Math.random() < errorRate) {
tests\integration\large-file.test.ts:163:  writeFileSync(filePath, lines.join("\n") + "\n");
tests\integration\large-file.test.ts:172:    testDir = mkdtempSync(join(tmpdir(), "large-file-test-"));
tests\integration\large-file.test.ts:178:      rmSync(testDir, { recursive: true, force: true });
src\domain\entities\extraction-state.test.ts:243:      const completed = state.complete(new Date());
src\domain\entities\extraction-state.test.ts:400:      const withMeta = state.withFileMetadata(new Date(), 1024);
src\domain\entities\extraction-state.test.ts:415:      expect(() => state.withFileMetadata(new Date(), -1)).toThrow(
src\domain\entities\extraction-state.test.ts:427:      const withMeta = state.withFileMetadata(new Date(), 0);
src\domain\entities\friction-entry.test.ts:44:                loggedAt: new Date(),
src\domain\entities\friction-entry.test.ts:264:                    resolvedAt: new Date(),
tests\integration\interrupted-sync.test.ts:10:import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
tests\integration\interrupted-sync.test.ts:50:    modifiedTime: new Date(),
tests\integration\interrupted-sync.test.ts:59:  const timestamp = new Date().toISOString();
tests\integration\interrupted-sync.test.ts:64:      uuid: `msg-${Date.now()}-1`,
tests\integration\interrupted-sync.test.ts:73:      uuid: `msg-${Date.now()}-2`,
tests\integration\interrupted-sync.test.ts:77:  writeFileSync(filePath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
tests\integration\interrupted-sync.test.ts:101:    testDir = mkdtempSync(join(tmpdir(), "interrupted-sync-test-"));
tests\integration\interrupted-sync.test.ts:144:      rmSync(testDir, { recursive: true, force: true });
tests\integration\interrupted-sync.test.ts:223:    writeFileSync(checkpointPath, "{ invalid json without closing brace");
tests\integration\interrupted-sync.test.ts:257:      startedAt: new Date().toISOString(),
tests\integration\interrupted-sync.test.ts:261:      lastCompletedAt: new Date().toISOString(),
tests\integration\interrupted-sync.test.ts:328:      startedAt: new Date().toISOString(),
tests\integration\interrupted-sync.test.ts:332:      lastCompletedAt: new Date().toISOString(),
tests\presentation\cli\formatters\friction-dashboard.test.ts:38:        loggedAt: new Date(),
tests\integration\index.ts:9:import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
tests\integration\index.ts:78:    directory = mkdtempSync(join(tmpdir(), "integration-test-db-"));
tests\integration\index.ts:104:        rmSync(directory, { recursive: true, force: true });
tests\integration\index.ts:167:  const directory = mkdtempSync(join(tmpdir(), "integration-test-sessions-"));
tests\integration\index.ts:177:    writeFileSync(filePath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
tests\integration\index.ts:183:      modifiedTime: new Date(),
tests\integration\index.ts:192:      rmSync(directory, { recursive: true, force: true });
tests\integration\index.ts:210:  const baseTime = Date.now();
tests\integration\index.ts:261:        rmSync(dir, { recursive: true, force: true });
tests\integration\index.ts:305:  const startTime = Date.now();
tests\integration\index.ts:307:  while (Date.now() - startTime < timeoutMs) {
tests\integration\index.ts:311:    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
tests\integration\index.ts:331:    setTimeout(() => reject(new Error(message)), timeoutMs);
tests\integration\concurrent-commands.test.ts:10:import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
tests\integration\concurrent-commands.test.ts:38:  const timestamp = new Date().toISOString();
tests\integration\concurrent-commands.test.ts:87:  writeFileSync(filePath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
tests\integration\concurrent-commands.test.ts:105:    testDir = mkdtempSync(join(tmpdir(), "concurrent-test-"));
tests\integration\concurrent-commands.test.ts:118:        modifiedTime: new Date(),
tests\integration\concurrent-commands.test.ts:134:      rmSync(testDir, { recursive: true, force: true });
tests\integration\concurrent-commands.test.ts:182:      setTimeout(() => reject(new Error("Deadlock detected: operations timed out")), 15000);
tests\integration\concurrent-commands.test.ts:257:      setTimeout(() => reject(new Error("Deadlock detected")), 10000);
tests\integration\concurrent-commands.test.ts:335:      await new Promise((resolve) => setTimeout(resolve, 50)); // Stagger slightly
src\infrastructure\embedding\background-embedder.ts:20:  writeFileSync,
src\infrastructure\embedding\background-embedder.ts:21:  unlinkSync,
src\infrastructure\embedding\background-embedder.ts:22:  mkdirSync,
src\infrastructure\embedding\background-embedder.ts:86:  mkdirSync(dir, { recursive: true });
src\infrastructure\embedding\background-embedder.ts:87:  writeFileSync(lockPath, JSON.stringify(data));
src\infrastructure\embedding\background-embedder.ts:116:    unlinkSync(lockPath);
src\infrastructure\embedding\background-embedder.ts:171:    { pid, startedAt: new Date().toISOString(), totalMessages },
src\infrastructure\embedding\background-embedder.ts:216:  mkdirSync(logDirPath, { recursive: true });
src\infrastructure\embedding\background-embedder.ts:226:  const subprocess = spawn(command, args, {
src\infrastructure\embedding\background-embedder.ts:230:      ...process.env,
src\infrastructure\embedding\background-embedder.ts:276:  return process.env.MEMORY_EMBED_BACKGROUND === "1";
src\infrastructure\embedding\background-embedder.test.ts:12:  mkdirSync,
src\infrastructure\embedding\background-embedder.test.ts:13:  rmSync,
src\infrastructure\embedding\background-embedder.test.ts:15:  writeFileSync,
src\infrastructure\embedding\background-embedder.test.ts:35:    testDir = join(tmpdir(), `memory-bg-embed-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
src\infrastructure\embedding\background-embedder.test.ts:36:    mkdirSync(testDir, { recursive: true });
src\infrastructure\embedding\background-embedder.test.ts:41:      rmSync(testDir, { recursive: true, force: true });
src\infrastructure\embedding\background-embedder.test.ts:49:        startedAt: new Date().toISOString(),
src\infrastructure\embedding\background-embedder.test.ts:60:      const now = new Date().toISOString();
src\infrastructure\embedding\background-embedder.test.ts:77:      const isoTimestamp = new Date().toISOString();
src\infrastructure\embedding\background-embedder.test.ts:116:      writeFileSync(lockPath, "not valid json {{{");
src\infrastructure\embedding\background-embedder.test.ts:127:        startedAt: new Date().toISOString(),
src\infrastructure\embedding\background-embedder.test.ts:208:    testDir = join(tmpdir(), `memory-bg-spawn-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
src\infrastructure\embedding\background-embedder.test.ts:210:    mkdirSync(testDir, { recursive: true });
src\infrastructure\embedding\background-embedder.test.ts:211:    mkdirSync(logDir, { recursive: true });
src\infrastructure\embedding\background-embedder.test.ts:218:      rmSync(testDir, { recursive: true, force: true });
src\infrastructure\embedding\background-embedder.test.ts:366:        startedAt: new Date().toISOString(),
src\infrastructure\embedding\background-embedder.test.ts:391:    testDir = join(tmpdir(), `memory-bg-cleanup-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
src\infrastructure\embedding\background-embedder.test.ts:392:    mkdirSync(testDir, { recursive: true });
src\infrastructure\embedding\background-embedder.test.ts:397:      rmSync(testDir, { recursive: true, force: true });
src\infrastructure\embedding\background-embedder.test.ts:404:      startedAt: new Date().toISOString(),
src\infrastructure\embedding\background-embedder.test.ts:422:  const originalEnv = process.env.MEMORY_EMBED_BACKGROUND;
src\infrastructure\embedding\background-embedder.test.ts:426:      delete process.env.MEMORY_EMBED_BACKGROUND;
src\infrastructure\embedding\background-embedder.test.ts:428:      process.env.MEMORY_EMBED_BACKGROUND = originalEnv;
src\infrastructure\embedding\background-embedder.test.ts:433:    process.env.MEMORY_EMBED_BACKGROUND = "1";
src\infrastructure\embedding\background-embedder.test.ts:438:    delete process.env.MEMORY_EMBED_BACKGROUND;
src\infrastructure\embedding\background-embedder.test.ts:443:    process.env.MEMORY_EMBED_BACKGROUND = "0";
src\presentation\cli\progress-reporter.test.ts:31:      MSYSTEM: process.env.MSYSTEM,
src\presentation\cli\progress-reporter.test.ts:32:      WT_SESSION: process.env.WT_SESSION,
src\presentation\cli\progress-reporter.test.ts:33:      TERMINUS_SUBLIME: process.env.TERMINUS_SUBLIME,
src\presentation\cli\progress-reporter.test.ts:34:      ConEmuTask: process.env.ConEmuTask,
src\presentation\cli\progress-reporter.test.ts:35:      TERM_PROGRAM: process.env.TERM_PROGRAM,
src\presentation\cli\progress-reporter.test.ts:36:      TERM: process.env.TERM,
src\presentation\cli\progress-reporter.test.ts:37:      TERMINAL_EMULATOR: process.env.TERMINAL_EMULATOR,
src\presentation\cli\progress-reporter.test.ts:41:    delete process.env.MSYSTEM;
src\presentation\cli\progress-reporter.test.ts:42:    delete process.env.WT_SESSION;
src\presentation\cli\progress-reporter.test.ts:43:    delete process.env.TERMINUS_SUBLIME;
src\presentation\cli\progress-reporter.test.ts:44:    delete process.env.ConEmuTask;
src\presentation\cli\progress-reporter.test.ts:45:    delete process.env.TERM_PROGRAM;
src\presentation\cli\progress-reporter.test.ts:46:    delete process.env.TERM;
src\presentation\cli\progress-reporter.test.ts:47:    delete process.env.TERMINAL_EMULATOR;
src\presentation\cli\progress-reporter.test.ts:53:        delete process.env[key];
src\presentation\cli\progress-reporter.test.ts:55:        process.env[key] = value;
src\presentation\cli\progress-reporter.test.ts:63:    process.env.MSYSTEM = "MINGW64";
src\presentation\cli\progress-reporter.test.ts:74:    process.env.TERM = "linux";
src\presentation\cli\progress-reporter.test.ts:80:    process.env.WT_SESSION = "some-guid";
src\presentation\cli\progress-reporter.test.ts:86:    process.env.TERM_PROGRAM = "vscode";
src\presentation\cli\progress-reporter.test.ts:100:    savedMSYSTEM = process.env.MSYSTEM;
src\presentation\cli\progress-reporter.test.ts:105:      delete process.env.MSYSTEM;
src\presentation\cli\progress-reporter.test.ts:107:      process.env.MSYSTEM = savedMSYSTEM;
src\presentation\cli\progress-reporter.test.ts:121:    process.env.MSYSTEM = "MINGW64";
src\domain\entities\memory-file.test.ts:46:      const before = new Date();
src\domain\entities\memory-file.test.ts:48:      const after = new Date();
tests\presentation\cli\commands\friction.test.ts:70:        const tmp = require("node:os").tmpdir();
tests\presentation\cli\commands\friction.test.ts:294:            fs.mkdirSync(fallbackDir, { recursive: true });
tests\presentation\cli\commands\friction.test.ts:295:            fs.writeFileSync(fallbackPath, '{"description":"from fallback","tool":"gsd","severity":"low","category":"cli"}\n');
tests\presentation\cli\commands\friction.test.ts:313:                    fs.writeFileSync(fallbackPath, originalContent);
src\domain\entities\memory-file.ts:63:      : new Date();
src\presentation\cli\db-startup.ts:76:  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
src\presentation\cli\db-startup.test.ts:8:import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
src\presentation\cli\db-startup.test.ts:23:  const dir = mkdtempSync(join(tmpdir(), "memory-nexus-dbstartup-"));
src\presentation\cli\db-startup.test.ts:33:    rmSync(dir, { recursive: true, force: true });
src\presentation\cli\db-startup.test.ts:117:      writeFileSync(dbPath, "not a valid sqlite database");
src\presentation\cli\db-startup.test.ts:147:      writeFileSync(dbPath, "corrupted data");
src\presentation\cli\db-startup.test.ts:232:      writeFileSync(dbPath, "corrupt");
src\presentation\cli\db-startup.test.ts:257:      writeFileSync(dbPath, "corrupt");
src\presentation\cli\command-result.ts:5: * instead of mutating process.exitCode directly, keeping handlers
src\infrastructure\database\connection.ts:9:import { existsSync, mkdirSync } from "node:fs";
src\infrastructure\database\connection.ts:124:            mkdirSync(dirname(path), { recursive: true });
src\presentation\cli\commands\browse.test.ts:43:import { mkdtempSync, rmSync, existsSync } from "fs";
src\presentation\cli\commands\browse.test.ts:59:  return mkdtempSync(join(tmpdir(), "browse-test-"));
src\presentation\cli\commands\browse.test.ts:66:      rmSync(dir, { recursive: true, force: true });
src\infrastructure\database\connection.test.ts:12:import { mkdtempSync, rmSync, existsSync, statSync, writeFileSync } from "node:fs";
src\infrastructure\database\connection.test.ts:27:    const dir = mkdtempSync(join(tmpdir(), "memory-nexus-test-"));
src\infrastructure\database\connection.test.ts:38:        rmSync(dir, { recursive: true, force: true });
src\infrastructure\database\connection.test.ts:356:            writeFileSync(dbPath, "not a valid sqlite database file with garbage data");
src\infrastructure\database\connection.test.ts:421:            writeFileSync(dbPath, "corrupted data that is definitely not sqlite");
src\infrastructure\database\health-checker.test.ts:9:import { mkdirSync, rmSync, writeFileSync } from "node:fs";
src\infrastructure\database\health-checker.test.ts:30:    const testDir = join(tmpdir(), `health-checker-test-${Date.now()}`);
src\infrastructure\database\health-checker.test.ts:38:        mkdirSync(join(testDir, "logs"), { recursive: true });
src\infrastructure\database\health-checker.test.ts:39:        mkdirSync(join(testDir, ".claude"), { recursive: true });
src\infrastructure\database\health-checker.test.ts:58:            rmSync(testDir, { recursive: true, force: true });
src\infrastructure\database\health-checker.test.ts:170:            writeFileSync(testFile, "test content");
src\infrastructure\database\health-checker.test.ts:182:                rmSync(testConfigPath, { force: true });
src\infrastructure\database\health-checker.test.ts:195:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:211:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:221:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:231:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:241:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:251:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:261:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:271:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:287:                rmSync(testConfigPath, { force: true });
src\infrastructure\database\health-checker.test.ts:288:                rmSync(testSettingsPath, { force: true });
src\infrastructure\database\health-checker.test.ts:289:                rmSync(testLogPath, { force: true });
src\infrastructure\database\health-checker.test.ts:296:            writeFileSync(testSettingsPath, JSON.stringify({}));
src\infrastructure\database\health-checker.test.ts:303:            writeFileSync(testConfigPath, JSON.stringify({ autoSync: true }));
src\infrastructure\database\health-checker.test.ts:310:            writeFileSync(testConfigPath, JSON.stringify({ autoSync: false }));
src\infrastructure\database\health-checker.test.ts:322:            const timestamp = new Date().toISOString();
src\infrastructure\database\health-checker.test.ts:323:            mkdirSync(join(testDir, "logs"), { recursive: true });
src\infrastructure\database\health-checker.test.ts:324:            writeFileSync(testLogPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:484:                rmSync(testConfigPath, { force: true });
src\infrastructure\database\health-checker.test.ts:500:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:531:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:545:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:560:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:574:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:589:            writeFileSync(testConfigPath, JSON.stringify({
src\presentation\cli\commands\backfill.ts:11:import { existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
src\presentation\cli\commands\backfill.ts:51:    mkdirSync(dir, { recursive: true });
src\presentation\cli\commands\backfill.ts:57:      writeFileSync(fullPath, content);
src\presentation\cli\commands\browse.ts:88:      process.exitCode = result.exitCode;
src\presentation\cli\parsers\date-parser.test.ts:121:        expect(result.getTime()).toBeLessThan(Date.now());
src\presentation\cli\pickers\session-picker.test.ts:216:    const now = new Date();
src\presentation\cli\parsers\date-parser.ts:43:  const reference = referenceDate ?? new Date();
src\presentation\cli\commands\completion.ts:494:            process.exitCode = result.exitCode;
src\presentation\cli\formatters\color.ts:29:  const noColor = options?.noColor ?? !!process.env.NO_COLOR;
src\presentation\cli\formatters\color.ts:30:  const forceColor = options?.forceColor ?? !!process.env.FORCE_COLOR;
src\infrastructure\database\services\context-service.test.ts:33:  const time = startTime ?? new Date();
src\infrastructure\database\services\context-service.test.ts:72:  const time = timestamp ?? new Date();
src\infrastructure\database\services\context-service.test.ts:126:      const oldDate = new Date();
src\infrastructure\database\services\context-service.test.ts:288:      const now = new Date();
src\infrastructure\database\services\context-service.test.ts:306:      const now = new Date();
src\infrastructure\database\services\context-service.test.ts:328:      const now = new Date();
src\presentation\cli\formatters\color.test.ts:19:  const originalNoColor = process.env.NO_COLOR;
src\presentation\cli\formatters\color.test.ts:20:  const originalForceColor = process.env.FORCE_COLOR;
src\presentation\cli\formatters\color.test.ts:24:    delete process.env.NO_COLOR;
src\presentation\cli\formatters\color.test.ts:25:    delete process.env.FORCE_COLOR;
src\presentation\cli\formatters\color.test.ts:31:      process.env.NO_COLOR = originalNoColor;
src\presentation\cli\formatters\color.test.ts:33:      delete process.env.NO_COLOR;
src\presentation\cli\formatters\color.test.ts:36:      process.env.FORCE_COLOR = originalForceColor;
src\presentation\cli\formatters\color.test.ts:38:      delete process.env.FORCE_COLOR;
src\presentation\cli\formatters\color.test.ts:54:      process.env.NO_COLOR = "1";
src\presentation\cli\formatters\color.test.ts:60:      process.env.FORCE_COLOR = "1";
src\presentation\cli\formatters\color.test.ts:66:      process.env.NO_COLOR = "1";
src\presentation\cli\formatters\color.test.ts:67:      process.env.FORCE_COLOR = "1";
src\presentation\cli\commands\context.test.ts:8:import { mkdtempSync, rmSync } from "fs";
src\presentation\cli\commands\context.test.ts:216:    tempDir = mkdtempSync(join(tmpdir(), "context-test-"));
src\presentation\cli\commands\context.test.ts:225:    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
src\infrastructure\sources\session-source.test.ts:8:import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
src\infrastructure\sources\session-source.test.ts:20:        testDir = join(tmpdir(), `session-source-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
src\infrastructure\sources\session-source.test.ts:22:        mkdirSync(projectsDir, { recursive: true });
src\infrastructure\sources\session-source.test.ts:28:            rmSync(testDir, { recursive: true, force: true });
src\infrastructure\sources\session-source.test.ts:41:            mkdirSync(customDir, { recursive: true });
src\infrastructure\sources\session-source.test.ts:65:            mkdirSync(projectDir, { recursive: true });
src\infrastructure\sources\session-source.test.ts:69:            writeFileSync(sessionFile, '{"type":"test"}\n');
src\infrastructure\sources\session-source.test.ts:82:            mkdirSync(project1, { recursive: true });
src\infrastructure\sources\session-source.test.ts:84:            writeFileSync(join(project1, `${session1}.jsonl`), '{"type":"test"}\n');
src\infrastructure\sources\session-source.test.ts:88:            mkdirSync(project2, { recursive: true });
src\infrastructure\sources\session-source.test.ts:91:            writeFileSync(join(project2, `${session2}.jsonl`), '{"type":"test"}\n');
src\infrastructure\sources\session-source.test.ts:92:            writeFileSync(join(project2, `${session3}.jsonl`), '{"type":"test"}\n');
src\infrastructure\sources\session-source.test.ts:105:            mkdirSync(project, { recursive: true });
src\infrastructure\sources\session-source.test.ts:110:            writeFileSync(mainSessionFile, '{"type":"test"}\n');
src\infrastructure\sources\session-source.test.ts:115:            mkdirSync(subagentsDir, { recursive: true });
src\infrastructure\sources\session-source.test.ts:118:            writeFileSync(join(subagentsDir, `${subagentSession}.jsonl`), '{"type":"subagent"}\n');
src\infrastructure\sources\session-source.test.ts:134:            mkdirSync(projectDir, { recursive: true });
src\infrastructure\sources\session-source.test.ts:139:            writeFileSync(sessionFile, content);
src\infrastructure\sources\session-source.test.ts:160:            writeFileSync(fakeDirPath, "this is a file, not a directory");
src\infrastructure\sources\session-source.test.ts:170:            mkdirSync(project, { recursive: true });
src\infrastructure\sources\session-source.test.ts:174:            writeFileSync(join(project, `${sessionId}.jsonl`), '{"type":"test"}\n');
src\infrastructure\sources\session-source.test.ts:177:            writeFileSync(join(project, "readme.txt"), "readme");
src\infrastructure\sources\session-source.test.ts:178:            writeFileSync(join(project, "config.json"), "{}");
src\infrastructure\sources\session-source.test.ts:179:            writeFileSync(join(project, ".hidden"), "hidden");
src\infrastructure\sources\session-source.test.ts:198:            mkdirSync(project, { recursive: true });
src\infrastructure\sources\session-source.test.ts:202:            writeFileSync(sessionFile, '{"type":"test"}\n');
src\infrastructure\sources\session-source.test.ts:212:            mkdirSync(project, { recursive: true });
src\infrastructure\sources\session-source.test.ts:218:            mkdirSync(subagentsDir, { recursive: true });
src\infrastructure\sources\session-source.test.ts:222:            writeFileSync(subagentFile, '{"type":"subagent"}\n');
src\infrastructure\sources\session-source.test.ts:234:            mkdirSync(project1, { recursive: true });
src\infrastructure\sources\session-source.test.ts:235:            mkdirSync(project2, { recursive: true });
src\infrastructure\sources\session-source.test.ts:238:            writeFileSync(join(project1, `${sessionId}.jsonl`), '{"type":"proj1"}\n');
src\infrastructure\sources\session-source.test.ts:239:            writeFileSync(join(project2, `${sessionId}.jsonl`), '{"type":"proj2"}\n');
src\infrastructure\sources\session-source.test.ts:256:            mkdirSync(join(resolverRoot, "Users", "Destiny", "Projects", "memory-nexus"), { recursive: true });
src\infrastructure\sources\session-source.test.ts:261:            mkdirSync(projectDir, { recursive: true });
src\infrastructure\sources\session-source.test.ts:265:            writeFileSync(sessionFile, '{"type":"test"}\n');
src\infrastructure\sources\session-source.test.ts:281:            mkdirSync(join(resolverRoot, "Users", "Destiny", "iCloudDrive", "Documents", "AI Tools", "Projects", "get-stuff-done"), { recursive: true });
src\infrastructure\sources\session-source.test.ts:285:            mkdirSync(projectDir, { recursive: true });
src\infrastructure\sources\session-source.test.ts:288:            writeFileSync(join(projectDir, `${sessionId}.jsonl`), '{"type":"test"}\n');
src\infrastructure\sources\session-source.test.ts:305:            mkdirSync(resolverRoot, { recursive: true });
src\infrastructure\sources\session-source.test.ts:309:            mkdirSync(projectDir, { recursive: true });
src\infrastructure\sources\session-source.test.ts:312:            writeFileSync(join(projectDir, `${sessionId}.jsonl`), '{"type":"test"}\n');
src\infrastructure\database\services\hybrid-search-service.ts:286:    const now = new Date();
src\presentation\cli\commands\context.ts:107:      process.exitCode = result.exitCode;
src\infrastructure\database\services\hybrid-search-service.test.ts:57:  const ts = timestamp?.toISOString() ?? new Date().toISOString();
src\infrastructure\database\services\hybrid-search-service.test.ts:80:    embedding[i] = Math.random() * 2 - 1;
src\infrastructure\database\services\hybrid-search-service.test.ts:88:    [rowid, new Date().toISOString(), modelHash, modelName]
src\infrastructure\database\services\hybrid-search-service.test.ts:105:    [rowid, new Date().toISOString(), modelHash, modelName]
src\infrastructure\database\services\hybrid-search-service.test.ts:112:    embedding[i] = Math.random() * 2 - 1;
src\infrastructure\database\services\hybrid-search-service.test.ts:533:      const newDate = new Date();
src\infrastructure\database\services\hybrid-search-service.test.ts:572:      const newDate = new Date();
src\infrastructure\database\services\hybrid-search-service.test.ts:1021:      const newDate = new Date();
src\infrastructure\database\services\hybrid-search-service.test.ts:1054:      const newDate = new Date();
src\infrastructure\database\services\hybrid-search-service.test.ts:1088:      const newDate = new Date();
src\infrastructure\database\services\hybrid-search-service.test.ts:1124:      const newDate = new Date();
src\infrastructure\database\services\hybrid-search-service.test.ts:1190:      const newDate = new Date();
src\infrastructure\database\schema.test.ts:638:            const before = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
src\domain\value-objects\embedding-result.test.ts:43:        data[i] = Math.random() * 2 - 1;
src\infrastructure\sources\project-name-resolver.test.ts:9:import { mkdirSync, rmSync, existsSync } from "node:fs";
src\infrastructure\sources\project-name-resolver.test.ts:19:      tmpdir(),
src\infrastructure\sources\project-name-resolver.test.ts:20:      `resolver-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
src\infrastructure\sources\project-name-resolver.test.ts:22:    mkdirSync(testDir, { recursive: true });
src\infrastructure\sources\project-name-resolver.test.ts:27:      rmSync(testDir, { recursive: true, force: true });
src\infrastructure\sources\project-name-resolver.test.ts:37:      mkdirSync(join(testDir, p), { recursive: true });
src\presentation\cli\commands\doctor.test.ts:8:import { mkdirSync, rmSync, writeFileSync } from "node:fs";
src\presentation\cli\commands\doctor.test.ts:27:    const testDir = join(tmpdir(), `doctor-test-${Date.now()}`);
src\presentation\cli\commands\doctor.test.ts:39:        mkdirSync(join(testDir, "logs"), { recursive: true });
src\presentation\cli\commands\doctor.test.ts:40:        mkdirSync(join(testDir, ".claude"), { recursive: true });
src\presentation\cli\commands\doctor.test.ts:72:            rmSync(testDir, { recursive: true, force: true });
src\presentation\cli\commands\doctor.test.ts:126:                lastRun: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
src\presentation\cli\commands\doctor.test.ts:278:                lastRun: new Date(),
src\infrastructure\database\integration.test.ts:11:import { existsSync, statSync, unlinkSync, rmSync } from "node:fs";
src\infrastructure\database\integration.test.ts:675:        dbPath = join(tmpdir(), `memory-nexus-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
src\infrastructure\database\integration.test.ts:693:            if (existsSync(dbPath)) unlinkSync(dbPath);
src\infrastructure\database\integration.test.ts:694:            if (existsSync(walPath)) unlinkSync(walPath);
src\infrastructure\database\integration.test.ts:695:            if (existsSync(`${dbPath}-shm`)) unlinkSync(`${dbPath}-shm`);
src\infrastructure\database\integration.test.ts:1029:                timestamp: new Date(Date.now() + i * 1000),
src\infrastructure\database\integration.test.ts:1042:            startedAt: new Date(),
src\infrastructure\database\integration.test.ts:1045:            completedAt: new Date(),
src\infrastructure\database\integration.test.ts:1091:            startTime: new Date(),
src\infrastructure\database\integration.test.ts:1096:            startTime: new Date(),
src\infrastructure\database\integration.test.ts:1107:            timestamp: new Date(),
src\infrastructure\database\integration.test.ts:1113:            timestamp: new Date(),
src\infrastructure\database\integration.test.ts:1138:            startTime: new Date(),
src\infrastructure\database\integration.test.ts:1154:            timestamp: new Date(),
src\infrastructure\database\integration.test.ts:1169:            startTime: new Date(),
src\infrastructure\database\integration.test.ts:1179:                timestamp: new Date(Date.now() + i),
src\infrastructure\database\services\context-service.ts:120:      const now = new Date();
src\infrastructure\database\services\search-service.test.ts:53:  const ts = timestamp?.toISOString() ?? new Date().toISOString();
src\presentation\cli\formatters\friction-dashboard.test.ts:45:            loggedAt: new Date(Date.now() - 14 * 86400000),
src\presentation\cli\formatters\friction-dashboard.test.ts:54:            loggedAt: new Date(Date.now() - 3 * 86400000),
src\presentation\cli\commands\doctor.ts:16:import { mkdirSync, existsSync } from "node:fs";
src\presentation\cli\commands\doctor.ts:102:    const now = Date.now();
src\presentation\cli\commands\doctor.ts:306:            mkdirSync(configDir, { recursive: true });
src\presentation\cli\commands\doctor.ts:318:            mkdirSync(logsDir, { recursive: true });
src\presentation\cli\commands\doctor.ts:353:            process.exitCode = result.exitCode;
src\presentation\cli\formatters\friction-dashboard.ts:181:        daysOpen: Math.floor((Date.now() - e.loggedAt.getTime()) / 86400000),
src\presentation\cli\formatters\friction-dashboard.ts:316:  <div class="generated">Generated ${new Date().toISOString().split("T")[0]}</div>
src\infrastructure\sources\memory-file-scanner.test.ts:22:        tempDir = await mkdtemp(join(tmpdir(), "memory-scanner-test-"));
src\presentation\cli\commands\export.ts:51:      process.exitCode = result.exitCode;
src\infrastructure\database\repositories\embedding-repository.test.ts:102:            const now = new Date().toISOString();
src\infrastructure\database\repositories\embedding-repository.test.ts:118:            const now = new Date().toISOString();
src\infrastructure\database\repositories\embedding-repository.test.ts:257:                ).run(rowids[0], new Date().toISOString());
src\infrastructure\database\repositories\embedding-repository.test.ts:277:            const now = new Date().toISOString();
src\infrastructure\database\repositories\embedding-repository.test.ts:300:            ).run(rowids[0], new Date().toISOString());
src\infrastructure\database\repositories\embedding-repository.test.ts:310:            ).run(rowids[0], new Date().toISOString());
src\infrastructure\database\repositories\embedding-repository.test.ts:320:            const now = new Date().toISOString();
src\infrastructure\database\repositories\embedding-repository.test.ts:372:            const now = new Date().toISOString();
src\infrastructure\sources\integration.test.ts:9:import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
src\infrastructure\sources\integration.test.ts:22:      rmSync(TEST_DIR, { recursive: true, force: true });
src\infrastructure\sources\integration.test.ts:40:    mkdirSync(project1Dir, { recursive: true });
src\infrastructure\sources\integration.test.ts:41:    mkdirSync(project2Dir, { recursive: true });
src\infrastructure\sources\integration.test.ts:42:    mkdirSync(subagentsDir, { recursive: true });
src\infrastructure\sources\integration.test.ts:47:    writeFileSync(join(project1Dir, "session-1.jsonl"), sessionContent);
src\infrastructure\sources\integration.test.ts:48:    writeFileSync(join(project1Dir, "session-2.jsonl"), sessionContent);
src\infrastructure\sources\integration.test.ts:49:    writeFileSync(join(project2Dir, "session-3.jsonl"), sessionContent);
src\infrastructure\sources\integration.test.ts:50:    writeFileSync(join(subagentsDir, "subagent-1.jsonl"), sessionContent);
src\infrastructure\sources\integration.test.ts:56:      rmSync(TEST_DIR, { recursive: true, force: true });
src\infrastructure\sources\integration.test.ts:155:      mkdirSync(emptyProjectDir, { recursive: true });
src\infrastructure\sources\integration.test.ts:170:      rmSync(emptyProjectDir, { recursive: true });
src\presentation\cli\commands\import.test.ts:8:import { mkdirSync, rmSync, existsSync } from "node:fs";
src\presentation\cli\commands\import.test.ts:21:const TEST_BASE = join(tmpdir(), `memory-nexus-import-cmd-test-${process.pid}`);
src\presentation\cli\commands\import.test.ts:35:    mkdirSync(testDir, { recursive: true });
src\presentation\cli\commands\import.test.ts:79:      rmSync(testDir, { recursive: true, force: true });
src\infrastructure\database\repositories\embedding-repository.ts:79:            const now = new Date().toISOString();
src\infrastructure\llm\claude-summary-generator.ts:25:      const env = { ...process.env };
src\infrastructure\llm\claude-summary-generator.ts:28:      const child = spawn("claude", ["-p", "--output-format", "text"], {
src\infrastructure\database\repositories\extraction-state-repository.test.ts:220:        completedAt: new Date(),
src\infrastructure\llm\claude-summary-generator.test.ts:54:    originalClaudeCode = process.env.CLAUDECODE;
src\infrastructure\llm\claude-summary-generator.test.ts:61:      process.env.CLAUDECODE = originalClaudeCode;
src\infrastructure\llm\claude-summary-generator.test.ts:63:      delete process.env.CLAUDECODE;
src\infrastructure\llm\claude-summary-generator.test.ts:113:    process.env.CLAUDECODE = "1";
src\application\services\temporal-decay.ts:46:    now: Date = new Date()
src\application\services\temporal-decay.ts:94:    now: Date = new Date()
src\presentation\cli\formatters\timestamp-formatter.test.ts:84:      const date = new Date(Date.now() - 60 * 1000); // 1 minute ago
src\presentation\cli\formatters\timestamp-formatter.test.ts:126:      const date = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
src\presentation\cli\formatters\timestamp-formatter.ts:36:  const ref = reference ?? new Date();
src\application\services\sync-service.ts:135:    const startTime = Date.now();
src\application\services\sync-service.ts:205:      startedAt: new Date().toISOString(),
src\application\services\sync-service.ts:242:          currentCheckpoint.lastCompletedAt = new Date().toISOString();
src\application\services\sync-service.ts:270:    result.durationMs = Date.now() - startTime;
src\application\services\sync-service.ts:430:      startedAt: new Date(),
src\application\services\sync-service.ts:449:        startTime: firstTimestamp ?? new Date(),
src\application\services\sync-service.ts:477:          .complete(new Date());
src\application\services\sync-service.test.ts:67:  const timestamp = new Date().toISOString();
src\application\services\sync-service.test.ts:234:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:250:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:273:        createMockSessionInfo("session-1", "C:\\Projects\\test1", new Date(), 1000),
src\application\services\sync-service.test.ts:274:        createMockSessionInfo("session-2", "C:\\Projects\\test2", new Date(), 2000),
src\application\services\sync-service.test.ts:294:        createMockSessionInfo("session-1", "C:\\Projects\\frontend", new Date(), 1000),
src\application\services\sync-service.test.ts:295:        createMockSessionInfo("session-2", "C:\\Projects\\backend", new Date(), 2000),
src\application\services\sync-service.test.ts:296:        createMockSessionInfo("session-3", "C:\\Projects\\frontend-app", new Date(), 3000),
src\application\services\sync-service.test.ts:315:        createMockSessionInfo("session-1", "C:\\Projects\\frontend", new Date(), 1000),
src\application\services\sync-service.test.ts:329:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:330:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
src\application\services\sync-service.test.ts:347:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:370:        startedAt: new Date(),
src\application\services\sync-service.test.ts:400:        startedAt: new Date(),
src\application\services\sync-service.test.ts:424:        startedAt: new Date(),
src\application\services\sync-service.test.ts:452:        startedAt: new Date(),
src\application\services\sync-service.test.ts:469:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:497:        startedAt: new Date(),
src\application\services\sync-service.test.ts:523:        startedAt: new Date(),
src\application\services\sync-service.test.ts:549:        startedAt: new Date(),
src\application\services\sync-service.test.ts:568:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:569:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
src\application\services\sync-service.test.ts:570:        createMockSessionInfo("session-3", "C:\\Projects\\test", new Date(), 3000),
src\application\services\sync-service.test.ts:598:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:599:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
src\application\services\sync-service.test.ts:628:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:629:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
src\application\services\sync-service.test.ts:666:        createMockSessionInfo("session-1", "C:\\Projects\\frontend", new Date(), 1000),
src\application\services\sync-service.test.ts:667:        createMockSessionInfo("session-2", "C:\\Projects\\backend", new Date(), 2000),
src\application\services\sync-service.test.ts:691:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:695:      const timestamp = new Date().toISOString();
src\application\services\sync-service.test.ts:741:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:745:      const timestamp = new Date().toISOString();
src\application\services\sync-service.test.ts:790:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:794:      const timestamp = new Date().toISOString();
src\application\services\sync-service.test.ts:818:        createMockSessionInfo("session-mc", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:822:      const timestamp = new Date().toISOString();
src\application\services\sync-service.test.ts:865:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:866:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
src\application\services\sync-service.test.ts:877:        startedAt: new Date().toISOString(),
src\application\services\sync-service.test.ts:881:        lastCompletedAt: new Date().toISOString(),
src\application\services\sync-service.test.ts:893:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:894:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
src\application\services\sync-service.test.ts:912:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:923:        startedAt: new Date().toISOString(),
src\application\services\sync-service.test.ts:938:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:939:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
src\application\services\sync-service.test.ts:965:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:976:        startedAt: new Date().toISOString(),
src\application\services\sync-service.test.ts:993:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:994:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
src\application\services\sync-service.test.ts:1016:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:1017:        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
src\application\services\sync-service.test.ts:1018:        createMockSessionInfo("session-3", "C:\\Projects\\test", new Date(), 3000),
src\application\services\sync-service.test.ts:1041:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:1061:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:1079:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:1098:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:1117:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.test.ts:1136:        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
src\application\services\sync-service.integration.test.ts:9:import { mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
src\application\services\sync-service.integration.test.ts:40:  mkdirSync(sessionDir, { recursive: true });
src\application\services\sync-service.integration.test.ts:44:  writeFileSync(jsonlPath, content);
src\application\services\sync-service.integration.test.ts:52:function createMinimalEvents(timestamp: string = new Date().toISOString()): object[] {
src\application\services\sync-service.integration.test.ts:56:      uuid: `user-${Date.now()}`,
src\application\services\sync-service.integration.test.ts:62:      uuid: `asst-${Date.now()}`,
src\application\services\sync-service.integration.test.ts:105:    tempDir = join(tmpdir(), `sync-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
src\application\services\sync-service.integration.test.ts:106:    mkdirSync(tempDir, { recursive: true });
src\application\services\sync-service.integration.test.ts:119:      rmSync(tempDir, { recursive: true, force: true });
src\application\services\sync-service.integration.test.ts:203:        uuid: `user-new-${Date.now()}`,
src\application\services\sync-service.integration.test.ts:205:        timestamp: new Date().toISOString(),
src\application\services\sync-service.integration.test.ts:236:        timestamp: new Date().toISOString(),
src\application\services\sync-service.integration.test.ts:368:      const timestamp = new Date().toISOString();
src\application\services\sync-service.integration.test.ts:396:      const timestamp = new Date().toISOString();
src\application\services\sync-service.integration.test.ts:461:          timestamp: new Date().toISOString(),
src\application\services\sync-service.integration.test.ts:531:      mkdirSync(sessionDir, { recursive: true });
src\application\services\sync-service.integration.test.ts:533:      writeFileSync(jsonlPath, "{ malformed json\n{\"type\": \"user\", \"uuid\": \"u1\", \"message\": {\"content\": \"Hi\"}, \"timestamp\": \"2024-01-01T00:00:00Z\"}");
src\application\services\sync-service.integration.test.ts:550:      mkdirSync(sessionDir, { recursive: true });
src\application\services\sync-service.integration.test.ts:551:      writeFileSync(join(sessionDir, "session-2.jsonl"), "not json at all");
src\application\services\sync-service.integration.test.ts:571:      mkdirSync(projectDir, { recursive: true });
src\application\services\sync-service.integration.test.ts:572:      writeFileSync(
src\application\services\sync-service.integration.test.ts:579:      mkdirSync(subagentDir, { recursive: true });
src\application\services\sync-service.integration.test.ts:580:      writeFileSync(
src\infrastructure\database\repositories\friction-repository.test.ts:115:                resolvedAt: new Date(),
src\infrastructure\database\repositories\friction-repository.test.ts:148:                resolvedAt: new Date(),
src\infrastructure\database\repositories\friction-repository.test.ts:232:                resolvedAt: new Date(),
src\infrastructure\database\repositories\friction-repository.test.ts:322:            const today = new Date();
src\application\services\smart-context-service.ts:157:        this.now = deps.now ?? (() => new Date());
src\infrastructure\database\repositories\friction-repository.ts:145:        ).run(resolution, new Date().toISOString(), id);
src\infrastructure\database\repositories\friction-repository.ts:250:        const now = new Date();
src\application\services\smart-context-service.test.ts:36:        id: Math.floor(Math.random() * 10000),
src\application\services\smart-context-service.test.ts:42:        lastIndexedAt: overrides.lastIndexedAt ?? new Date(),
src\application\services\smart-context-service.test.ts:56:        id: overrides.id ?? Math.floor(Math.random() * 10000),
src\application\services\smart-context-service.test.ts:64:        loggedAt: new Date(),
src\infrastructure\database\repositories\entity-repository.test.ts:204:        ["session-1", "C--Users-test", "C:\\Users\\test", "test", new Date().toISOString()]
src\infrastructure\database\repositories\entity-repository.test.ts:298:        ["session-1", "C--Users-test", "C:\\Users\\test", "test", new Date().toISOString()]
src\infrastructure\database\repositories\entity-repository.test.ts:465:        ["session-del", "C--Users-test", "C:\\Users\\test", "test", new Date().toISOString()]
src\infrastructure\database\repositories\session-repository.test.ts:242:            startTime: new Date(Date.now() - i * 1000),
src\infrastructure\database\repositories\session-repository.test.ts:403:          startTime: new Date(Date.now() - i * 1000),
src\infrastructure\database\repositories\session-repository.test.ts:540:          startTime: new Date(Date.now() - i * 1000),
src\infrastructure\database\repositories\session-repository.test.ts:1200:          startTime: new Date(Date.now() - i * 1000),
src\infrastructure\parsers\timestamp.ts:51:  return new Date().toISOString();
src\infrastructure\hooks\hook-runner.test.ts:5: * Uses dependency injection to verify spawn() arguments without
src\infrastructure\hooks\hook-runner.test.ts:10:import { mkdirSync, rmSync, existsSync } from "node:fs";
src\infrastructure\hooks\hook-runner.test.ts:37:            rmSync(testDir, { recursive: true, force: true });
src\infrastructure\hooks\hook-runner.test.ts:59:            mkdirSync(testDir, { recursive: true });
src\infrastructure\hooks\hook-runner.test.ts:67:            mkdirSync(testLogDir, { recursive: true });
src\infrastructure\hooks\hook-runner.test.ts:322:                `.memory-nexus-test-hook-extract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
src\infrastructure\hooks\hook-runner.test.ts:324:            mkdirSync(testDbDir, { recursive: true });
src\infrastructure\hooks\hook-runner.test.ts:337:            setTimeout(() => {
src\infrastructure\hooks\hook-runner.test.ts:340:                        rmSync(testDbDir, { recursive: true, force: true });
src\infrastructure\hooks\hook-runner.test.ts:363:                startTime: new Date(),
src\infrastructure\hooks\hook-runner.test.ts:373:                timestamp: new Date(),
src\infrastructure\hooks\hook-runner.test.ts:392:                startTime: new Date(),
src\infrastructure\hooks\hook-runner.test.ts:401:                timestamp: new Date(),
src\infrastructure\hooks\hook-runner.test.ts:419:                startTime: new Date(),
src\infrastructure\hooks\hook-runner.test.ts:428:                timestamp: new Date(),
src\infrastructure\hooks\hook-runner.test.ts:445:                startTime: new Date(),
src\infrastructure\hooks\hook-runner.test.ts:462:                startTime: new Date(),
src\infrastructure\hooks\hook-runner.test.ts:471:                timestamp: new Date(),
src\infrastructure\hooks\hook-runner.test.ts:484:        const originalEnv = process.env.MEMORY_HOOK;
src\infrastructure\hooks\hook-runner.test.ts:489:                delete process.env.MEMORY_HOOK;
src\infrastructure\hooks\hook-runner.test.ts:491:                process.env.MEMORY_HOOK = originalEnv;
src\infrastructure\hooks\hook-runner.test.ts:496:            process.env.MEMORY_HOOK = "1";
src\infrastructure\hooks\hook-runner.test.ts:501:            delete process.env.MEMORY_HOOK;
src\infrastructure\hooks\hook-runner.test.ts:506:            process.env.MEMORY_HOOK = "0";
src\infrastructure\hooks\hook-runner.test.ts:511:            process.env.MEMORY_HOOK = "";
src\infrastructure\signals\checkpoint-manager.ts:10:import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
src\infrastructure\signals\checkpoint-manager.ts:78:        mkdirSync(checkpointDir, { recursive: true });
src\infrastructure\signals\checkpoint-manager.ts:81:        writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + "\n");
src\infrastructure\signals\checkpoint-manager.ts:137:            unlinkSync(checkpointPath);
src\infrastructure\hooks\auto-memory-writer.ts:10:import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
src\infrastructure\hooks\auto-memory-writer.ts:71:        mkdirSync(autoMemoryDir, { recursive: true });
src\infrastructure\hooks\auto-memory-writer.ts:72:        writeFileSync(join(autoMemoryDir, "context.md"), content, "utf-8");
src\infrastructure\hooks\auto-memory-writer.ts:85:        mkdirSync(autoMemoryDir, { recursive: true });
src\infrastructure\hooks\auto-memory-writer.ts:90:            writeFileSync(memoryPath, block, "utf-8");
src\infrastructure\hooks\auto-memory-writer.ts:96:        writeFileSync(memoryPath, merged, "utf-8");
src\infrastructure\parsers\timestamp.test.ts:112:      const before = new Date();
src\infrastructure\parsers\timestamp.test.ts:114:      const after = new Date();
src\infrastructure\parsers\timestamp.test.ts:122:      const before = new Date();
src\infrastructure\parsers\timestamp.test.ts:124:      const after = new Date();
src\infrastructure\parsers\timestamp.test.ts:132:      const before = new Date();
src\infrastructure\parsers\timestamp.test.ts:134:      const after = new Date();
src\infrastructure\parsers\timestamp.test.ts:142:      const before = new Date();
src\infrastructure\parsers\timestamp.test.ts:144:      const after = new Date();
src\infrastructure\parsers\timestamp.test.ts:152:      const before = new Date();
src\infrastructure\parsers\timestamp.test.ts:154:      const after = new Date();
src\infrastructure\parsers\timestamp.test.ts:162:      const before = new Date();
src\infrastructure\parsers\timestamp.test.ts:164:      const after = new Date();
src\infrastructure\parsers\timestamp.test.ts:172:      const before = new Date();
src\infrastructure\parsers\timestamp.test.ts:174:      const after = new Date();
src\infrastructure\hooks\config-manager.ts:10:import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
src\infrastructure\hooks\config-manager.ts:327:    mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.ts:344:    writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n");
src\presentation\cli\commands\friction\list.ts:73:                const ageMs = Date.now() - entry.loggedAt.getTime();
src\infrastructure\signals\checkpoint-manager.test.ts:8:import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
src\infrastructure\signals\checkpoint-manager.test.ts:27:        testDir = join(tmpdir(), `memory-nexus-checkpoint-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
src\infrastructure\signals\checkpoint-manager.test.ts:28:        mkdirSync(testDir, { recursive: true });
src\infrastructure\signals\checkpoint-manager.test.ts:39:            rmSync(testDir, { recursive: true, force: true });
src\infrastructure\signals\checkpoint-manager.test.ts:151:            writeFileSync(testCheckpointFile, JSON.stringify(checkpoint));
src\infrastructure\signals\checkpoint-manager.test.ts:166:            writeFileSync(testCheckpointFile, "not valid json {{{");
src\infrastructure\signals\checkpoint-manager.test.ts:180:            writeFileSync(testCheckpointFile, JSON.stringify({ foo: "bar" }));
src\infrastructure\signals\checkpoint-manager.test.ts:193:            writeFileSync(
src\infrastructure\signals\checkpoint-manager.test.ts:281:                startedAt: new Date().toISOString(),
src\infrastructure\signals\checkpoint-manager.test.ts:293:            checkpoint.lastCompletedAt = new Date().toISOString();
src\infrastructure\hooks\log-writer.test.ts:8:import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, utimesSync } from "node:fs";
src\infrastructure\hooks\log-writer.test.ts:29:            tmpdir(),
src\infrastructure\hooks\log-writer.test.ts:30:            `log-writer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
src\infrastructure\hooks\log-writer.test.ts:32:        mkdirSync(testDir, { recursive: true });
src\infrastructure\hooks\log-writer.test.ts:35:        originalHome = process.env.HOME ?? "";
src\infrastructure\hooks\log-writer.test.ts:36:        process.env.HOME = testDir;
src\infrastructure\hooks\log-writer.test.ts:37:        process.env.USERPROFILE = testDir;
src\infrastructure\hooks\log-writer.test.ts:42:        process.env.HOME = originalHome;
src\infrastructure\hooks\log-writer.test.ts:43:        process.env.USERPROFILE = originalHome;
src\infrastructure\hooks\log-writer.test.ts:47:            rmSync(testDir, { recursive: true, force: true });
src\infrastructure\hooks\log-writer.test.ts:191:            mkdirSync(logDir, { recursive: true });
src\infrastructure\hooks\log-writer.test.ts:193:            writeFileSync(logPath, '{"level":"info","message":"old entry"}\n');
src\infrastructure\hooks\log-writer.test.ts:196:            const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
src\infrastructure\hooks\log-writer.test.ts:206:            const today = new Date().toISOString().split("T")[0];
src\infrastructure\hooks\log-writer.test.ts:214:            mkdirSync(logDir, { recursive: true });
src\infrastructure\hooks\log-writer.test.ts:216:            writeFileSync(logPath, '{"level":"info","message":"recent entry"}\n');
src\infrastructure\hooks\log-writer.test.ts:225:            const today = new Date().toISOString().split("T")[0];
src\infrastructure\hooks\log-writer.test.ts:243:            mkdirSync(logDir, { recursive: true });
src\infrastructure\hooks\log-writer.test.ts:245:            writeFileSync(logPath, '{"level":"info","message":"entry"}\n');
src\infrastructure\hooks\log-writer.test.ts:248:            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
src\infrastructure\hooks\log-writer.test.ts:263:            mkdirSync(logDir, { recursive: true });
src\infrastructure\hooks\log-writer.test.ts:270:            writeFileSync(logPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
src\infrastructure\hooks\log-writer.test.ts:287:            mkdirSync(logDir, { recursive: true });
src\infrastructure\hooks\log-writer.test.ts:297:            writeFileSync(logPath, content);
src\infrastructure\hooks\log-writer.test.ts:309:            mkdirSync(logDir, { recursive: true });
src\infrastructure\hooks\log-writer.test.ts:320:            writeFileSync(logPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
src\infrastructure\hooks\log-writer.test.ts:334:            mkdirSync(logDir, { recursive: true });
src\infrastructure\hooks\log-writer.test.ts:336:            writeFileSync(logPath, "");
src\infrastructure\hooks\log-writer.test.ts:344:            mkdirSync(logDir, { recursive: true });
src\infrastructure\hooks\log-writer.test.ts:346:            writeFileSync(logPath, "   \n   \n   ");
src\infrastructure\hooks\log-writer.test.ts:354:            mkdirSync(logDir, { recursive: true });
src\infrastructure\hooks\log-writer.test.ts:361:            writeFileSync(logPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
src\infrastructure\hooks\log-writer.test.ts:371:            mkdirSync(logDir, { recursive: true });
src\infrastructure\hooks\log-writer.test.ts:383:            writeFileSync(logPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
src\application\services\recovery-service.test.ts:26:    modifiedTime: new Date(),
src\application\services\recovery-service.test.ts:38:    startedAt: new Date(),
src\application\services\recovery-service.test.ts:40:    completedAt: new Date(),
src\application\services\recovery-service.test.ts:240:        startedAt: new Date(),
src\application\services\recovery-service.test.ts:257:        startedAt: new Date(),
src\infrastructure\hooks\auto-memory-writer.test.ts:9:import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
src\infrastructure\hooks\auto-memory-writer.test.ts:23:            tmpdir(),
src\infrastructure\hooks\auto-memory-writer.test.ts:24:            `auto-memory-writer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
src\infrastructure\hooks\auto-memory-writer.test.ts:26:        mkdirSync(dir, { recursive: true });
src\infrastructure\hooks\auto-memory-writer.test.ts:33:                rmSync(testDir, { recursive: true, force: true });
src\infrastructure\hooks\auto-memory-writer.test.ts:68:            writeFileSync(join(testDir, "context.md"), "old content", "utf-8");
src\infrastructure\hooks\auto-memory-writer.test.ts:96:            writeFileSync(join(testDir, "MEMORY.md"), existingContent, "utf-8");
src\infrastructure\hooks\auto-memory-writer.test.ts:127:            writeFileSync(join(testDir, "MEMORY.md"), existingContent, "utf-8");
src\infrastructure\hooks\auto-memory-writer.test.ts:154:            writeFileSync(join(testDir, "MEMORY.md"), existingContent, "utf-8");
src\infrastructure\hooks\auto-memory-writer.test.ts:168:            writeFileSync(join(testDir, "MEMORY.md"), "", "utf-8");
src\infrastructure\hooks\auto-memory-writer.test.ts:182:            writeFileSync(join(testDir, "MEMORY.md"), "content without newline at end", "utf-8");
src\infrastructure\hooks\config-manager.test.ts:8:import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
src\infrastructure\hooks\config-manager.test.ts:38:            tmpdir(),
src\infrastructure\hooks\config-manager.test.ts:39:            `config-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
src\infrastructure\hooks\config-manager.test.ts:41:        mkdirSync(testDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:44:        originalHome = process.env.HOME ?? "";
src\infrastructure\hooks\config-manager.test.ts:45:        process.env.HOME = testDir;
src\infrastructure\hooks\config-manager.test.ts:47:        process.env.USERPROFILE = testDir;
src\infrastructure\hooks\config-manager.test.ts:52:        process.env.HOME = originalHome;
src\infrastructure\hooks\config-manager.test.ts:53:        process.env.USERPROFILE = originalHome;
src\infrastructure\hooks\config-manager.test.ts:57:            rmSync(testDir, { recursive: true, force: true });
src\infrastructure\hooks\config-manager.test.ts:119:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:120:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:142:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:143:            writeFileSync(join(configDir, "config.json"), "{ invalid json }");
src\infrastructure\hooks\config-manager.test.ts:152:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:153:            writeFileSync(join(configDir, "config.json"), "not json at all");
src\infrastructure\hooks\config-manager.test.ts:162:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:163:            writeFileSync(join(configDir, "config.json"), "");
src\infrastructure\hooks\config-manager.test.ts:172:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:173:            writeFileSync(join(configDir, "config.json"), "{}");
src\infrastructure\hooks\config-manager.test.ts:209:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:210:            writeFileSync(join(configDir, "config.json"), JSON.stringify(customConfig));
src\infrastructure\hooks\config-manager.test.ts:299:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:300:            writeFileSync(join(configDir, "config.json"), "invalid json");
src\infrastructure\hooks\config-manager.test.ts:337:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:338:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:372:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:373:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:389:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:390:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:426:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:427:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:438:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:439:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:450:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:451:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:520:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:521:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:533:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:534:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:546:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:547:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:559:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:560:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:572:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:573:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:585:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:586:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:598:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:599:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:635:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:636:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:653:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:654:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:673:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:674:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:704:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:705:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:721:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:722:            writeFileSync(
src\infrastructure\hooks\config-manager.test.ts:734:            mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\config-manager.test.ts:735:            writeFileSync(
src\application\services\pattern-extractor.test.ts:23:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:39:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:59:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:75:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:91:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:107:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:128:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:135:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:142:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:161:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:184:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:191:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:202:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:209:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:230:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:237:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:245:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:318:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:325:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:332:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:352:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:359:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:367:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:374:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:394:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:401:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:427:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:434:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:441:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:448:          timestamp: new Date(),
src\application\services\pattern-extractor.test.ts:497:        { path: "/src/new.ts", operation: "Write", timestamp: new Date() },
src\application\services\pattern-extractor.test.ts:498:        { path: "/src/edit.ts", operation: "Edit", timestamp: new Date() },
src\application\services\pattern-extractor.test.ts:515:        { path: "/src/file.ts", operation: "Write", timestamp: new Date() },
src\infrastructure\hooks\hook-runner.ts:18:import { openSync, mkdirSync } from "node:fs";
src\infrastructure\hooks\hook-runner.ts:67:    mkdirSync(dir, { recursive: true });
src\infrastructure\hooks\hook-runner.ts:113:    const subprocess: ChildProcess = spawn(command, args, {
src\infrastructure\hooks\hook-runner.ts:116:        env: { ...process.env, MEMORY_HOOK: "1" },
src\infrastructure\hooks\hook-runner.ts:246:    return process.env.MEMORY_HOOK === "1";
src\infrastructure\database\repositories\tool-use-repository.test.ts:301:                    timestamp: new Date(),
src\infrastructure\database\repositories\tool-use-repository.test.ts:313:                    timestamp: new Date(Date.now() + i * 1000),
src\infrastructure\database\repositories\tool-use-repository.test.ts:333:                    timestamp: new Date(Date.now() + i * 100),
src\infrastructure\database\repositories\tool-use-repository.test.ts:352:                    timestamp: new Date(Date.now() + i * 100),
src\infrastructure\database\repositories\tool-use-repository.test.ts:380:                    timestamp: new Date(Date.now() + i * 1000),
src\infrastructure\database\repositories\tool-use-repository.test.ts:393:                        timestamp: new Date(Date.now() + (i + 10) * 1000),
src\infrastructure\database\repositories\tool-use-repository.test.ts:413:                    timestamp: new Date(Date.now() + i * 10),
src\infrastructure\migration.ts:16:    mkdirSync,
src\infrastructure\migration.ts:19:    rmSync,
src\infrastructure\migration.ts:21:    unlinkSync,
src\infrastructure\migration.ts:169:            unlinkSync(sidecarPath);
src\infrastructure\migration.ts:198:                rmSync(item.source, { recursive: true });
src\infrastructure\migration.ts:210:            rmSync(legacyDir, { recursive: true });
src\infrastructure\migration.ts:286:        mkdirSync(getConfigDir(), { recursive: true });
src\infrastructure\migration.ts:287:        mkdirSync(getDataDir(), { recursive: true });
src\infrastructure\migration.ts:318:                unlinkSync(item.source);
src\infrastructure\migration.ts:402:    mkdirSync(destParent, { recursive: true });
src\infrastructure\migration.ts:412:                rmSync(source, { recursive: true });
src\infrastructure\migration.ts:415:                unlinkSync(source);
src\presentation\cli\commands\friction\index.ts:40:                process.exitCode = result.exitCode;
src\presentation\cli\commands\friction\index.ts:55:                process.exitCode = result.exitCode;
src\presentation\cli\commands\friction\index.ts:67:                process.exitCode = result.exitCode;
src\presentation\cli\commands\friction\index.ts:79:                process.exitCode = result.exitCode;
src\presentation\cli\commands\friction\index.ts:91:                process.exitCode = result.exitCode;
src\presentation\cli\commands\friction\index.ts:104:                process.exitCode = result.exitCode;
src\application\services\memory-file-sync-service.ts:101:          lastIndexedAt: new Date(),
src\infrastructure\hooks\log-writer.ts:17:    mkdirSync,
src\infrastructure\hooks\log-writer.ts:112:        mkdirSync(logDir, { recursive: true });
src\infrastructure\hooks\log-writer.ts:116:            timestamp: new Date().toISOString(),
src\infrastructure\hooks\log-writer.ts:147:        const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
src\infrastructure\hooks\log-writer.ts:150:            const archiveDate = new Date().toISOString().split("T")[0];
src\presentation\cli\commands\friction\dashboard.ts:9:import { mkdirSync, writeFileSync } from "node:fs";
src\presentation\cli\commands\friction\dashboard.ts:41:        mkdirSync(memoryDir, { recursive: true });
src\presentation\cli\commands\friction\dashboard.ts:43:        writeFileSync(dashboardPath, html, "utf-8");
src\infrastructure\migration.test.ts:10:    mkdirSync,
src\infrastructure\migration.test.ts:13:    rmSync,
src\infrastructure\migration.test.ts:15:    writeFileSync,
src\infrastructure\migration.test.ts:45:        testDir = mkdtempSync(join(tmpdir(), "memory-migration-test-"));
src\infrastructure\migration.test.ts:51:        originalHome = process.env.HOME;
src\infrastructure\migration.test.ts:52:        process.env.HOME = testDir;
src\infrastructure\migration.test.ts:53:        process.env.USERPROFILE = testDir;
src\infrastructure\migration.test.ts:62:            process.env.HOME = originalHome;
src\infrastructure\migration.test.ts:63:            process.env.USERPROFILE = originalHome;
src\infrastructure\migration.test.ts:70:            rmSync(testDir, { recursive: true, force: true });
src\infrastructure\migration.test.ts:85:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:94:            mkdirSync(configDir, { recursive: true });
src\infrastructure\migration.test.ts:95:            mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:104:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:105:            mkdirSync(configDir, { recursive: true });
src\infrastructure\migration.test.ts:106:            mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:132:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:133:            writeFileSync(join(legacyDir, "memory.db"), "fake-database-content");
src\infrastructure\migration.test.ts:156:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:157:            writeFileSync(join(legacyDir, "config.json"), '{"autoSync":true}');
src\infrastructure\migration.test.ts:180:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:181:            writeFileSync(join(legacyDir, "sync-checkpoint.json"), '{"totalSessions":10}');
src\infrastructure\migration.test.ts:204:            mkdirSync(legacyLogs, { recursive: true });
src\infrastructure\migration.test.ts:205:            writeFileSync(join(legacyLogs, "sync.log"), "log entry\n");
src\infrastructure\migration.test.ts:228:            mkdirSync(legacyHooks, { recursive: true });
src\infrastructure\migration.test.ts:229:            writeFileSync(join(legacyHooks, "sync-hook.js"), "// hook script");
src\infrastructure\migration.test.ts:252:            mkdirSync(legacyBackups, { recursive: true });
src\infrastructure\migration.test.ts:253:            writeFileSync(join(legacyBackups, "settings.json.backup"), "{}");
src\infrastructure\migration.test.ts:275:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:276:            writeFileSync(join(legacyDir, "memory.db"), "db");
src\infrastructure\migration.test.ts:277:            writeFileSync(join(legacyDir, "config.json"), "{}");
src\infrastructure\migration.test.ts:278:            writeFileSync(join(legacyDir, "sync-checkpoint.json"), "{}");
src\infrastructure\migration.test.ts:279:            mkdirSync(join(legacyDir, "logs"), { recursive: true });
src\infrastructure\migration.test.ts:280:            mkdirSync(join(legacyDir, "hooks"), { recursive: true });
src\infrastructure\migration.test.ts:281:            mkdirSync(join(legacyDir, "backups"), { recursive: true });
src\infrastructure\migration.test.ts:307:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:308:            writeFileSync(join(legacyDir, "memory.db"), "db-only");
src\infrastructure\migration.test.ts:332:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:333:            writeFileSync(join(legacyDir, "memory.db"), "db");
src\infrastructure\migration.test.ts:353:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:354:            writeFileSync(join(legacyDir, "memory.db"), "db");
src\infrastructure\migration.test.ts:377:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:378:            writeFileSync(join(legacyDir, "memory.db"), "db");
src\infrastructure\migration.test.ts:402:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:403:            writeFileSync(join(legacyDir, "memory.db"), "db-content");
src\infrastructure\migration.test.ts:404:            writeFileSync(join(legacyDir, "config.json"), "config-content");
src\infrastructure\migration.test.ts:408:            mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:412:            rmSync(configParent, { recursive: true, force: true });
src\infrastructure\migration.test.ts:413:            writeFileSync(configParent, "blocker-file");
src\infrastructure\migration.test.ts:437:            rmSync(configParent, { force: true });
src\infrastructure\migration.test.ts:441:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:442:            writeFileSync(join(legacyDir, "memory.db"), "db-to-rollback");
src\infrastructure\migration.test.ts:443:            writeFileSync(join(legacyDir, "config.json"), "config-to-fail");
src\infrastructure\migration.test.ts:446:            //   call 1: mkdirSync ensureParent for memory.db dest (no rename)
src\infrastructure\migration.test.ts:448:            //   call 3: mkdirSync ensureParent for config.json dest (no rename)
src\infrastructure\migration.test.ts:487:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:488:            writeFileSync(join(legacyDir, "memory.db"), "db-data");
src\infrastructure\migration.test.ts:489:            writeFileSync(join(legacyDir, "config.json"), "config-data");
src\infrastructure\migration.test.ts:525:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:526:            writeFileSync(join(legacyDir, "memory.db"), "db");
src\infrastructure\migration.test.ts:527:            writeFileSync(join(legacyDir, "config.json"), "{}");
src\infrastructure\migration.test.ts:551:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:553:            writeFileSync(join(legacyDir, "unknown-file.txt"), "unknown");
src\infrastructure\migration.test.ts:565:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:566:            writeFileSync(join(legacyDir, "memory.db"), "db");
src\infrastructure\migration.test.ts:567:            writeFileSync(join(legacyDir, "extra-unknown.txt"), "unknown");
src\infrastructure\migration.test.ts:589:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:590:            writeFileSync(join(legacyDir, "memory.db"), "db");
src\infrastructure\migration.test.ts:614:                mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:616:                writeFileSync(join(legacyDir, "memory.db"), legacyContent);
src\infrastructure\migration.test.ts:618:                mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:620:                writeFileSync(join(dataDir, "memory.db"), stubContent);
src\infrastructure\migration.test.ts:648:                mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:649:                writeFileSync(join(legacyDir, "memory.db"), Buffer.alloc(100, 0x01));
src\infrastructure\migration.test.ts:651:                mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:653:                writeFileSync(join(dataDir, "memory.db"), xdgContent);
src\infrastructure\migration.test.ts:681:                mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:682:                writeFileSync(join(legacyDir, "memory.db"), Buffer.alloc(500, 0xAA));
src\infrastructure\migration.test.ts:684:                mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:686:                writeFileSync(join(dataDir, "memory.db"), xdgContent);
src\infrastructure\migration.test.ts:711:                mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:712:                writeFileSync(join(legacyDir, "memory.db"), Buffer.alloc(1000, 0x42));
src\infrastructure\migration.test.ts:714:                mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:715:                writeFileSync(join(dataDir, "memory.db"), Buffer.alloc(100, 0x00));
src\infrastructure\migration.test.ts:716:                writeFileSync(join(dataDir, "memory.db-wal"), Buffer.alloc(50, 0x01));
src\infrastructure\migration.test.ts:717:                writeFileSync(join(dataDir, "memory.db-shm"), Buffer.alloc(32, 0x02));
src\infrastructure\migration.test.ts:739:                mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:740:                writeFileSync(join(legacyDir, "memory.db"), Buffer.alloc(100, 0x01));
src\infrastructure\migration.test.ts:742:                mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:743:                writeFileSync(join(dataDir, "memory.db"), Buffer.alloc(1000, 0x02));
src\infrastructure\migration.test.ts:744:                writeFileSync(join(dataDir, "memory.db-wal"), Buffer.alloc(50, 0x03));
src\infrastructure\migration.test.ts:764:                mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:765:                writeFileSync(join(legacyDir, "memory.db"), Buffer.alloc(100, 0x01));
src\infrastructure\migration.test.ts:766:                writeFileSync(join(legacyDir, "memory.db-wal"), Buffer.alloc(50, 0x03));
src\infrastructure\migration.test.ts:767:                writeFileSync(join(legacyDir, "memory.db-shm"), Buffer.alloc(32, 0x04));
src\infrastructure\migration.test.ts:769:                mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:770:                writeFileSync(join(dataDir, "memory.db"), Buffer.alloc(1000, 0x02));
src\infrastructure\migration.test.ts:794:                mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:795:                writeFileSync(join(legacyDir, "memory.db"), Buffer.alloc(1000, 0x42));
src\infrastructure\migration.test.ts:796:                writeFileSync(join(legacyDir, "memory.db-wal"), Buffer.alloc(50, 0x03));
src\infrastructure\migration.test.ts:797:                writeFileSync(join(legacyDir, "memory.db-shm"), Buffer.alloc(32, 0x04));
src\infrastructure\migration.test.ts:820:                mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:821:                writeFileSync(join(legacyDir, "memory.db"), "db");
src\infrastructure\migration.test.ts:822:                mkdirSync(join(legacyDir, "logs"), { recursive: true });
src\infrastructure\migration.test.ts:823:                writeFileSync(join(legacyDir, "logs", "sync.log"), "log-data");
src\infrastructure\migration.test.ts:824:                mkdirSync(join(legacyDir, "hooks"), { recursive: true });
src\infrastructure\migration.test.ts:825:                writeFileSync(join(legacyDir, "hooks", "sync-hook.js"), "hook-data");
src\infrastructure\migration.test.ts:826:                mkdirSync(join(legacyDir, "backups"), { recursive: true });
src\infrastructure\migration.test.ts:827:                writeFileSync(join(legacyDir, "backups", "settings.json.backup"), "backup-data");
src\infrastructure\migration.test.ts:830:                mkdirSync(join(dataDir, "logs"), { recursive: true });
src\infrastructure\migration.test.ts:831:                mkdirSync(join(dataDir, "hooks"), { recursive: true });
src\infrastructure\migration.test.ts:832:                mkdirSync(join(dataDir, "backups"), { recursive: true });
src\infrastructure\migration.test.ts:858:                mkdirSync(legacyLogs, { recursive: true });
src\infrastructure\migration.test.ts:859:                writeFileSync(join(legacyLogs, "sync.log"), "legacy-log-entry");
src\infrastructure\migration.test.ts:862:                mkdirSync(xdgLogs, { recursive: true });
src\infrastructure\migration.test.ts:863:                writeFileSync(join(xdgLogs, "other.log"), "xdg-log-entry");
src\infrastructure\migration.test.ts:892:                mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:893:                writeFileSync(join(legacyDir, "memory.db"), Buffer.alloc(1000, 0x42));
src\infrastructure\migration.test.ts:894:                writeFileSync(join(legacyDir, "config.json"), '{"autoSync":true}');
src\infrastructure\migration.test.ts:895:                mkdirSync(join(legacyDir, "logs"), { recursive: true });
src\infrastructure\migration.test.ts:896:                writeFileSync(join(legacyDir, "logs", "sync.log"), "log");
src\infrastructure\migration.test.ts:899:                mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:900:                writeFileSync(join(dataDir, "memory.db"), Buffer.alloc(100, 0x00));
src\infrastructure\migration.test.ts:901:                mkdirSync(join(dataDir, "logs"), { recursive: true });
src\infrastructure\migration.test.ts:929:                mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:930:                writeFileSync(join(legacyDir, "memory.db"), Buffer.alloc(1000, 0x42));
src\infrastructure\migration.test.ts:932:                mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:933:                writeFileSync(join(dataDir, "memory.db"), Buffer.alloc(100, 0x00));
src\infrastructure\migration.test.ts:961:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:962:            writeFileSync(join(legacyDir, "memory.db"), Buffer.alloc(1000, 0x42));
src\infrastructure\migration.test.ts:969:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:970:            writeFileSync(join(legacyDir, "memory.db"), Buffer.alloc(1000, 0x42));
src\infrastructure\migration.test.ts:972:            mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:973:            writeFileSync(join(dataDir, "memory.db"), Buffer.alloc(100, 0x00));
src\infrastructure\migration.test.ts:984:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:985:            writeFileSync(join(legacyDir, "config.json"), '{}');
src\infrastructure\migration.test.ts:992:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:993:            writeFileSync(join(legacyDir, "memory.db"), Buffer.alloc(100, 0x01));
src\infrastructure\migration.test.ts:995:            mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:996:            writeFileSync(join(dataDir, "memory.db"), Buffer.alloc(1000, 0x02));
src\infrastructure\migration.test.ts:1002:            mkdirSync(legacyDir, { recursive: true });
src\infrastructure\migration.test.ts:1003:            writeFileSync(join(legacyDir, "memory.db"), Buffer.alloc(500, 0xAA));
src\infrastructure\migration.test.ts:1005:            mkdirSync(dataDir, { recursive: true });
src\infrastructure\migration.test.ts:1006:            writeFileSync(join(dataDir, "memory.db"), Buffer.alloc(500, 0xBB));
src\infrastructure\migration.test.ts:1016:            writeFileSync(src, "file-content");
src\infrastructure\migration.test.ts:1028:            mkdirSync(srcDir, { recursive: true });
src\infrastructure\migration.test.ts:1029:            writeFileSync(join(srcDir, "inner.txt"), "inner-content");
src\infrastructure\migration.test.ts:1041:            writeFileSync(src, "exdev-content");
src\infrastructure\migration.test.ts:1062:            mkdirSync(srcDir, { recursive: true });
src\infrastructure\migration.test.ts:1063:            writeFileSync(join(srcDir, "data.txt"), "dir-data");
src\infrastructure\hooks\settings-manager.test.ts:11:    mkdirSync,
src\infrastructure\hooks\settings-manager.test.ts:13:    rmSync,
src\infrastructure\hooks\settings-manager.test.ts:14:    writeFileSync,
src\infrastructure\hooks\settings-manager.test.ts:42:            rmSync(testBaseDir, { recursive: true, force: true });
src\infrastructure\hooks\settings-manager.test.ts:44:        mkdirSync(testBaseDir, { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:60:            rmSync(testBaseDir, { recursive: true, force: true });
src\infrastructure\hooks\settings-manager.test.ts:106:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:107:            writeFileSync(
src\infrastructure\hooks\settings-manager.test.ts:117:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:118:            writeFileSync(testSettingsPath, "not valid json");
src\infrastructure\hooks\settings-manager.test.ts:132:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:133:            writeFileSync(
src\infrastructure\hooks\settings-manager.test.ts:145:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:147:            writeFileSync(testSettingsPath, JSON.stringify(originalSettings));
src\infrastructure\hooks\settings-manager.test.ts:163:            mkdirSync(dirname(testBackupPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:165:            writeFileSync(testBackupPath, JSON.stringify(backupData));
src\infrastructure\hooks\settings-manager.test.ts:177:            mkdirSync(dirname(testBackupPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:178:            writeFileSync(testBackupPath, JSON.stringify({ test: true }));
src\infrastructure\hooks\settings-manager.test.ts:200:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:201:            writeFileSync(
src\infrastructure\hooks\settings-manager.test.ts:214:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:215:            writeFileSync(
src\infrastructure\hooks\settings-manager.test.ts:273:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:274:            writeFileSync(
src\infrastructure\hooks\settings-manager.test.ts:305:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:306:            writeFileSync(
src\infrastructure\hooks\settings-manager.test.ts:327:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:328:            writeFileSync(testSettingsPath, JSON.stringify({}));
src\infrastructure\hooks\settings-manager.test.ts:365:            mkdirSync(dirname(testHookScriptPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:366:            writeFileSync(testHookScriptPath, "// hook script");
src\infrastructure\hooks\settings-manager.test.ts:374:            mkdirSync(dirname(testBackupPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:375:            writeFileSync(testBackupPath, JSON.stringify({}));
src\infrastructure\hooks\settings-manager.test.ts:383:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.test.ts:384:            writeFileSync(
src\infrastructure\hooks\settings-manager.ts:18:    mkdirSync,
src\infrastructure\hooks\settings-manager.ts:20:    writeFileSync,
src\infrastructure\hooks\settings-manager.ts:190:    mkdirSync(dirname(backupPath), { recursive: true });
src\infrastructure\hooks\settings-manager.ts:215:    mkdirSync(dirname(settingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.ts:283:    mkdirSync(dirname(settingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.ts:284:    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
src\infrastructure\hooks\settings-manager.ts:338:    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
src\application\services\memory-file-sync-service.test.ts:49:    lastIndexedAt: overrides.lastIndexedAt ?? new Date(),
src\infrastructure\parsers\jsonl-parser.test.ts:9:import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
src\infrastructure\parsers\jsonl-parser.test.ts:17:  const testDir = join(tmpdir(), "jsonl-parser-test-" + Date.now());
src\infrastructure\parsers\jsonl-parser.test.ts:20:    mkdirSync(testDir, { recursive: true });
src\infrastructure\parsers\jsonl-parser.test.ts:25:      rmSync(testDir, { recursive: true });
src\infrastructure\parsers\jsonl-parser.test.ts:34:    writeFileSync(filePath, lines.join("\n"));
src\infrastructure\parsers\integration.test.ts:9:import { mkdirSync, rmSync, existsSync } from "fs";
src\infrastructure\parsers\integration.test.ts:28:      mkdirSync(SCRATCHPAD, { recursive: true });
src\infrastructure\parsers\integration.test.ts:35:      rmSync(SCRATCHPAD, { recursive: true, force: true });
src\infrastructure\paths.test.ts:34:        savedXdgConfigHome = process.env.XDG_CONFIG_HOME;
src\infrastructure\paths.test.ts:35:        savedXdgDataHome = process.env.XDG_DATA_HOME;
src\infrastructure\paths.test.ts:36:        delete process.env.XDG_CONFIG_HOME;
src\infrastructure\paths.test.ts:37:        delete process.env.XDG_DATA_HOME;
src\infrastructure\paths.test.ts:43:            process.env.XDG_CONFIG_HOME = savedXdgConfigHome;
src\infrastructure\paths.test.ts:45:            delete process.env.XDG_CONFIG_HOME;
src\infrastructure\paths.test.ts:48:            process.env.XDG_DATA_HOME = savedXdgDataHome;
src\infrastructure\paths.test.ts:50:            delete process.env.XDG_DATA_HOME;
src\infrastructure\paths.test.ts:62:            process.env.XDG_CONFIG_HOME = "/custom/config";
src\infrastructure\paths.test.ts:75:            process.env.XDG_DATA_HOME = "/custom/data";
src\infrastructure\paths.test.ts:83:            process.env.XDG_CONFIG_HOME = "/custom/config";
src\infrastructure\paths.test.ts:89:            process.env.XDG_DATA_HOME = "/custom/data";
src\infrastructure\paths.test.ts:95:            process.env.XDG_CONFIG_HOME = "/custom/config";
src\infrastructure\paths.test.ts:96:            process.env.XDG_DATA_HOME = "/custom/data";
src\infrastructure\paths.test.ts:109:            process.env.XDG_CONFIG_HOME = "/custom/config";
src\infrastructure\paths.test.ts:115:            process.env.XDG_DATA_HOME = "/custom/data";
src\infrastructure\paths.test.ts:153:            process.env.XDG_CONFIG_HOME = "/xdg/config";
src\infrastructure\paths.test.ts:154:            process.env.XDG_DATA_HOME = "/xdg/data";
src\infrastructure\paths.test.ts:207:            process.env.XDG_CONFIG_HOME = "/xdg/config";
src\infrastructure\paths.test.ts:236:            process.env.XDG_CONFIG_HOME = "/custom/config";
src\infrastructure\paths.test.ts:241:            process.env.XDG_DATA_HOME = "/custom/data";
src\infrastructure\hooks\sync-hook-script.test.ts:15:import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
src\infrastructure\hooks\sync-hook-script.test.ts:36:        const child = spawn("bun", ["run", HOOK_SCRIPT], {
src\infrastructure\hooks\sync-hook-script.test.ts:38:                ...process.env,
src\infrastructure\hooks\sync-hook-script.test.ts:76:            tmpdir(),
src\infrastructure\hooks\sync-hook-script.test.ts:77:            `sync-hook-script-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
src\infrastructure\hooks\sync-hook-script.test.ts:80:        mkdirSync(configDir, { recursive: true });
src\infrastructure\hooks\sync-hook-script.test.ts:86:                rmSync(testDir, { recursive: true, force: true });
src\infrastructure\hooks\sync-hook-script.test.ts:97:        writeFileSync(
src\presentation\cli\commands\purge.ts:89:  const now = new Date();
src\presentation\cli\commands\purge.ts:178:      process.exitCode = result.exitCode;
src\application\services\export-service.test.ts:10:import { mkdirSync, rmSync, existsSync } from "node:fs";
src\application\services\export-service.test.ts:23:const TEST_DIR = join(tmpdir(), "memory-nexus-export-test");
src\application\services\export-service.test.ts:31:    rmSync(TEST_DIR, { recursive: true, force: true });
src\application\services\export-service.test.ts:32:    mkdirSync(TEST_DIR, { recursive: true });
src\application\services\export-service.test.ts:43:    rmSync(TEST_DIR, { recursive: true, force: true });
src\application\services\export-service.test.ts:99:      const beforeExport = new Date();
src\application\services\export-service.test.ts:101:      const afterExport = new Date();
src\application\services\export-service.test.ts:327:        exportedAt: new Date().toISOString(),
src\infrastructure\paths.ts:64:    const xdgConfig = process.env.XDG_CONFIG_HOME;
src\infrastructure\paths.ts:87:    const xdgData = process.env.XDG_DATA_HOME;
src\application\services\backfill-service.ts:163:            backfilledAt: new Date(),
src\application\services\backfill-service.ts:180:            backfilledAt: new Date(),
src\application\services\friction-service.test.ts:22:import { existsSync, writeFileSync, mkdtempSync, unlinkSync, readFileSync } from "node:fs";
src\application\services\friction-service.test.ts:110:                resolvedAt: new Date(),
src\application\services\friction-service.test.ts:451:            tempDir = mkdtempSync(join(tmpdir(), "friction-ingest-"));
src\application\services\friction-service.test.ts:461:            writeFileSync(filePath, lines.join("\n") + "\n");
src\application\services\friction-service.test.ts:471:            writeFileSync(
src\application\services\friction-service.test.ts:491:            writeFileSync(
src\application\services\friction-service.test.ts:504:            writeFileSync(
src\application\services\friction-service.test.ts:522:            writeFileSync(filePath, lines.join("\n") + "\n");
src\application\services\friction-service.test.ts:539:            writeFileSync(
src\application\services\friction-service.test.ts:544:            // Pre-delete the file so unlinkSync will fail
src\application\services\friction-service.test.ts:545:            unlinkSync(filePath);
src\application\services\friction-service.test.ts:551:            // already tested above. For the failure path, mock unlinkSync behavior
src\application\services\friction-service.test.ts:553:            writeFileSync(filePath, '{"tool":"aidev","severity":"high","description":"desc","project":"gsd","date":"2026-03-08"}\n');
src\application\services\friction-service.test.ts:557:            // is hard to test portably. The code wraps unlinkSync in try/catch.
src\application\services\ambient-context-service.ts:132:        const today = new Date().toISOString().split("T")[0];
src\presentation\cli\commands\purge.test.ts:96:      const now = new Date();
src\presentation\cli\commands\purge.test.ts:105:      const now = new Date();
src\presentation\cli\commands\purge.test.ts:113:      const now = new Date();
src\presentation\cli\commands\purge.test.ts:123:      const now = new Date();
src\presentation\cli\commands\purge.test.ts:132:      const now = new Date();
src\presentation\cli\commands\purge.test.ts:142:      const now = new Date();
src\presentation\cli\commands\purge.test.ts:150:      const now = new Date();
src\presentation\cli\commands\purge.test.ts:160:      const now = new Date();
src\presentation\cli\commands\purge.test.ts:168:      const now = new Date();
src\presentation\cli\commands\purge.test.ts:176:      const now = new Date();
src\presentation\cli\commands\purge.test.ts:241:    testDir = path.join(os.tmpdir(), `purge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
src\presentation\cli\commands\purge.test.ts:242:    fs.mkdirSync(testDir, { recursive: true });
src\presentation\cli\commands\purge.test.ts:276:      fs.rmSync(testDir, { recursive: true, force: true });
src\application\services\embedding-service.ts:165:        const startTime = Date.now();
src\application\services\embedding-service.ts:197:        const durationMs = Date.now() - startTime;
src\application\services\export-service.ts:277:    exportedAt: new Date().toISOString(),
src\application\services\friction-service.ts:16:import { existsSync, readFileSync, unlinkSync } from "node:fs";
src\application\services\friction-service.ts:81:            loggedAt: params.loggedAt ?? new Date(),
src\application\services\friction-service.ts:241:                        : new Date(),
src\application\services\friction-service.ts:252:            unlinkSync(fallbackPath);
src\application\services\friction-service.ts:278:        await this.repository.markReviewed(tool, new Date());
src\application\services\llm-extractor.test.ts:23:      id: id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
src\application\services\llm-extractor.test.ts:26:      timestamp: new Date(),
src\application\services\backfill-service.test.ts:152:          backfilledAt: new Date(),
src\application\services\backfill-service.test.ts:201:          backfilledAt: new Date(),
src\application\services\backfill-service.test.ts:399:          backfilledAt: new Date(),
src\application\services\backfill-service.test.ts:575:            backfilledAt: new Date(),
src\presentation\cli\commands\list.ts:92:      process.exitCode = result.exitCode;
src\presentation\cli\commands\list.ts:121:    const now = new Date();
src\application\services\embedding-service.test.ts:409:                await new Promise(r => setTimeout(r, 10));
src\presentation\cli\commands\install.test.ts:11:    mkdirSync,
src\presentation\cli\commands\install.test.ts:13:    rmSync,
src\presentation\cli\commands\install.test.ts:14:    writeFileSync,
src\presentation\cli\commands\install.test.ts:44:            rmSync(testBaseDir, { recursive: true, force: true });
src\presentation\cli\commands\install.test.ts:46:        mkdirSync(testBaseDir, { recursive: true });
src\presentation\cli\commands\install.test.ts:49:        mkdirSync(mockHookScriptDir, { recursive: true });
src\presentation\cli\commands\install.test.ts:50:        writeFileSync(mockHookScriptPath, "// mock hook script");
src\presentation\cli\commands\install.test.ts:84:            rmSync(testBaseDir, { recursive: true, force: true });
src\presentation\cli\commands\install.test.ts:132:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\presentation\cli\commands\install.test.ts:133:            writeFileSync(
src\presentation\cli\commands\install.test.ts:148:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\presentation\cli\commands\install.test.ts:149:            writeFileSync(
src\presentation\cli\commands\install.test.ts:175:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\presentation\cli\commands\install.test.ts:176:            writeFileSync(
src\presentation\cli\commands\install.test.ts:213:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\presentation\cli\commands\install.test.ts:214:            writeFileSync(testSettingsPath, JSON.stringify({}));
src\presentation\cli\commands\install.ts:10:import { copyFileSync, existsSync, mkdirSync } from "node:fs";
src\presentation\cli\commands\install.ts:53:            process.exitCode = result.exitCode;
src\presentation\cli\commands\install.ts:79:    mkdirSync(dirname(hookScriptDest), { recursive: true });
src\presentation\cli\commands\import.ts:58:      process.exitCode = result.exitCode;
src\presentation\cli\commands\show.ts:87:      process.exitCode = result.exitCode;
src\presentation\cli\commands\search.test.ts:9:import { mkdtempSync, rmSync } from "fs";
src\presentation\cli\commands\search.test.ts:335:      searchTempDir = mkdtempSync(join(tmpdir(), "search-test-"));
src\presentation\cli\commands\search.test.ts:342:      try { rmSync(searchTempDir, { recursive: true, force: true }); } catch {}
src\presentation\cli\commands\search.test.ts:995:        createMockResult("Using <mark>process.env</mark> variable", "m1"),
src\presentation\cli\commands\search.test.ts:999:      const filtered = filterCaseSensitive(results, "process.env", 10);
src\presentation\cli\commands\search.test.ts:1033:      const errTempDir = mkdtempSync(join(tmpdir(), "search-err-test-"));
src\presentation\cli\commands\search.test.ts:1041:        try { rmSync(errTempDir, { recursive: true, force: true }); } catch {}
src\presentation\cli\commands\related.test.ts:8:import { mkdtempSync, rmSync } from "fs";
src\presentation\cli\commands\related.test.ts:223:    tempDir = mkdtempSync(join(tmpdir(), "related-test-"));
src\presentation\cli\commands\related.test.ts:232:    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
src\presentation\cli\commands\search.ts:170:      process.exitCode = result.exitCode;
src\presentation\cli\commands\search.ts:252:      const now = new Date();
src\presentation\cli\commands\status.test.ts:11:    mkdirSync,
src\presentation\cli\commands\status.test.ts:12:    rmSync,
src\presentation\cli\commands\status.test.ts:13:    writeFileSync,
src\presentation\cli\commands\status.test.ts:66:            rmSync(testBaseDir, { recursive: true, force: true });
src\presentation\cli\commands\status.test.ts:68:        mkdirSync(testBaseDir, { recursive: true });
src\presentation\cli\commands\status.test.ts:100:                rmSync(testBaseDir, { recursive: true, force: true });
src\presentation\cli\commands\status.test.ts:119:            mkdirSync(dirname(testHookScriptPath), { recursive: true });
src\presentation\cli\commands\status.test.ts:120:            writeFileSync(testHookScriptPath, "// hook script");
src\presentation\cli\commands\status.test.ts:136:            mkdirSync(dirname(testConfigPath), { recursive: true });
src\presentation\cli\commands\status.test.ts:137:            writeFileSync(testConfigPath, JSON.stringify({
src\presentation\cli\commands\status.test.ts:164:            const isolatedDir = join(tmpdir(), `memory-status-embed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
src\presentation\cli\commands\status.test.ts:165:            mkdirSync(isolatedDir, { recursive: true });
src\presentation\cli\commands\status.test.ts:173:                startedAt: new Date().toISOString(),
src\presentation\cli\commands\status.test.ts:218:                    rmSync(isolatedDir, { recursive: true, force: true });
src\presentation\cli\commands\status.test.ts:405:            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
src\presentation\cli\commands\status.test.ts:470:            const now = new Date().toISOString();
src\presentation\cli\commands\status.test.ts:475:            const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
src\presentation\cli\commands\status.test.ts:480:            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
src\presentation\cli\commands\status.test.ts:485:            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
src\presentation\cli\commands\show.test.ts:27:const TEST_DIR = path.join(os.tmpdir(), `memory-nexus-show-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
src\presentation\cli\commands\show.test.ts:101:      fs.mkdirSync(TEST_DIR, { recursive: true });
src\presentation\cli\commands\show.test.ts:122:        fs.rmSync(TEST_DIR, { recursive: true, force: true });
src\presentation\cli\commands\related.ts:102:      process.exitCode = result.exitCode;
src\presentation\cli\commands\uninstall.test.ts:11:    mkdirSync,
src\presentation\cli\commands\uninstall.test.ts:13:    rmSync,
src\presentation\cli\commands\uninstall.test.ts:14:    writeFileSync,
src\presentation\cli\commands\uninstall.test.ts:37:            rmSync(testBaseDir, { recursive: true, force: true });
src\presentation\cli\commands\uninstall.test.ts:39:        mkdirSync(testBaseDir, { recursive: true });
src\presentation\cli\commands\uninstall.test.ts:64:            rmSync(testBaseDir, { recursive: true, force: true });
src\presentation\cli\commands\uninstall.test.ts:80:            mkdirSync(dirname(testHookScriptPath), { recursive: true });
src\presentation\cli\commands\uninstall.test.ts:81:            writeFileSync(testHookScriptPath, "// hook script");
src\presentation\cli\commands\uninstall.test.ts:102:            mkdirSync(dirname(testHookScriptPath), { recursive: true });
src\presentation\cli\commands\uninstall.test.ts:103:            writeFileSync(testHookScriptPath, "// hook script");
src\presentation\cli\commands\uninstall.test.ts:116:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\presentation\cli\commands\uninstall.test.ts:117:            writeFileSync(
src\presentation\cli\commands\uninstall.test.ts:155:            mkdirSync(dirname(testSettingsPath), { recursive: true });
src\presentation\cli\commands\uninstall.test.ts:156:            writeFileSync(
src\presentation\cli\commands\sync\background.test.ts:66:          startedAt: new Date().toISOString(),
src\presentation\cli\commands\stats.ts:78:      process.exitCode = result.exitCode;
src\presentation\cli\commands\status.ts:94:            process.exitCode = result.exitCode;
src\presentation\cli\commands\status.ts:279:    const diff = Date.now() - new Date(isoTimestamp).getTime();
src\presentation\cli\commands\sync\helpers.ts:127:  const duration = Date.now() - startTime;
src\presentation\cli\commands\sync\integration.test.ts:13:    const proc = spawn({
src\presentation\cli\commands\sync\integration.test.ts:38:    const proc = spawn({
src\presentation\cli\commands\sync\integration.test.ts:52:    const proc = spawn({
src\presentation\cli\commands\sync\integration.test.ts:67:    const proc = spawn({
src\presentation\cli\commands\sync\integration.test.ts:81:    const proc = spawn({
src\presentation\cli\commands\sync\integration.test.ts:95:    const proc = spawn({
src\presentation\cli\commands\sync\lazy-loaders.test.ts:139:      startedAt: new Date().toISOString(),
src\presentation\cli\commands\sync\index.ts:40:      process.exitCode = result.exitCode;
src\presentation\cli\commands\sync\index.ts:51:  const startTime = Date.now();
src\presentation\cli\commands\sync\index.ts:135:      const isBackground = process.env.MEMORY_EMBED_BACKGROUND === "1";
src\presentation\cli\commands\uninstall.ts:10:import { existsSync, unlinkSync } from "node:fs";
src\presentation\cli\commands\uninstall.ts:37:            process.exitCode = result.exitCode;
src\presentation\cli\commands\uninstall.ts:72:        unlinkSync(hookScriptPath);
src\domain\ports\ports.test.ts:63:        startTime: new Date(),
src\domain\ports\ports.test.ts:107:        timestamp: new Date(),
src\domain\ports\ports.test.ts:143:            timestamp: new Date(),
src\domain\ports\ports.test.ts:152:            timestamp: new Date(),
src\domain\ports\ports.test.ts:169:        timestamp: new Date(),
src\domain\ports\ports.test.ts:219:        startedAt: new Date(),
src\domain\ports\ports.test.ts:250:        lastIndexedAt: new Date(),
src\domain\ports\ports.test.ts:316:        lastIndexedAt: new Date(),
src\domain\ports\ports.test.ts:526:        timestamp: new Date(),
src\domain\ports\ports.test.ts:647:        modifiedTime: new Date(),
src\domain\ports\ports.test.ts:675:        modifiedTime: new Date(),
src\domain\ports\ports.test.ts:692:            timestamp: new Date().toISOString(),
src\domain\ports\ports.test.ts:702:            timestamp: new Date().toISOString(),
src\domain\ports\ports.test.ts:762:        timestamp: new Date().toISOString(),
src\domain\ports\ports.test.ts:772:        timestamp: new Date().toISOString(),
src\domain\ports\ports.test.ts:787:    const timestamp = new Date().toISOString();
src\domain\ports\ports.test.ts:902:      timestamp: new Date().toISOString(),
src\domain\ports\ports.test.ts:920:      timestamp: new Date().toISOString(),
src\domain\ports\ports.test.ts:926:      timestamp: new Date().toISOString(),
src\domain\ports\ports.test.ts:942:      timestamp: new Date().toISOString(),
src\domain\ports\ports.test.ts:951:      timestamp: new Date().toISOString(),
src\domain\ports\ports.test.ts:965:      timestamp: new Date().toISOString(),
src\domain\ports\ports.test.ts:970:      timestamp: new Date().toISOString(),
src\domain\ports\ports.test.ts:1053:            backfilledAt: new Date(),
src\domain\ports\ports.test.ts:1059:            backfilledAt: new Date(),

hook: PostToolUse
 succeeded in 8028ms:
src\presentation\cli\commands\browse.test.ts:8: * Why DI instead of mock.module: Bun's mock.module() persists across
src\presentation\cli\commands\browse.test.ts:17:  setTestDbPath,
src\presentation\cli\commands\browse.test.ts:137:    setTestDbPath(dbPath);
src\presentation\cli\commands\browse.test.ts:160:    setTestDbPath(null);
src\presentation\cli\commands\backfill.ts:195:      const dbPath = getDefaultDbPath();
src\presentation\cli\commands\browse.ts:16:import { executeShowCommand, setTestDbPath as setShowTestDbPath } from "./show.js";
src\presentation\cli\commands\browse.ts:29: * When set, executeBrowseCommand uses this path instead of getDefaultDbPath().
src\presentation\cli\commands\browse.ts:31:let testDbPath: string | null = null;
src\presentation\cli\commands\browse.ts:39:export function setTestDbPath(path: string | null): void {
src\presentation\cli\commands\browse.ts:40:  testDbPath = path;
src\presentation\cli\commands\browse.ts:42:  setShowTestDbPath(path);
src\presentation\cli\commands\browse.ts:56: * Injected so tests can substitute mocks without `mock.module()`,
src\presentation\cli\commands\browse.ts:117:  const dbPath = testDbPath ?? getDefaultDbPath();
src\presentation\cli\commands\context.ts:140:  const dbPath = options.dbPath ?? getDefaultDbPath();
src\presentation\cli\commands\doctor.test.ts:28:    const testDbPath = join(testDir, "test.db");
src\presentation\cli\commands\doctor.test.ts:43:        const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\doctor.test.ts:53:            dbPath: testDbPath,
src\presentation\cli\commands\doctor.test.ts:315:                dbPath: testDbPath,
src\presentation\cli\commands\doctor.test.ts:334:                dbPath: testDbPath,
src\presentation\cli\commands\doctor.test.ts:344:                dbPath: testDbPath,
src\presentation\cli\commands\doctor.test.ts:363:                dbPath: testDbPath,
src\presentation\cli\commands\doctor.test.ts:736:                dbPath: testDbPath,
src\presentation\cli\commands\doctor.ts:134:    const dbPath = getDefaultDbPath();
src\presentation\cli\commands\doctor.ts:330:        messages.push(`  2. Delete the database: rm ${getDefaultDbPath()}`);
src\presentation\cli\commands\export.ts:77:  const dbPath = getDefaultDbPath();
src\infrastructure\database\connection.test.ts:230:            const path = getDefaultDbPath();
src\infrastructure\database\connection.test.ts:235:            const path = getDefaultDbPath();
src\infrastructure\database\connection.ts:76:export function getDefaultDbPath(): string {
src\infrastructure\database\health-checker.test.ts:31:    const testDbPath = join(testDir, "test.db");
src\infrastructure\database\health-checker.test.ts:339:            const { db } = initializeDatabase({ path: testDbPath });
src\infrastructure\database\health-checker.test.ts:349:                dbPath: testDbPath,
src\infrastructure\database\health-checker.test.ts:395:                dbPath: testDbPath,
src\infrastructure\database\health-checker.test.ts:410:                dbPath: testDbPath,
src\infrastructure\database\health-checker.test.ts:426:                dbPath: testDbPath,
src\infrastructure\database\health-checker.test.ts:441:                dbPath: testDbPath,
src\infrastructure\database\health-checker.test.ts:458:                dbPath: testDbPath,
src\infrastructure\database\health-checker.ts:413:    const dbPath = effectiveOverrides?.dbPath ?? getDefaultDbPath();
src\presentation\cli\commands\friction\index.ts:116:    const dbPath = options.dbPath ?? getDefaultDbPath();
src\infrastructure\embedding\transformers-js-provider.test.ts:56:mock.module("@huggingface/transformers", () => ({
src\presentation\cli\commands\friction\types.ts:88:    /** Override database path (for testing). Falls back to getDefaultDbPath(). */
src\presentation\cli\commands\import.ts:90:  const dbPath = getDefaultDbPath();
src\presentation\cli\commands\list.ts:149:  const dbPath = getDefaultDbPath();
src\presentation\cli\commands\purge.ts:23:let testDbPath: string | null = null;
src\presentation\cli\commands\purge.ts:30:export function setTestDbPath(path: string | null): void {
src\presentation\cli\commands\purge.ts:31:  testDbPath = path;
src\presentation\cli\commands\purge.ts:207:  const dbPath = testDbPath ?? getDefaultDbPath();
src\presentation\cli\commands\purge.test.ts:15:  setTestDbPath,
src\presentation\cli\commands\purge.test.ts:216:  let testDbPath: string;
src\presentation\cli\commands\purge.test.ts:243:    testDbPath = path.join(testDir, "memory.db");
src\presentation\cli\commands\purge.test.ts:244:    setTestDbPath(testDbPath);
src\presentation\cli\commands\purge.test.ts:247:    const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:272:    setTestDbPath(null);
src\presentation\cli\commands\purge.test.ts:312:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:330:      const { db: db2 } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:341:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:362:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:381:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:404:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:419:      const { db: db2 } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:428:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:448:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:472:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:488:      const { db: db2 } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:497:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:516:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\related.ts:122:  const dbPath = options.dbPath ?? getDefaultDbPath();
src\presentation\cli\commands\search.ts:206:  const dbPath = options.dbPath ?? getDefaultDbPath();
src\presentation\cli\commands\show.test.ts:8:import { createShowCommand, executeShowCommand, setTestDbPath } from "./show.js";
src\presentation\cli\commands\show.test.ts:105:    setTestDbPath(TEST_DB_PATH);
src\presentation\cli\commands\show.test.ts:117:    setTestDbPath(null);
src\presentation\cli\db-startup.ts:27:  /** Custom database path (defaults to getDefaultDbPath()) */
src\presentation\cli\db-startup.ts:174:  const dbPath = options.dbPath ?? getDefaultDbPath();
src\presentation\cli\commands\show.ts:33: * When set, executeShowCommand uses this path instead of getDefaultDbPath().
src\presentation\cli\commands\show.ts:35:let testDbPath: string | null = null;
src\presentation\cli\commands\show.ts:43:export function setTestDbPath(path: string | null): void {
src\presentation\cli\commands\show.ts:44:  testDbPath = path;
src\presentation\cli\commands\show.ts:149:  const dbPath = testDbPath ?? getDefaultDbPath();
src\presentation\cli\commands\status.test.ts:22:    setTestDbPath,
src\presentation\cli\commands\status.test.ts:58:    const testDbPath = join(testBaseDir, ".memory-nexus", "test.db");
src\presentation\cli\commands\status.test.ts:78:        setTestDbPath(testDbPath);
src\presentation\cli\commands\status.test.ts:92:        setTestDbPath(null);
src\presentation\cli\commands\status.test.ts:156:            // Uses test database path via setTestDbPath override
src\presentation\cli\commands\status.test.ts:179:            setTestDbPath(embeddingTestDb);
src\presentation\cli\commands\status.test.ts:216:                setTestDbPath(testDbPath); // Restore original test DB path
src\presentation\cli\commands\stats.ts:97:  const dbPath = getDefaultDbPath();
src\presentation\cli\commands\status.ts:30:let testDbPath: string | null = null;
src\presentation\cli\commands\status.ts:37:export function setTestDbPath(path: string | null): void {
src\presentation\cli\commands\status.ts:38:    testDbPath = path;
src\presentation\cli\commands\status.ts:140:    const dbPath = options.dbPath ?? testDbPath ?? getDefaultDbPath();
src\presentation\cli\commands\sync\embedding-pass.test.ts:941:    mock.module("node:readline", () => ({
src\presentation\cli\commands\sync\embedding-pass.test.ts:971:    mock.module("node:readline", () => ({
src\presentation\cli\commands\sync\embedding-pass.test.ts:1001:    mock.module("node:readline", () => ({
src\presentation\cli\commands\sync\lazy-loaders.test.ts:30:mock.module("../../../../infrastructure/embedding/background-embedder.js", () => ({
src\presentation\cli\commands\sync\lazy-loaders.test.ts:41:mock.module("../../../../infrastructure/embedding/embedding-provider-factory.js", () => ({
src\presentation\cli\commands\sync\lazy-loaders.test.ts:50:mock.module("../../../../infrastructure/hooks/config-manager.js", () => ({
src\presentation\cli\commands\sync\lazy-loaders.test.ts:80:mock.module("../../../../infrastructure/database/repositories/embedding-repository.js", () => ({
src\presentation\cli\commands\sync\index.ts:64:  const dbPath = getDefaultDbPath();

hook: PostToolUse
 succeeded in 8508ms:
tests\helpers\test-database.ts:78: * let testDb: TestDatabase;
tests\integration\concurrent-commands.test.ts:28:  setTestCheckpointPath,
tests\integration\concurrent-commands.test.ts:99:  let testDir: string;
tests\integration\concurrent-commands.test.ts:107:    setTestCheckpointPath(join(testDir, "sync-checkpoint.json"));
tests\integration\concurrent-commands.test.ts:129:    setTestCheckpointPath(null);
tests\infrastructure\database\repositories\friction-repository.test.ts:42:    let testDb: TestDatabase;
tests\integration\interrupted-sync.test.ts:27:  setTestCheckpointPath,
tests\integration\interrupted-sync.test.ts:89:  let testDir: string;
tests\integration\interrupted-sync.test.ts:102:    setTestCheckpointPath(join(testDir, "sync-checkpoint.json"));
tests\integration\interrupted-sync.test.ts:139:    setTestCheckpointPath(null);
tests\integration\sync-with-memory-files.test.ts:20:import { setTestPaths, resetTestPaths } from "../../src/infrastructure/paths.js";
tests\integration\sync-with-memory-files.test.ts:23:  let testDb: TestDatabase;
tests\integration\sync-with-memory-files.test.ts:29:    setTestPaths({ memoryDir });
tests\integration\sync-with-memory-files.test.ts:33:    resetTestPaths();
tests\integration\large-file.test.ts:168:  let testDir: string;
src\infrastructure\hooks\config-manager.test.ts:32:    let testDir: string;
src\infrastructure\hooks\auto-memory-writer.test.ts:18:    let testDir: string;
src\infrastructure\hooks\config-manager.ts:21:let testConfigPath: string | null = null;
src\infrastructure\hooks\config-manager.ts:28:export function setTestConfigPath(path: string | null): void {
src\infrastructure\hooks\config-manager.ts:29:    testConfigPath = path;
src\infrastructure\hooks\config-manager.ts:248:    if (testConfigPath !== null) {
src\infrastructure\hooks\config-manager.ts:249:        return dirname(testConfigPath);
src\infrastructure\hooks\config-manager.ts:260:    if (testConfigPath !== null) {
src\infrastructure\hooks\config-manager.ts:261:        return testConfigPath;
src\infrastructure\hooks\hook-runner.test.ts:315:        let testDbDir: string;
src\infrastructure\embedding\background-embedder.test.ts:32:  let testDir: string;
src\infrastructure\embedding\background-embedder.test.ts:204:  let testDir: string;
src\infrastructure\embedding\background-embedder.test.ts:388:  let testDir: string;
src\infrastructure\hooks\index.ts:16:    setTestConfigPath,
src\infrastructure\hooks\index.ts:28:    setTestLogPath,
src\infrastructure\hooks\index.ts:59:    setTestPathOverrides,
src\infrastructure\paths.test.ts:22:    setTestPaths,
src\infrastructure\paths.test.ts:23:    resetTestPaths,
src\infrastructure\paths.test.ts:38:        resetTestPaths();
src\infrastructure\paths.test.ts:52:        resetTestPaths();
src\infrastructure\paths.test.ts:166:        test("setTestPaths overrides config dir", () => {
src\infrastructure\paths.test.ts:167:            setTestPaths({ configDir: "/test/config" });
src\infrastructure\paths.test.ts:171:        test("setTestPaths overrides data dir", () => {
src\infrastructure\paths.test.ts:172:            setTestPaths({ dataDir: "/test/data" });
src\infrastructure\paths.test.ts:176:        test("setTestPaths overrides both independently", () => {
src\infrastructure\paths.test.ts:177:            setTestPaths({ configDir: "/test/config", dataDir: "/test/data" });
src\infrastructure\paths.test.ts:183:            setTestPaths({ configDir: "/test/config" });
src\infrastructure\paths.test.ts:188:            setTestPaths({ dataDir: "/test/data" });
src\infrastructure\paths.test.ts:193:            setTestPaths({ configDir: "/test/config", dataDir: "/test/data" });
src\infrastructure\paths.test.ts:199:        test("resetTestPaths restores default behavior", () => {
src\infrastructure\paths.test.ts:200:            setTestPaths({ configDir: "/test/config", dataDir: "/test/data" });
src\infrastructure\paths.test.ts:201:            resetTestPaths();
src\infrastructure\paths.test.ts:208:            setTestPaths({ configDir: "/test/config" });
src\infrastructure\paths.test.ts:213:            setTestPaths({ configDir: "/test/config", dataDir: "/test/data" });
src\infrastructure\paths.test.ts:217:        test("setTestPaths overrides memory dir", () => {
src\infrastructure\paths.test.ts:218:            setTestPaths({ memoryDir: "/tmp/test-memory" });
src\infrastructure\paths.test.ts:222:        test("resetTestPaths restores getMemoryDir default", () => {
src\infrastructure\paths.test.ts:223:            setTestPaths({ memoryDir: "/tmp/test-memory" });
src\infrastructure\paths.test.ts:224:            resetTestPaths();
src\infrastructure\paths.ts:28:let testOverrides: TestPathOverrides | null = null;
src\infrastructure\paths.ts:38:export function setTestPaths(overrides: TestPathOverrides): void {
src\infrastructure\paths.ts:45:export function resetTestPaths(): void {
src\infrastructure\hooks\log-writer.test.ts:23:    let testDir: string;
src\infrastructure\signals\checkpoint-manager.test.ts:17:    setTestCheckpointPath,
src\infrastructure\signals\checkpoint-manager.test.ts:22:    let testDir: string;
src\infrastructure\signals\checkpoint-manager.test.ts:23:    let testCheckpointFile: string;
src\infrastructure\signals\checkpoint-manager.test.ts:30:        setTestCheckpointPath(testCheckpointFile);
src\infrastructure\signals\checkpoint-manager.test.ts:35:        setTestCheckpointPath(null);
src\infrastructure\signals\checkpoint-manager.test.ts:51:            setTestCheckpointPath(null);
src\infrastructure\signals\checkpoint-manager.test.ts:78:            setTestCheckpointPath(nestedPath);
src\infrastructure\signals\checkpoint-manager.test.ts:122:            setTestCheckpointPath("/\0invalid/path/checkpoint.json");
src\infrastructure\signals\checkpoint-manager.ts:18:let testCheckpointPath: string | null = null;
src\infrastructure\signals\checkpoint-manager.ts:25:export function setTestCheckpointPath(path: string | null): void {
src\infrastructure\sources\session-source.test.ts:15:    let testDir: string;
src\infrastructure\sources\project-name-resolver.test.ts:15:  let testDir: string;
src\infrastructure\hooks\settings-manager.test.ts:29:    setTestPathOverrides,
src\infrastructure\hooks\settings-manager.test.ts:47:        setTestPathOverrides({
src\infrastructure\hooks\settings-manager.test.ts:48:            settingsPath: testSettingsPath,
src\infrastructure\hooks\settings-manager.test.ts:56:        setTestPathOverrides(null);
src\infrastructure\hooks\settings-manager.test.ts:81:            setTestPathOverrides(null);
src\infrastructure\hooks\settings-manager.test.ts:91:            setTestPathOverrides({
src\infrastructure\hooks\settings-manager.test.ts:92:                settingsPath: testSettingsPath,
src\infrastructure\hooks\settings-manager.ts:106:    settingsPath?: string;
src\infrastructure\hooks\settings-manager.ts:113:let testPathOverrides: PathOverrides | null = null;
src\infrastructure\hooks\settings-manager.ts:120:export function setTestPathOverrides(overrides: PathOverrides | null): void {
src\infrastructure\hooks\settings-manager.ts:121:    testPathOverrides = overrides;
src\infrastructure\hooks\settings-manager.ts:130:    return testPathOverrides?.settingsPath ?? join(homedir(), ".claude", "settings.json");
src\infrastructure\hooks\settings-manager.ts:139:    return testPathOverrides?.backupPath ?? join(pathsGetBackupDir(), "settings.json.backup");
src\infrastructure\hooks\settings-manager.ts:148:    return testPathOverrides?.hookScriptPath ?? join(pathsGetHookDir(), "sync-hook.js");
src\infrastructure\hooks\settings-manager.ts:159:    const settingsPath = getClaudeSettingsPath();
src\infrastructure\hooks\settings-manager.ts:161:    if (!existsSync(settingsPath)) {
src\infrastructure\hooks\settings-manager.ts:166:        const content = readFileSync(settingsPath, "utf-8");
src\infrastructure\hooks\settings-manager.ts:182:    const settingsPath = getClaudeSettingsPath();
src\infrastructure\hooks\settings-manager.ts:185:    if (!existsSync(settingsPath)) {
src\infrastructure\hooks\settings-manager.ts:193:    copyFileSync(settingsPath, backupPath);
src\infrastructure\hooks\settings-manager.ts:207:    const settingsPath = getClaudeSettingsPath();
src\infrastructure\hooks\settings-manager.ts:215:    mkdirSync(dirname(settingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.ts:218:    copyFileSync(backupPath, settingsPath);
src\infrastructure\hooks\settings-manager.ts:233:    const settingsPath = getClaudeSettingsPath();
src\infrastructure\hooks\settings-manager.ts:283:    mkdirSync(dirname(settingsPath), { recursive: true });
src\infrastructure\hooks\settings-manager.ts:284:    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
src\infrastructure\hooks\settings-manager.ts:298:    const settingsPath = getClaudeSettingsPath();
src\infrastructure\hooks\settings-manager.ts:338:    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
src\infrastructure\hooks\sync-hook-script.test.ts:71:    let testDir: string;
src\infrastructure\hooks\log-writer.ts:29:let testLogPath: string | null = null;
src\infrastructure\hooks\log-writer.ts:36:export function setTestLogPath(path: string | null): void {
src\infrastructure\sources\memory-file-scanner.test.ts:13:import { setTestPaths, resetTestPaths } from "../paths.js";
src\infrastructure\sources\memory-file-scanner.test.ts:23:        setTestPaths({ memoryDir: tempDir });
src\infrastructure\sources\memory-file-scanner.test.ts:28:        resetTestPaths();
src\infrastructure\sources\memory-file-scanner.test.ts:198:            setTestPaths({ memoryDir: join(tempDir, "nonexistent") });
src\infrastructure\migration.test.ts:21:import { setTestPaths, resetTestPaths } from "./paths.js";
src\infrastructure\migration.test.ts:35:    let testDir: string;
src\infrastructure\migration.test.ts:56:        setTestPaths({ configDir, dataDir });
src\infrastructure\migration.test.ts:66:        resetTestPaths();
src\infrastructure\database\health-checker.test.ts:21:    setTestOverrides,
src\infrastructure\database\health-checker.test.ts:24:import { setTestConfigPath } from "../hooks/config-manager.js";
src\infrastructure\database\health-checker.test.ts:25:import { setTestLogPath } from "../hooks/log-writer.js";
src\infrastructure\database\health-checker.test.ts:26:import { setTestPathOverrides } from "../hooks/settings-manager.js";
src\infrastructure\database\health-checker.test.ts:32:    const testConfigPath = join(testDir, "config.json");
src\infrastructure\database\health-checker.test.ts:42:        setTestConfigPath(testConfigPath);
src\infrastructure\database\health-checker.test.ts:43:        setTestLogPath(testLogPath);
src\infrastructure\database\health-checker.test.ts:44:        setTestPathOverrides({
src\infrastructure\database\health-checker.test.ts:45:            settingsPath: testSettingsPath,
src\infrastructure\database\health-checker.test.ts:51:        setTestConfigPath(null);
src\infrastructure\database\health-checker.test.ts:52:        setTestLogPath(null);
src\infrastructure\database\health-checker.test.ts:53:        setTestPathOverrides(null);
src\infrastructure\database\health-checker.test.ts:54:        setTestOverrides(null);
src\infrastructure\database\health-checker.test.ts:182:                rmSync(testConfigPath, { force: true });
src\infrastructure\database\health-checker.test.ts:195:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:211:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:221:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:231:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:241:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:251:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:261:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:271:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:287:                rmSync(testConfigPath, { force: true });
src\infrastructure\database\health-checker.test.ts:303:            writeFileSync(testConfigPath, JSON.stringify({ autoSync: true }));
src\infrastructure\database\health-checker.test.ts:310:            writeFileSync(testConfigPath, JSON.stringify({ autoSync: false }));
src\infrastructure\database\health-checker.test.ts:344:            setTestOverrides(null);
src\infrastructure\database\health-checker.test.ts:348:            setTestOverrides({
src\infrastructure\database\health-checker.test.ts:377:            setTestOverrides({
src\infrastructure\database\health-checker.test.ts:394:            setTestOverrides({
src\infrastructure\database\health-checker.test.ts:422:            setTestOverrides(null);
src\infrastructure\database\health-checker.test.ts:440:            setTestOverrides({
src\infrastructure\database\health-checker.test.ts:457:            setTestOverrides({
src\infrastructure\database\health-checker.test.ts:484:                rmSync(testConfigPath, { force: true });
src\infrastructure\database\health-checker.test.ts:500:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:531:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:545:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:560:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:574:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\health-checker.test.ts:589:            writeFileSync(testConfigPath, JSON.stringify({
src\infrastructure\database\index.ts:82:  setTestOverrides,
src\presentation\cli\commands\browse.test.ts:17:  setTestDbPath,
src\presentation\cli\commands\browse.test.ts:137:    setTestDbPath(dbPath);
src\presentation\cli\commands\browse.test.ts:160:    setTestDbPath(null);
src\infrastructure\database\health-checker.ts:163:let testOverrides: HealthCheckOverrides | null = null;
src\infrastructure\database\health-checker.ts:170:export function setTestOverrides(overrides: HealthCheckOverrides | null): void {
src\presentation\cli\commands\doctor.test.ts:18:    setTestOverrides,
src\presentation\cli\commands\doctor.test.ts:22:import { setTestConfigPath } from "../../../infrastructure/hooks/config-manager.js";
src\presentation\cli\commands\doctor.test.ts:23:import { setTestLogPath } from "../../../infrastructure/hooks/log-writer.js";
src\presentation\cli\commands\doctor.test.ts:24:import { setTestPathOverrides } from "../../../infrastructure/hooks/settings-manager.js";
src\presentation\cli\commands\doctor.test.ts:29:    const testConfigPath = join(testDir, "config.json");
src\presentation\cli\commands\doctor.test.ts:47:        setTestConfigPath(testConfigPath);
src\presentation\cli\commands\doctor.test.ts:48:        setTestLogPath(testLogPath);
src\presentation\cli\commands\doctor.test.ts:49:        setTestPathOverrides({
src\presentation\cli\commands\doctor.test.ts:50:            settingsPath: testSettingsPath,
src\presentation\cli\commands\doctor.test.ts:52:        setTestOverrides({
src\presentation\cli\commands\doctor.test.ts:62:        setTestConfigPath(null);
src\presentation\cli\commands\doctor.test.ts:63:        setTestLogPath(null);
src\presentation\cli\commands\doctor.test.ts:64:        setTestPathOverrides(null);
src\presentation\cli\commands\doctor.test.ts:65:        setTestOverrides(null);
src\presentation\cli\commands\doctor.test.ts:314:            setTestOverrides({
src\presentation\cli\commands\doctor.test.ts:333:            setTestOverrides({
src\presentation\cli\commands\doctor.test.ts:343:            setTestOverrides({
src\presentation\cli\commands\doctor.test.ts:362:            setTestOverrides({
src\presentation\cli\commands\doctor.test.ts:721:            setTestOverrides({
src\presentation\cli\commands\doctor.test.ts:735:            setTestOverrides({
src\presentation\cli\commands\export.test.ts:19:  let testDb: TestDatabase;
src\presentation\cli\commands\browse.ts:16:import { executeShowCommand, setTestDbPath as setShowTestDbPath } from "./show.js";
src\presentation\cli\commands\browse.ts:31:let testDbPath: string | null = null;
src\presentation\cli\commands\browse.ts:39:export function setTestDbPath(path: string | null): void {
src\presentation\cli\commands\browse.ts:42:  setShowTestDbPath(path);
src\presentation\cli\commands\import.test.ts:26:  let testDir: string;
src\presentation\cli\commands\import.test.ts:29:  let testCounter = 0;
src\presentation\cli\commands\install.test.ts:21:    setTestHookScriptSourceOverride,
src\presentation\cli\commands\install.test.ts:23:import { setTestPathOverrides } from "../../../infrastructure/hooks/settings-manager.js";
src\presentation\cli\commands\install.test.ts:53:        setTestPathOverrides({
src\presentation\cli\commands\install.test.ts:54:            settingsPath: testSettingsPath,
src\presentation\cli\commands\install.test.ts:60:        setTestHookScriptSourceOverride(mockHookScriptPath);
src\presentation\cli\commands\install.test.ts:75:        setTestPathOverrides(null);
src\presentation\cli\commands\install.test.ts:76:        setTestHookScriptSourceOverride(null);
src\presentation\cli\commands\install.test.ts:163:            setTestHookScriptSourceOverride(join(testBaseDir, "nonexistent", "sync-hook.js"));
src\presentation\cli\commands\install.test.ts:231:            setTestHookScriptSourceOverride(join(testBaseDir, "nonexistent", "sync-hook.js"));
src\presentation\cli\commands\install.test.ts:237:            setTestHookScriptSourceOverride(null);
src\presentation\cli\commands\install.ts:31:let testHookScriptSourceOverride: string | null = null;
src\presentation\cli\commands\install.ts:38:export function setTestHookScriptSourceOverride(path: string | null): void {
src\presentation\cli\commands\purge.test.ts:15:  setTestDbPath,
src\presentation\cli\commands\purge.test.ts:215:  let testDir: string;
src\presentation\cli\commands\purge.test.ts:216:  let testDbPath: string;
src\presentation\cli\commands\purge.test.ts:244:    setTestDbPath(testDbPath);
src\presentation\cli\commands\purge.test.ts:272:    setTestDbPath(null);
src\presentation\cli\commands\purge.ts:23:let testDbPath: string | null = null;
src\presentation\cli\commands\purge.ts:30:export function setTestDbPath(path: string | null): void {
src\presentation\cli\commands\purge.ts:140:let askConfirmationFn = askConfirmation;
src\presentation\cli\commands\purge.ts:148:  askConfirmationFn = fn;
src\presentation\cli\commands\purge.ts:155:  askConfirmationFn = askConfirmation;
src\presentation\cli\commands\purge.ts:289:      const confirmed = await askConfirmationFn(
src\presentation\cli\commands\show.test.ts:8:import { createShowCommand, executeShowCommand, setTestDbPath } from "./show.js";
src\presentation\cli\commands\show.test.ts:105:    setTestDbPath(TEST_DB_PATH);
src\presentation\cli\commands\show.test.ts:117:    setTestDbPath(null);
src\presentation\cli\commands\show.ts:35:let testDbPath: string | null = null;
src\presentation\cli\commands\show.ts:43:export function setTestDbPath(path: string | null): void {
src\presentation\cli\commands\status.test.ts:22:    setTestDbPath,
src\presentation\cli\commands\status.test.ts:27:    setTestPathOverrides,
src\presentation\cli\commands\status.test.ts:31:    setTestConfigPath,
src\presentation\cli\commands\status.test.ts:35:    setTestLogPath,
src\presentation\cli\commands\status.test.ts:38:    setTestPaths,
src\presentation\cli\commands\status.test.ts:39:    resetTestPaths,
src\presentation\cli\commands\status.test.ts:56:    const testConfigPath = join(testBaseDir, ".memory-nexus", "config.json");
src\presentation\cli\commands\status.test.ts:71:        setTestPathOverrides({
src\presentation\cli\commands\status.test.ts:72:            settingsPath: testSettingsPath,
src\presentation\cli\commands\status.test.ts:76:        setTestConfigPath(testConfigPath);
src\presentation\cli\commands\status.test.ts:77:        setTestLogPath(testLogPath);
src\presentation\cli\commands\status.test.ts:78:        setTestDbPath(testDbPath);
src\presentation\cli\commands\status.test.ts:89:        setTestPathOverrides(null);
src\presentation\cli\commands\status.test.ts:90:        setTestConfigPath(null);
src\presentation\cli\commands\status.test.ts:91:        setTestLogPath(null);
src\presentation\cli\commands\status.test.ts:92:        setTestDbPath(null);
src\presentation\cli\commands\status.test.ts:136:            mkdirSync(dirname(testConfigPath), { recursive: true });
src\presentation\cli\commands\status.test.ts:137:            writeFileSync(testConfigPath, JSON.stringify({
src\presentation\cli\commands\status.test.ts:156:            // Uses test database path via setTestDbPath override
src\presentation\cli\commands\status.test.ts:168:            setTestPaths({ dataDir: isolatedDir });
src\presentation\cli\commands\status.test.ts:179:            setTestDbPath(embeddingTestDb);
src\presentation\cli\commands\status.test.ts:215:                resetTestPaths();
src\presentation\cli\commands\status.test.ts:216:                setTestDbPath(testDbPath); // Restore original test DB path
src\presentation\cli\commands\status.ts:30:let testDbPath: string | null = null;
src\presentation\cli\commands\status.ts:37:export function setTestDbPath(path: string | null): void {
src\presentation\cli\commands\uninstall.test.ts:20:    setTestPathOverrides,
src\presentation\cli\commands\uninstall.test.ts:42:        setTestPathOverrides({
src\presentation\cli\commands\uninstall.test.ts:43:            settingsPath: testSettingsPath,
src\presentation\cli\commands\uninstall.test.ts:57:        setTestPathOverrides(null);
src\presentation\cli\commands\sync\lazy-loaders.test.ts:52:  setTestConfigPath: () => {},

hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PostToolUse Completed
codex
**Verdict**

The direction is mostly right, but I would not approve the plan as written. It fixes the visible failure mode, but it frames the solution too narrowly as “add `dbPath` to options everywhere.” The first-principles target is broader:

Tests must not mutate process-wide state unless the mutation is fully scoped and restored, and production code must not contain test-only global escape hatches.

`dbPath` via options is acceptable for CLI command handlers, but it should be treated as one instance of a larger command dependency seam, not the whole architecture.

**Blocking Weaknesses**

1. **Stage 1 is not actually complete in the current workspace.**

Read-only scan still shows `browse.ts` importing and propagating `setShowTestDbPath`, plus its own `let testDbPath` and `setTestDbPath()`:

- [browse.ts](C:/Projects/memory-nexus/src/presentation/cli/commands/browse.ts:16)
- [browse.ts](C:/Projects/memory-nexus/src/presentation/cli/commands/browse.ts:31)
- [browse.ts](C:/Projects/memory-nexus/src/presentation/cli/commands/browse.ts:39)
- [browse.ts](C:/Projects/memory-nexus/src/presentation/cli/commands/browse.ts:117)

So the plan’s “Already done” claim is too strong unless these are transitional leftovers.

2. **The audit is incomplete.**

You grep’d the right obvious terms, but the repo has more production test seams than `testDbPath`:

- `setTestPaths` / `resetTestPaths` in [paths.ts](C:/Projects/memory-nexus/src/infrastructure/paths.ts:38)
- `setTestConfigPath` in [config-manager.ts](C:/Projects/memory-nexus/src/infrastructure/hooks/config-manager.ts:28)
- `setTestLogPath` in [log-writer.ts](C:/Projects/memory-nexus/src/infrastructure/hooks/log-writer.ts:36)
- `setTestPathOverrides` in [settings-manager.ts](C:/Projects/memory-nexus/src/infrastructure/hooks/settings-manager.ts:120)
- `setTestCheckpointPath` in [checkpoint-manager.ts](C:/Projects/memory-nexus/src/infrastructure/signals/checkpoint-manager.ts:25)
- `setTestOverrides` in [health-checker.ts](C:/Projects/memory-nexus/src/infrastructure/database/health-checker.ts:170)
- `setTestHookScriptSourceOverride` in [install.ts](C:/Projects/memory-nexus/src/presentation/cli/commands/install.ts:38)
- `askConfirmationFn` mutable function seam in [purge.ts](C:/Projects/memory-nexus/src/presentation/cli/commands/purge.ts:140)

Your own historical audit docs apparently called this out as “13 module-level test-seam globals,” so the current plan under-scopes the known pattern.

3. **DI-via-options is good, but not quite the canonical seam.**

For command handlers, `options.dbPath ?? getDefaultDbPath()` is pragmatic and probably enough for DB path isolation. But options are semantically user/request inputs. Test-only operational dependencies are cleaner as a second parameter:

```ts
executeSearchCommand(options, deps = createDefaultCommandDeps())
```

Where `deps` can hold `dbPath`, `clock`, `env`, `fs`, `confirm`, `dispatchers`, `logger`, or repository factories.

If `dbPath` is a real user-facing CLI option, putting it in options is fine. If it exists only for tests, using options leaks test plumbing into the command API. The stronger convention is: parsed CLI flags in `options`; environment/runtime dependencies in `deps`.

4. **Banning first-party `mock.module()` is necessary but insufficient.**

The `sync/lazy-loaders.test.ts` first-party mocks should go. The `node:readline` mock should also go if possible; inject a prompt/readline adapter instead. The third-party `@huggingface/transformers` mock is lower risk, but the “only consumer today” argument is weak. Future tests can accidentally import the same module after the mock and inherit pollution.

Better framing: `mock.module()` is allowed only behind a documented exception when the imported module cannot reasonably be wrapped behind a port, and the test must prove no same-process consumer is affected. For OSS-quality, prefer ports.

5. **“All 16 commands” is the wrong boundary.**

The right boundary is not every command. It is every production path that touches persistent user state, external process state, config paths, filesystem paths, time, env, prompts, or subprocesses.

Commands like `completion` may not need `dbPath`. Commands like `doctor`, `install`, `uninstall`, `status`, `sync`, and hooks need broader dependency injection than `dbPath`. Pattern C is only correct for the actual composition root, not for test-invoked command functions.

6. **Acceptance criteria need stronger isolation gates.**

Add these:

- Run `bun test` twice in the same shell with no cleanup between runs.
- Run a deliberate pollution order: mock-heavy files before command files.
- Add a grep/CI gate banning first-party `mock.module(`.
- Add a grep/CI gate banning exported `setTest*`, `resetTest*`, and module-level `let test*` in production source.
- Add a test guard that fails if command tests touch the real default DB path.
- Reset or assert `process.exitCode` around tests that invoke CLI action wrappers.

`process.exitCode` is currently mutated in many command wrappers. That is another process-wide test pollution vector.

**Recommended Rollout**

Do one coherent branch, but atomic commits:

1. Add the regression/sentinel test or CI grep first so the pollution is captured.
2. Finish `browse` fully: no `mock.module`, no `setTestDbPath`, no propagation setter.
3. Convert `show`, `purge`, and `status` away from module globals.
4. Convert DB-touching Pattern C commands.
5. Remove first-party `mock.module()` in `sync/lazy-loaders.test.ts`.
6. Sweep non-DB global test seams separately: paths, config, logs, checkpoint, confirm prompt, install hook source.
7. Document the convention after the code proves it.

That gives systems-level coherence without a single unreviewable mega-diff.

**Architectural Signal**

The repeated smell is not “some commands forgot `dbPath`.” It is “runtime dependencies are discovered inside business/presentation functions instead of being provided at the boundary.” Search next for:

- `homedir()`, `tmpdir()`, `process.env`
- `Date.now()`, `new Date()`
- `Math.random()`
- `process.exitCode`
- `spawn`, `Bun.spawn`
- `console.log/error` spies
- exported `setTest*`, `resetTest*`, `*Override`, mutable `let *Fn`

The plan is directionally good, but promote it from “standardise dbPath” to “standardise command runtime dependencies.” That is the durable fix.
hook: Stop
hook: Stop
hook: Stop Completed
hook: Stop Failed
2026-05-08T09:34:43.659988Z ERROR codex_core::session: failed to record rollout items: thread 019e06eb-19fa-7043-9a90-aa87b3e3d61b not found
tokens used
67,478
**Verdict**

The direction is mostly right, but I would not approve the plan as written. It fixes the visible failure mode, but it frames the solution too narrowly as “add `dbPath` to options everywhere.” The first-principles target is broader:

Tests must not mutate process-wide state unless the mutation is fully scoped and restored, and production code must not contain test-only global escape hatches.

`dbPath` via options is acceptable for CLI command handlers, but it should be treated as one instance of a larger command dependency seam, not the whole architecture.

**Blocking Weaknesses**

1. **Stage 1 is not actually complete in the current workspace.**

Read-only scan still shows `browse.ts` importing and propagating `setShowTestDbPath`, plus its own `let testDbPath` and `setTestDbPath()`:

- [browse.ts](C:/Projects/memory-nexus/src/presentation/cli/commands/browse.ts:16)
- [browse.ts](C:/Projects/memory-nexus/src/presentation/cli/commands/browse.ts:31)
- [browse.ts](C:/Projects/memory-nexus/src/presentation/cli/commands/browse.ts:39)
- [browse.ts](C:/Projects/memory-nexus/src/presentation/cli/commands/browse.ts:117)

So the plan’s “Already done” claim is too strong unless these are transitional leftovers.

2. **The audit is incomplete.**

You grep’d the right obvious terms, but the repo has more production test seams than `testDbPath`:

- `setTestPaths` / `resetTestPaths` in [paths.ts](C:/Projects/memory-nexus/src/infrastructure/paths.ts:38)
- `setTestConfigPath` in [config-manager.ts](C:/Projects/memory-nexus/src/infrastructure/hooks/config-manager.ts:28)
- `setTestLogPath` in [log-writer.ts](C:/Projects/memory-nexus/src/infrastructure/hooks/log-writer.ts:36)
- `setTestPathOverrides` in [settings-manager.ts](C:/Projects/memory-nexus/src/infrastructure/hooks/settings-manager.ts:120)
- `setTestCheckpointPath` in [checkpoint-manager.ts](C:/Projects/memory-nexus/src/infrastructure/signals/checkpoint-manager.ts:25)
- `setTestOverrides` in [health-checker.ts](C:/Projects/memory-nexus/src/infrastructure/database/health-checker.ts:170)
- `setTestHookScriptSourceOverride` in [install.ts](C:/Projects/memory-nexus/src/presentation/cli/commands/install.ts:38)
- `askConfirmationFn` mutable function seam in [purge.ts](C:/Projects/memory-nexus/src/presentation/cli/commands/purge.ts:140)

Your own historical audit docs apparently called this out as “13 module-level test-seam globals,” so the current plan under-scopes the known pattern.

3. **DI-via-options is good, but not quite the canonical seam.**

For command handlers, `options.dbPath ?? getDefaultDbPath()` is pragmatic and probably enough for DB path isolation. But options are semantically user/request inputs. Test-only operational dependencies are cleaner as a second parameter:

```ts
executeSearchCommand(options, deps = createDefaultCommandDeps())
```

Where `deps` can hold `dbPath`, `clock`, `env`, `fs`, `confirm`, `dispatchers`, `logger`, or repository factories.

If `dbPath` is a real user-facing CLI option, putting it in options is fine. If it exists only for tests, using options leaks test plumbing into the command API. The stronger convention is: parsed CLI flags in `options`; environment/runtime dependencies in `deps`.

4. **Banning first-party `mock.module()` is necessary but insufficient.**

The `sync/lazy-loaders.test.ts` first-party mocks should go. The `node:readline` mock should also go if possible; inject a prompt/readline adapter instead. The third-party `@huggingface/transformers` mock is lower risk, but the “only consumer today” argument is weak. Future tests can accidentally import the same module after the mock and inherit pollution.

Better framing: `mock.module()` is allowed only behind a documented exception when the imported module cannot reasonably be wrapped behind a port, and the test must prove no same-process consumer is affected. For OSS-quality, prefer ports.

5. **“All 16 commands” is the wrong boundary.**

The right boundary is not every command. It is every production path that touches persistent user state, external process state, config paths, filesystem paths, time, env, prompts, or subprocesses.

Commands like `completion` may not need `dbPath`. Commands like `doctor`, `install`, `uninstall`, `status`, `sync`, and hooks need broader dependency injection than `dbPath`. Pattern C is only correct for the actual composition root, not for test-invoked command functions.

6. **Acceptance criteria need stronger isolation gates.**

Add these:

- Run `bun test` twice in the same shell with no cleanup between runs.
- Run a deliberate pollution order: mock-heavy files before command files.
- Add a grep/CI gate banning first-party `mock.module(`.
- Add a grep/CI gate banning exported `setTest*`, `resetTest*`, and module-level `let test*` in production source.
- Add a test guard that fails if command tests touch the real default DB path.
- Reset or assert `process.exitCode` around tests that invoke CLI action wrappers.

`process.exitCode` is currently mutated in many command wrappers. That is another process-wide test pollution vector.

**Recommended Rollout**

Do one coherent branch, but atomic commits:

1. Add the regression/sentinel test or CI grep first so the pollution is captured.
2. Finish `browse` fully: no `mock.module`, no `setTestDbPath`, no propagation setter.
3. Convert `show`, `purge`, and `status` away from module globals.
4. Convert DB-touching Pattern C commands.
5. Remove first-party `mock.module()` in `sync/lazy-loaders.test.ts`.
6. Sweep non-DB global test seams separately: paths, config, logs, checkpoint, confirm prompt, install hook source.
7. Document the convention after the code proves it.

That gives systems-level coherence without a single unreviewable mega-diff.

**Architectural Signal**

The repeated smell is not “some commands forgot `dbPath`.” It is “runtime dependencies are discovered inside business/presentation functions instead of being provided at the boundary.” Search next for:

- `homedir()`, `tmpdir()`, `process.env`
- `Date.now()`, `new Date()`
- `Math.random()`
- `process.exitCode`
- `spawn`, `Bun.spawn`
- `console.log/error` spies
- exported `setTest*`, `resetTest*`, `*Override`, mutable `let *Fn`

The plan is directionally good, but promote it from “standardise dbPath” to “standardise command runtime dependencies.” That is the durable fix.
