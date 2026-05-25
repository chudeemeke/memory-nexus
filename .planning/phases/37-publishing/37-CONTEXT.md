# Context: Phase 37 - Publishing

## Overview
Phase 37 compiles, bundles, and publishes the `@chude/memory` package as a globally installable CLI tool binary (`memory`). This release solidifies all the v4.0 milestone improvements, specifically the Event-Log SSOT architecture, temporal supersedence semantics, T7 plain-text canonical recovery, surface consolidation, and cross-environment portability diagnostics.

## Milestone Alignment
* **Milestone:** v4.0 Intelligence Layer
* **Target Version:** `4.0.0-pre.1` (Pre-release UAT vehicle) and subsequently `4.0.0` (Stable GA)
* **Gated Release Criteria:** Gated on Section 21 of the Architecture Audit. No stable GA release can occur until UAT on the pre-release is successfully completed.

## Constraints & Standards
* **Binary Execution:** Built outputs must run cleanly under Bun (>=1.0.0).
* **SOLID Principles:** Tight registry integration with loose, decoupled underlying presentation and infrastructure code.
* **No AI Attributions:** CHANGELOG and package description must remain strictly professional without AI attributions or emojis.
* **Coverage Protection:** All existing test coverages (95%+) must remain green and unchanged across all packages.

## Adjacent Systems Context
* **OpenClaw & ClawMem:** Architecture aligns with OpenClaw's dual-layered storage: plain-text canonical entries (T7) indexed and projected via SQLite (`sqlite-vec` + `FTS5`).
* **Hermes Agent:** Future roadmap plans incorporate the biological "Dreaming" consolidation cycle mapped in the comparison analysis.
