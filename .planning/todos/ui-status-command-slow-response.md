---
title: memory status command has noticeable delay before output
area: ui
priority: normal
status: pending
created: 2026-02-27
source: conversation
---

## Description

Running `memory status` has a noticeable delay before any output appears. User reported it "took a while to output." The command should feel instant for a status check.

## Context

Observed during Phase 15 human verification testing. The status command opens a database connection, checks for embedding lock files, and when active embedding is detected, queries `EmbeddingRepository` for live counts (`getEmbeddedCount`, `getTotalMessageCount`). On a large database (96K+ messages), these queries may be slow, especially if the database is under concurrent write pressure from an active embedding process.

Additionally, the dynamic imports in `gatherStatus()` (importing `background-embedder.js` and `embedding-repository.js`) add cold-start latency.

Note: This was observed running the old v1.0 dist build via `memory status`, so the delay may be from the old code path (hooks check, log parsing). Needs retesting from source to determine if it's the old code, the new embedding queries, or both.

## Acceptance Criteria

- [ ] `memory status` responds within 1 second on a typical database
- [ ] Identify whether delay is from DB queries, dynamic imports, or hook checks
- [ ] Optimize the slowest contributor
