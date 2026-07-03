/**
 * QmdRunner
 *
 * Infrastructure adapter that shells out to the qmd CLI for searching
 * markdown files. Implements the IExternalSearchProvider domain port.
 *
 * qmd is an optional peer dependency -- this adapter gracefully handles
 * the case where qmd is not installed.
 */

import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { basename, delimiter, dirname, extname, isAbsolute, join } from "node:path";
import type {
  IExternalSearchProvider,
  QmdSearchResult,
  QmdHealthInfo,
} from "../../domain/ports/index.js";

const WINDOWS_EXECUTABLE_EXTENSIONS = ".COM;.EXE;.BAT;.CMD";

export class QmdRunner implements IExternalSearchProvider {
  /**
   * Execute a search query against qmd and return parsed results.
   *
   * Spawns `qmd search <query> --json` and parses the JSON output.
   */
  search(query: string): Promise<QmdSearchResult[]> {
    return new Promise((resolve, reject) => {
      const child = spawn("qmd", ["search", query, "--json"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err: Error) => {
        reject(new Error(`Failed to spawn qmd: ${err.message}`));
      });

      child.on("close", (code: number | null) => {
        if (code === 0) {
          try {
            const results: QmdSearchResult[] = JSON.parse(stdout);
            resolve(results);
          } catch {
            reject(
              new Error(
                `Failed to parse qmd output: ${stdout.slice(0, 200)}`,
              ),
            );
          }
        } else {
          reject(
            new Error(
              `qmd exited with code ${code}: ${stderr.trim()}`,
            ),
          );
        }
      });
    });
  }

  /**
   * Check if qmd binary is available in PATH.
   */
  isAvailable(): boolean {
    return findExecutableOnPath("qmd") !== null;
  }

  /**
   * Get health info including binary path.
   */
  getHealthInfo(): QmdHealthInfo {
    const path = findExecutableOnPath("qmd");
    return path ? { available: true, path } : { available: false, path: null };
  }
}

/**
 * Standalone convenience function: check if qmd is available.
 * Used by doctor command and other non-DI contexts.
 */
export function isQmdAvailable(): boolean {
  return findExecutableOnPath("qmd") !== null;
}

/**
 * Standalone convenience function: get qmd health info.
 * Used by doctor command and other non-DI contexts.
 */
export function getQmdInfo(): QmdHealthInfo {
  const path = findExecutableOnPath("qmd");
  return path ? { available: true, path } : { available: false, path: null };
}

export function findExecutableOnPath(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const hasDirectory = command.includes("/") || command.includes("\\") || isAbsolute(command);
  const pathEnv = env.PATH ?? env.Path ?? "";
  if (!hasDirectory && !pathEnv.trim()) return null;

  const searchDirectories = hasDirectory ? [dirname(command)] : pathEnv.split(delimiter).filter(Boolean);
  const commandName = hasDirectory ? basename(command) : command;
  const candidates = executableCandidates(commandName, env, platform);

  for (const directory of searchDirectories) {
    for (const candidate of candidates) {
      const fullPath = join(directory, candidate);
      if (isExecutableFile(fullPath, platform)) {
        return fullPath;
      }
    }
  }

  return null;
}

function executableCandidates(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string[] {
  if (platform !== "win32" || extname(command)) return [command];

  const extensions = (env.PATHEXT ?? WINDOWS_EXECUTABLE_EXTENSIONS)
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);

  return [command, ...extensions.map((extension) => `${command}${extension}`)];
}

function isExecutableFile(path: string, platform: NodeJS.Platform): boolean {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return false;
    if (platform === "win32") return true;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
