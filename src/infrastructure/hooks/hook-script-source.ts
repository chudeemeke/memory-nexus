import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

export interface HookSourceFiles {
  stat(path: string): { isFile(): boolean } | undefined;
  read(path: string): string;
}

const files: HookSourceFiles = {
  stat: path => lstatSync(path, { throwIfNoEntry: false }),
  read: path => readFileSync(path, "utf8"),
};

/** Locate the executable asset in this module's own package, never in cwd. */
export function resolveHookScriptSource(
  moduleDirectory: string,
  override?: string,
  io: HookSourceFiles = files,
): string | null {
  try {
    if (override !== undefined) return io.stat(override)?.isFile() ? override : null;
    if (!isAbsolute(moduleDirectory)) return null;
    let directory = moduleDirectory;
    while (true) {
      const manifestPath = join(directory, "package.json");
      const manifestFile = io.stat(manifestPath);
      if (manifestFile) {
        if (!manifestFile.isFile()) return null;
        const manifest: unknown = JSON.parse(io.read(manifestPath));
        if (typeof manifest !== "object" || manifest === null || !("name" in manifest) || manifest.name !== "@chude/memory") return null;
        const hook = join(directory, "dist", "sync-hook.js");
        return io.stat(hook)?.isFile() ? hook : null;
      }
      const parent = dirname(directory);
      if (parent === directory) return null;
      directory = parent;
    }
  } catch {
    return null;
  }
}
