/**
 * QmdRunner
 *
 * Infrastructure adapter that shells out to the qmd CLI for searching
 * markdown files. Implements the IExternalSearchProvider domain port.
 *
 * qmd is an optional peer dependency -- this adapter gracefully handles
 * the case where qmd is not installed.
 */

import { spawn, execSync } from "node:child_process";
import type {
  IExternalSearchProvider,
  QmdSearchResult,
  QmdHealthInfo,
} from "../../domain/ports/index.js";

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
    try {
      execSync("which qmd", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get health info including binary path.
   */
  getHealthInfo(): QmdHealthInfo {
    try {
      const path = (execSync("which qmd", { encoding: "utf-8" }) as string).trim();
      return { available: true, path };
    } catch {
      return { available: false, path: null };
    }
  }
}

/**
 * Standalone convenience function: check if qmd is available.
 * Used by doctor command and other non-DI contexts.
 */
export function isQmdAvailable(): boolean {
  try {
    execSync("which qmd", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Standalone convenience function: get qmd health info.
 * Used by doctor command and other non-DI contexts.
 */
export function getQmdInfo(): QmdHealthInfo {
  try {
    const path = (execSync("which qmd", { encoding: "utf-8" }) as string).trim();
    return { available: true, path };
  } catch {
    return { available: false, path: null };
  }
}
