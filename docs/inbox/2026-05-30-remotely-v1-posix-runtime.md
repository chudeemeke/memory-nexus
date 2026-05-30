# remotely v1 POSIX runtime update

`remotely` completed the v1.0 client-sales-ready technical/product gate at commit `40bf0d6`.

Consumer-visible changes:

- Use `remote_shell = "posix"` for Linux/macOS SSH hosts that should run bash directly on the SSH target.
- `remotely run` and `remotely run --stdin` now support POSIX targets as first-class runtime paths.
- POSIX config rejects `wsl_user` and `transfer_backend = "wsl"` at load time.
- `remotely status --json` now includes `runtime_label`, `runtime`, and `runtime_details`; legacy WSL fields remain for compatibility.
- macOS explicit transfer destinations should use `/private/tmp` rather than `/tmp` because `/tmp` is a symlink and remotely rejects symlink parents by design.

Evidence: local coverage regions 95.40%, functions 96.32%, lines 97.08%; CI run `26693859802`; Security run `26693859800`.
