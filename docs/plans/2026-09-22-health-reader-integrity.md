# Health reader integrity checkpoint (unreleased)

Owner: memory-nexus. Draft baseline PR #1; no installed consumer changes.

Health checks now scope integrity, quick-integrity, vector-version and count
statements. Five cached queries became four prepared statements. Native tests
exercise repeated raw read-only probes, corrupt-file failure and failed extension
loading, verifying statement disposal and connection/file release.

A native partial-schema test reproduced false vector readiness: the embedding
count succeeded, the message count failed, and the earlier count still implied
readiness. Both counts now come from one SQL statement and are assigned only
after that statement succeeds. A failed count read leaves both zero and vector
readiness false. This is a repaired false-positive; it is not complete operational
readiness proof for the vector index.

Current-runtime evidence:70tests /299assertions, seven detected faults, strict
types and test isolation pass on Windows Bun1.4.1. New driver diagnostic100% also
proves the lifetime verifier rejects live handles and does not confuse native
query errors with finalization. Pinned1.3.14 verification is disk-guarded; the
prepared combined runner checks the pending factory group and health group from
one runtime download after the unchanged512MiB preflight passes.

Production branches96.26% and existing health-test branches60% fail Tier S.
Q102/B11.10 remain required before baseline acceptance. Q102 owns truthful unknown,
error and ready states, actual FTS/vector index availability rather than state
counts alone, inconsistent/malformed data, provider/configuration admission,
installed doctor/status behavior and complete quality/decision/review evidence.
B11.10 retains fixture cleanup ownership and existing test quality. No missing
evidence is treated as proof that these policies are already correct.

R04 owns consumer notification before integration/adoption. No canonical memory,
model inference/download or provider egress was used by this scoped verification.
