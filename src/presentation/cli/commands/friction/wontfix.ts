/**
 * Friction Won't-Fix Handler
 *
 * Handles the friction wont-fix subcommand.
 */

import type { CommandResult } from "../../command-result.js";
import type { FrictionExecuteOptions } from "./types.js";
import type { FrictionService } from "../../../../application/services/friction-service.js";

/**
 * Handle the wont-fix action.
 */
export async function handleWontFix(
    service: FrictionService,
    options: FrictionExecuteOptions
): Promise<CommandResult> {
    if (!options.id || !options.resolution) {
        console.error(
            "Error: id and --resolution are required for wont-fix action"
        );
        return { exitCode: 1 };
    }

    const id = parseInt(options.id, 10);
    if (isNaN(id)) {
        console.error("Error: id must be a number");
        return { exitCode: 1 };
    }

    await service.wontFix(id, options.resolution);

    if (options.json) {
        console.log(JSON.stringify({ id, status: "wont-fix", resolution: options.resolution }));
    } else {
        console.log(`Marked friction #${id} as won't fix`);
    }

    return { exitCode: 0 };
}
