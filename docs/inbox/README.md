# Inbox — Cross-Project Issues

This directory accepts issue reports from other Claude Code sessions per the
convention documented in `~/.claude/rules/cross-project-issues.md`.

## What lives here

Structured issue files (one per issue) following the format defined in the rule
linked above. Each file represents:

- A bug or improvement opportunity found while another project was using this tool
- Substantive enough to warrant a patch or detailed analysis (lightweight
  friction goes to `~/.claude/friction.jsonl` per `tool-friction.md`)

## Triage

When opening this project's CWD session, check this directory for untriaged items:

```bash
ls docs/inbox/*.md 2>/dev/null
```

Triage steps for each open file (frontmatter `status: open` or unset):
1. Read severity + affects_scope
2. Validate proposed fix against current code
3. Update frontmatter `status: triaged`, `triaged_at: <today>`
4. Either apply per project standards or document rejection

After merge: `status: merged`, `resolved_at`, `pr_url` → move to `archived/`.
After reject: `status: rejected`, append rationale → move to `rejected/`.

## Conventions

- Filename: `YYYY-MM-DD-<reporting-project>-<slug>.md`
- One issue per file
- Frontmatter schema: see `~/.claude/rules/cross-project-issues.md` (currently v1.1)

## Why this directory exists (not a rule restatement)

This stub references the global rule rather than restating it. If the rule's
schema or workflow changes, only the rule file is updated — this stub stays
correct because it has no spec content. If the convention is ever migrated to
a different mechanism (hook, MCP server, etc.), this README documents the
historical pattern for projects that haven't migrated yet.
