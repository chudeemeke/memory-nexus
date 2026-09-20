# B04 metric applicability candidate

Status: historical 446-file source-bound diagnostic checkpoint; independent approval pending.

B11.1 subsequently changed the database helper and added two files. Current
inventory has 448 candidates. Those three entries explicitly invalidate prior
metric evidence and require fresh measurement; the figures below describe the
retained pre-repair checkpoint.

Every one of the 446 catalog candidates has four explicit metric dispositions in
`quality-classifications.json`. This is a proposed measurement contract, not
coverage acceptance. Positive counters still require runtime execution evidence;
zero counters require an individual reviewed explanation or instrumentation repair.
No exclusion or zero-applicability decision has been approved.

## Evidence and current scope

`evidence/B04-applicability-probe.json` retains the probe source, source hashes,
instrumented-code/map hashes and statement/branch/function/line counter totals.
The existing instrumenter processed all 444 JavaScript/TypeScript files as text.
The probe imported verification helpers; it did not evaluate generated target code. The two HTML documents require a separate browser path.
All counters begin at zero hits; this probe is not a coverage run.

The current runner's src-only selection and ignore rules reach 210 candidates:
176 executable modules, 23 re-export modules and 11 declaration-only modules.
They omit 211 actual test drivers, 23 other executable modules and both browser
documents. B05.2 owns replacing that selection with the reviewed inventory.

| Source shape | Count | Proposed disposition |
|---|---:|---|
| JS/TS files with positive counters | 407 | Measure positive denominators; validate counter completeness before trusting percentages. |
| Declaration-only modules | 11 | Zero local metrics proposed, with emitted-runtime evidence; independent approval required. |
| Re-export-only modules | 23 | Prove module loading/export wiring and separately measure dependencies; zero local counters are not functional proof. |
| Extraction port with value imports and interfaces | 1 | Resolve actual build/runtime import erasure and module binding before zero applicability approval. |
| Executable default-export configurations | 2 | Instrumentation defect; zero statements/lines must not be approved as inapplicable. |
| Inline browser documents | 2 | Instrument and exercise actual browser controls with source mapping. |

Across the 444 instrumented files, 37 have zero statement/line counters, 107
have zero branch counters and 45 have zero function counters. These are observed
tool denominators, not approved scope reductions. Each appears in its own source
entry rather than a filename glob. The static runtime feature scan also finds
optional-chain syntax in 170 files; that identifies affected review scope, not
the exact count of missing decisions.

## Confirmed counter blind spots

`evidence/B04-counter-boundary-probe.json` contains four synthetic in-memory VM
executions and their instrumented metrics. No production module was evaluated.

| Synthetic behavior | Observed result |
|---|---|
| Default export calls a recording function | The call executes, but the instrumenter reports zero statements and lines. |
| The same call assigned to a named binding | One statement and line are recorded as covered. |
| Optional property access with null and present input | Both outputs are correct, but zero branches are recorded. |
| Equivalent explicit null conditional | Two branches are recorded and covered. |

Istanbul's summary displays 100% for empty denominators. This is library behavior,
not proof that the project's current aggregate checker accepts the individual
file. B07 must reject missing/unreviewed zero evidence; B05.1 must fix the actual
accounting before numerical acceptance. Do not rewrite production expressions
merely to hide limitations in the instrumenter.

B05.1 preserves evaluation order, thrown errors, receiver binding, short-circuit
side effects, default-export identities and original source locations. B05.2
proves full selection, unimported-code accounting and import behavior. B05.3
proves real browser coverage for both explicitly listed documents. B05 remains
their completion barrier; B06-B09 and R02 cannot bypass them.

## Approval and next action

B04 remains active. Independent review must assess the existing source-bound
risk proposals and these individual metric dispositions, including zero-only
module wiring. The complete matrix does not close that gate. The last retained
Fable readiness attempt was quota-blocked; no new independent approval is claimed.
Ready authorized fixture repairs can proceed while that route is unavailable.

The numerical gate must eventually validate current source/map/tool identities,
all four metrics per file and package, reviewed zero applicability, complete
source selection and meaningful Tier S decision evidence. Missing or stale
evidence fails. Scope-specific synthetic checks do not establish full-suite,
installed-artifact, hosted CI or release readiness.
