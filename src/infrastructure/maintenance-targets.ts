import { lstatSync, type Stats } from "node:fs";

export interface MaintenanceTarget {
  readonly path: string;
  readonly kind: "file" | "directory";
}

/**
 * Reject malformed existing targets before maintenance starts mutating state.
 * This checks leaf identity only; it is not a lease against later path changes.
 */
export function assertMaintenanceTargets(
  targets: readonly MaintenanceTarget[],
  inspect: (path: string) => Stats = lstatSync,
): void {
  for (const target of targets) {
    let stat: Stats;
    try {
      stat = inspect(target.path);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    const validType = target.kind === "file" ? stat.isFile() : stat.isDirectory();
    if (stat.isSymbolicLink() || !validType || (target.kind === "file" && stat.nlink !== 1)) {
      throw new Error(`Maintenance requires a ${target.kind} without links or a missing path: ${target.path}`);
    }
  }
}
