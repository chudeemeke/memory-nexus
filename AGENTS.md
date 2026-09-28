# Memory Nexus agent entrypoint

Read `CLAUDE.md`, `.planning/PROJECT.md`, and the active execution contract in
`.planning/memory-resilience/EXECUTION.md`. Recover from its work ledger and
journal, then verify live Git state. Preserve uncommitted and recovered work.

Create worktrees only inside this project: `git worktree add .worktrees/<slug>
-b <branch>`. Never create sibling worktrees or run `git clean -ffdx`. Follow
`C:/Users/Destiny/.claude/rules/worktrees.md` for retirement and recovery checks.

Use the structured question tool (`AskUserQuestion`, or the runtime's available
equivalent) for user questions; never place questions inline when it is available.
Do not return routine authorized implementation decisions to the owner.

Read `C:/Users/Destiny/.claude/rules/quality-standards.md` before implementation or
acceptance. Follow the ratified sign-off policy referenced by `CLAUDE.md`.
