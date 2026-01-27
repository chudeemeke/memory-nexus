# Testing Patterns

**Analysis Date:** 2026-01-27

**Note:** This project is documentation-only. These testing patterns are derived from documented WoW (Ways of Working) standards and implementation plans.

## Test Framework

**Runner:**
- Jest ^29.0.0
- Config: `jest.config.js` (to be created)

**Assertion Library:**
- Jest built-in assertions (`expect`)

**Run Commands:**
```bash
bun test                    # Run all tests
bun test --watch            # Watch mode
bun test --coverage         # Coverage report
```

## Coverage Requirements

**MANDATORY - 95%+ at EACH metric individually:**

| Metric | Target | Notes |
|--------|--------|-------|
| Statements | >= 95% | Each metric must pass independently |
| Branches | >= 95% | 100% statements with 85% branches = FAILURE |
| Functions | >= 95% | Not an average across metrics |
| Lines | >= 95% | Each evaluated separately |

**Enforcement:**
- CI pipeline validation
- Pre-commit hooks (planned)
- Coverage reports generated on every test run

## Methodology

**TDD - Test Driven Development (MANDATORY):**

1. **RED** - Write a failing test first
2. **GREEN** - Write minimal code to pass the test
3. **REFACTOR** - Improve code while keeping tests green

**Principles:**
- Tests are written BEFORE implementation
- No skipping ahead to implementation
- Commit after each completed task

## Test Pyramid

```
        E2E Tests (10%)
       /              \
   Integration Tests (30%)
  /                        \
 Unit Tests (60%)
```

**Unit Tests (60%):**
- Test individual functions and classes in isolation
- Mock external dependencies
- Fast execution (< 100ms per test)

**Integration Tests (30%):**
- Test module interactions
- Use in-memory SQLite (`:memory:`)
- Test database operations end-to-end

**E2E Tests (10%):**
- Test CLI commands
- Test full sync workflow
- Test search with real data

## Test File Organization

**Location:** Co-located in `tests/` directory

**Naming:** `<module>.test.js`

**Structure:**
```
tests/
├── fixtures/
│   ├── sample-session.jsonl
│   └── sample-events.json
├── parser.test.js
├── entity-extractor.test.js
├── topic-extractor.test.js
├── database.test.js
├── links.test.js
├── search.test.js
├── related.test.js
└── sync.test.js
```

## Test Structure Pattern

**Suite Organization:**
```javascript
describe('Module Name', () => {
    let dependency;

    beforeAll(() => {
        // One-time setup
        dependency = new Dependency();
    });

    afterAll(() => {
        // Cleanup
        dependency.close();
    });

    test('should do specific thing', () => {
        // Arrange
        const input = 'test input';

        // Act
        const result = functionUnderTest(input);

        // Assert
        expect(result).toBe('expected output');
    });
});
```

## Mocking

**Framework:** Jest built-in mocking

**Patterns:**
```javascript
// Mock module
jest.mock('../src/db/database');

// Mock function
const mockFn = jest.fn().mockReturnValue('value');

// Spy on method
jest.spyOn(object, 'method').mockImplementation(() => 'mocked');
```

**What to Mock:**
- File system operations (use fixtures instead of real files)
- External dependencies
- Time-dependent operations

**What NOT to Mock:**
- SQLite operations (use `:memory:` database)
- Core business logic
- The module being tested

## Fixtures

**Test Data Location:** `tests/fixtures/`

**Patterns:**
```javascript
// Load fixture
const sampleSession = require('./fixtures/sample-session.json');

// Use fixture file path
const fixturePath = path.join(__dirname, 'fixtures', 'sample.jsonl');
```

**Seed Functions:**
```javascript
function seedTestData(db) {
    // Insert test sessions, messages, links
}

function seedTestDataWithLinks(db) {
    // Insert test data with relationship links
}
```

## Test Examples from Documentation

**Parser Tests:**
```javascript
describe('JSONL Parser', () => {
    test('should parse valid JSONL file', async () => {
        const events = [];
        for await (const event of parseSessionFile('fixtures/sample.jsonl')) {
            events.push(event);
        }
        expect(events.length).toBeGreaterThan(0);
        expect(events[0]).toHaveProperty('type');
    });

    test('should handle malformed JSON gracefully', async () => {
        const events = [];
        for await (const event of parseSessionFile('fixtures/malformed.jsonl')) {
            events.push(event);
        }
        // Should skip bad lines, not throw
        expect(events.length).toBe(2); // Only valid lines
    });
});
```

**Search Tests:**
```javascript
describe('Search Engine', () => {
    let engine;

    beforeAll(() => {
        engine = new SearchEngine(':memory:');
        seedTestData(engine.db);
    });

    afterAll(() => {
        engine.close();
    });

    test('should find exact phrase matches', () => {
        const results = engine.search('"hello world"');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].content).toContain('hello world');
    });

    test('should filter by project', () => {
        const results = engine.search('test', { project: 'wow-system' });
        results.forEach(r => {
            expect(r.project_name).toBe('wow-system');
        });
    });
});
```

**Links/Relationship Tests:**
```javascript
describe('Relationship Links', () => {
    test('should find direct links', () => {
        const related = engine.findRelated('session-1', 'session');
        expect(related.directLinks.length).toBeGreaterThan(0);
    });

    test('should rank by weight', () => {
        const related = engine.findRelated('session-1', 'session');
        for (let i = 1; i < related.directLinks.length; i++) {
            expect(related.directLinks[i - 1].weight)
                .toBeGreaterThanOrEqual(related.directLinks[i].weight);
        }
    });
});
```

## Async Testing

**Pattern:**
```javascript
test('should handle async operations', async () => {
    const result = await asyncFunction();
    expect(result).toBeDefined();
});

// For async generators
test('should iterate async generator', async () => {
    const items = [];
    for await (const item of asyncGenerator()) {
        items.push(item);
    }
    expect(items.length).toBe(expectedCount);
});
```

## Error Testing

**Pattern:**
```javascript
test('should throw on invalid input', () => {
    expect(() => {
        functionThatThrows(invalidInput);
    }).toThrow('Expected error message');
});

test('should reject promise on error', async () => {
    await expect(asyncFunctionThatFails())
        .rejects.toThrow('Expected error');
});
```

## Performance Testing

**Documented Requirements:**
- Search returns results in < 500ms for typical queries
- Can sync 100+ sessions without errors

**Approach:**
```javascript
test('should search within performance threshold', () => {
    const start = Date.now();
    const results = engine.search('query');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
});
```

## Success Criteria from Implementation Plan

**Phase 1:**
- [ ] Zero data loss during extraction
- [ ] Search returns results in < 500ms
- [ ] All tests passing (95%+ coverage)

**Phase 2:**
- [ ] Filters work correctly in combination
- [ ] Related command returns meaningful connections

**Phase 3:**
- [ ] No duplicate messages on repeated sync
- [ ] Auto-sync happens without user intervention

---

*Testing analysis derived from documented WoW standards and implementation plan: 2026-01-27*
