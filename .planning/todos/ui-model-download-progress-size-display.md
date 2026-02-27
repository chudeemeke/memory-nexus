---
title: Fix model download progress showing "0/0 MB" when Content-Length header missing
area: ui
priority: normal
status: pending
created: 2026-02-27
source: conversation
---

## Description

`createModelDownloadHandler` in `progress-reporter.ts` shows "0/0 MB" when the HTTP response omits the `Content-Length` header during ONNX model download. The progress bar itself reaches 100% correctly, but the size display is misleading -- it looks like nothing was downloaded.

## Context

Observed during first-run `memory sync --embed` which downloads Xenova/all-MiniLM-L6-v2 (~23MB). The Hugging Face CDN response did not include `Content-Length`, causing the progress reporter to fall back to 0 for both current and total size. The download completed successfully and embedding started, but the UX is confusing.

Terminal output:
```
Downloading model |████████████████████████| 100% | 0/0 MB Unable to determine content-length from response headers. .
Downloading model |████████████████████████| 100% | 0/0 MB
```

## Acceptance Criteria

- [ ] When `Content-Length` is unavailable, display an alternative format (e.g., "100% | 23 MB downloaded" using actual bytes received instead of expected total)
- [ ] When `Content-Length` IS available, continue showing "X/Y MB" as before
- [ ] Progress bar still reaches 100% in both cases
