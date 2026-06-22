import { existsSync, realpathSync, rmSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const target = resolve("dist");

if (!existsSync(target)) {
  process.exit(0);
}

const workspaceRoot = realpathSync.native(process.cwd());
const resolvedTarget = realpathSync.native(target);
const relativeTarget = relative(workspaceRoot, resolvedTarget);
const isInsideWorkspace =
  relativeTarget === "dist" ||
  (relativeTarget.startsWith(`dist${"\\"}`) || relativeTarget.startsWith("dist/"));

if (!isInsideWorkspace) {
  throw new Error(`Refusing to clean outside workspace: ${resolvedTarget}`);
}

if (process.platform === "win32") {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$path = $env:MEMORY_CLEAN_DIST_TARGET; Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        MEMORY_CLEAN_DIST_TARGET: resolvedTarget,
      },
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Failed to clean dist with exit code ${result.status ?? "unknown"}`);
  }
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
