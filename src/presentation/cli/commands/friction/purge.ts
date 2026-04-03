/**
 * Friction Purge Handler
 *
 * Handles the friction purge subcommand.
 */

import type { CommandResult } from "../../command-result.js";
import type { FrictionExecuteOptions } from "./types.js";
import type { FrictionService } from "../../../../application/services/friction-service.js";

/**
 * Handle the purge action.
 */
export async function handlePurge(
    service: FrictionService,
    options: FrictionExecuteOptions
): Promise<CommandResult> {
    if (!options.pattern) {
        console.error("Error: pattern is required for purge action");
        return { exitCode: 1 };
    }

    if (options.dryRun) {
        // Preview mode: count matches via a dry purge
        const matches = await service.list({ all: true });
        const matching = matches.filter((e) => {
            const regex = new RegExp(
                "^" + options.pattern!.replace(/%/g, ".*").replace(/_/g, ".") + "$"
            );
            return regex.test(e.description);
        });

        if (matching.length === 0) {
            if (options.json) {
                console.log(JSON.stringify({ wouldDelete: 0, pattern: options.pattern }));
            } else {
                console.log(`No entries match pattern: "${options.pattern}"`);
            }
        } else if (options.json) {
            console.log(JSON.stringify({ wouldDelete: matching.length, pattern: options.pattern }));
        } else {
            console.log(`Would delete ${matching.length} entries matching "${options.pattern}":`);
            for (const entry of matching.slice(0, 10)) {
                console.log(`  #${entry.id}: ${entry.description}`);
            }
            if (matching.length > 10) {
                console.log(`  ... and ${matching.length - 10} more`);
            }
        }
        return { exitCode: 0 };
    }

    if (!options.force) {
        console.error(`Use --dry-run to preview or --force to delete entries matching "${options.pattern}".`);
        return { exitCode: 1 };
    }

    const deleted = await service.purge(options.pattern);

    if (deleted === 0) {
        if (options.json) {
            console.log(JSON.stringify({ deleted: 0, pattern: options.pattern }));
        } else {
            console.log(`No entries match pattern: "${options.pattern}"`);
        }
    } else if (options.json) {
        console.log(JSON.stringify({ deleted, pattern: options.pattern }));
    } else {
        console.log(`Purged ${deleted} friction entries matching "${options.pattern}"`);
    }

    return { exitCode: 0 };
}
