# Friction Query Contract

`memory friction list` is the durable query surface for friction entries stored in the memory database. First-party tools should prefer this command over scanning transient `~/.claude/friction.jsonl` sidecars.

## Filters

```bash
memory friction list --tool aidev --since 2026-06-01 --count --min 3
memory friction list --project conversations --severity high --json
memory friction list --description-contains "sync failed" --count --json
```

| Flag | Semantics |
|------|-----------|
| `--all` | Include all statuses. Without `--all` or `--status`, only open entries are returned. |
| `--status <status>` | Exact stored status filter. Valid values: `open`, `resolved`, `wont-fix`. |
| `--severity <level>` | Exact stored severity filter. Valid values: `low`, `medium`, `high`, `critical`. |
| `--category <value>` | Exact stored category filter. |
| `--tool <value>` | Exact stored tool filter. Listing entries for a tool marks matching open entries as reviewed. |
| `--project <value>` | Exact stored source-project filter. |
| `--since <YYYY-MM-DD>` | Inclusive UTC date filter starting at `YYYY-MM-DDT00:00:00.000Z`. |
| `--description-contains <text>` | Case-insensitive substring filter on description. |
| `--context-contains <text>` | Case-insensitive substring filter on context. |
| `--limit <n>` | Maximum returned entries. Does not change `total_count` or `--count` semantics. |
| `--count` | Count matching rows instead of returning entries in text mode. JSON mode emits a count payload. |
| `--min <n>` | Succeeds only when the matching count is at least `n`. |

Contains filters are applied with parameterized SQL. Raw contains query strings are not echoed in text output, JSON metadata, or validation errors. JSON metadata reports only short SHA-256 fingerprints for those filters.

## JSON Envelope

`memory friction list --json` emits the common query envelope:

```json
{
  "schema_version": "1",
  "command": "friction",
  "kind": "friction",
  "meta": {
    "filters_applied": {
      "status": "open",
      "tool": "aidev"
    },
    "total_count": 4,
    "returned": 4
  },
  "data": [
    {
      "id": 42,
      "description": "sync failed after interrupted checkpoint",
      "severity": "high",
      "category": "sync",
      "status": "open",
      "tool": "aidev",
      "sourceProject": "memory-nexus",
      "context": null,
      "loggedAt": "2026-06-06T08:00:00.000Z",
      "resolvedAt": null,
      "resolution": null,
      "tags": [],
      "lastReviewedAt": null
    }
  ]
}
```

`memory friction list --count --json` emits the same envelope with `data` shaped as:

```json
{
  "count": 4
}
```

## Exit Codes

| Exit code | Meaning |
|-----------|---------|
| `0` | Query succeeded, or `--min` threshold was met. |
| `1` | Query succeeded but `--min` threshold was not met, or a friction entry state error occurred such as not found/already closed. |
| `2` | CLI argument or config error, such as invalid date, invalid status, invalid severity, or invalid numeric flag. |
| `3` | Execution failure, such as database initialization failure or unexpected runtime error. |

## Consumer Notes

- Treat the JSON envelope as the stable contract; do not parse human text output.
- Use `--count --min` for watcher/reminder conditions.
- Use exact filters whenever possible. Contains filters are for fallback matching and intentionally avoid echoing raw search text.
- Do not assume `--limit` changes threshold checks. It only changes returned entry rows.
