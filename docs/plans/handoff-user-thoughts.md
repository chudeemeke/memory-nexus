# User Thoughts: Memory Friction Logging System

**Source:** get-stuff-done project session, 2026-03-06
**Context:** Discussion about making memory-nexus a first-class tool across all projects

## Verbatim Thoughts

### On friction logging

"I like the idea of friction log but I need it to be done in such a way that the memory-nexus project will automatically pick it up whenever I return to it (maybe a note in the project memory file to always look as the last set of friction logs and file away the ones that have been completed upon completion so we have a central friction db where every single one can be reviewed over time - preferrably as a visual page with beautiful charts and graphs and trends etc)"

### On cross-project friction capture

"then ensure every other project and/or session automatically log to the 'memory-friction-log' as they go (though I don't really know how to explain to you to log every friction you have in such a way that it'll be useful when you don't have any context or maybe that should be in the db itself or maybe a part of the --help then add the memory --help in my user claude.md and the memory.md rule so the it's universal)"

### On making memory the default recall mechanism

"I also need advise, you view on how you would intuitively access information, in what format, and quickly so it's useful, it also need to become less DATA and more Intelligence while the data itself stays as the raw input OR is this something YOU do on the fly after ingesting the DATA?"

### On memory becoming first-class

"my goal is that all the tools I build, especially the memory (memory-nexus) becomes a first-class tool and as such the defacto way you query historical information when needed - make it YOUR memory, so I need you to log all the friction points to the project even as you find ways around them, and I need to this to be automatic so that they keep getting improved such that you have no friction points as we go on"

### On keeping project contexts clean

User confirmed the handoff-file approach: each project stays focused, cross-project work happens through files that the target project reads, not by doing the work in the wrong project's context.

## Key Requirements Extracted

1. **Central friction database** -- not just a log file, a queryable store
2. **Visual dashboard** -- charts, graphs, trends over time
3. **Auto-capture from all projects** -- every session logs friction as it encounters it
4. **Auto-pickup on return** -- memory-nexus project reads new friction entries when you resume work
5. **Lifecycle management** -- file away completed items, keep history reviewable
6. **Self-documenting** -- friction logging instructions available via `memory --help` or rules
7. **Universal rules** -- update `~/.claude/CLAUDE.md` and `~/.claude/rules/memory.md` so every session knows how to log friction
