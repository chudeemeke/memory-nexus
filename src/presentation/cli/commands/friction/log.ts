/**
 * Friction Log Handler
 *
 * Handles the friction log subcommand.
 */

import type { CommandResult } from "../../command-result.js";
import type { FrictionExecuteOptions } from "./types.js";
import type { FrictionService } from "../../../../application/services/friction-service.js";

/**
 * Handle the log action.
 */
export async function handleLog(
    service: FrictionService,
    options: FrictionExecuteOptions
): Promise<CommandResult> {
    if (!options.description) {
        console.error("Error: description is required for log action");
        return { exitCode: 1 };
    }

    const entry = await service.log({
        description: options.description,
        severity: options.severity as "low" | "medium" | "high" | "critical" | undefined,
        category: options.category as "search" | "sync" | "cli" | "context" | "integration" | "ux" | undefined,
        tool: options.tool,
        context: options.context,
        sourceProject: options.source,
    });

    if (options.json) {
        console.log(
            JSON.stringify({
                id: entry.id,
                description: entry.description,
                severity: entry.severity,
                category: entry.category,
                tool: entry.tool,
                status: entry.status,
                loggedAt: entry.loggedAt.toISOString(),
                context: entry.context ?? null,
                sourceProject: entry.sourceProject ?? null,
            })
        );
    } else {
        console.log(
            `Logged friction #${entry.id} (${entry.severity}/${entry.category})`
        );
    }

    return { exitCode: 0 };
}
