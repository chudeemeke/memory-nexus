/**
 * Friction Resolve Handler
 *
 * Handles the friction resolve subcommand.
 */

import type { CommandResult } from "../../command-result.js";
import type { FrictionExecuteOptions } from "./types.js";
import type { FrictionService } from "../../../../application/services/friction-service.js";

/**
 * Handle the resolve action.
 */
export async function handleResolve(
    service: FrictionService,
    options: FrictionExecuteOptions
): Promise<CommandResult> {
    if (!options.id || !options.resolution) {
        console.error(
            "Error: id and --resolution are required for resolve action"
        );
        return { exitCode: 1 };
    }

    const id = parseInt(options.id, 10);
    if (isNaN(id)) {
        console.error("Error: id must be a number");
        return { exitCode: 1 };
    }

    await service.resolve(id, options.resolution);

    if (options.json) {
        console.log(JSON.stringify({ id, status: "resolved", resolution: options.resolution }));
    } else {
        console.log(`Resolved friction #${id}`);
    }

    return { exitCode: 0 };
}
