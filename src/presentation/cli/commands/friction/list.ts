/**
 * Friction List Handler
 *
 * Handles the friction list subcommand.
 */

import type { CommandResult } from "../../command-result.js";
import type { FrictionExecuteOptions } from "./types.js";
import type { FrictionService } from "../../../../application/services/friction-service.js";

/**
 * Handle the list action.
 */
export async function handleList(
    service: FrictionService,
    options: FrictionExecuteOptions
): Promise<CommandResult> {
    const limit = options.limit ? parseInt(options.limit, 10) : undefined;
    const entries = await service.list({
        all: options.all,
        status: options.status,
        category: options.category,
        tool: options.tool,
        limit,
    });

    if (options.json) {
        console.log(
            JSON.stringify(
                entries.map((e) => ({
                    id: e.id,
                    description: e.description,
                    severity: e.severity,
                    category: e.category,
                    tool: e.tool,
                    status: e.status,
                    loggedAt: e.loggedAt.toISOString(),
                    resolvedAt: e.resolvedAt?.toISOString() ?? null,
                    resolution: e.resolution ?? null,
                    context: e.context ?? null,
                    sourceProject: e.sourceProject ?? null,
                    lastReviewedAt: e.lastReviewedAt?.toISOString() ?? null,
                }))
            )
        );
    } else {
        if (entries.length === 0) {
            console.log(
                options.all
                    ? "No friction entries found."
                    : "No open friction entries."
            );
        } else {
            // Table header
            console.log(
                `${"".padEnd(5)}${"ID".padEnd(6)}${"Severity".padEnd(10)}${"Category".padEnd(14)}${"Description".padEnd(62)}Age`
            );
            console.log("-".repeat(101));

            let newCount = 0;
            const severityCounts: Record<string, number> = {};

            for (const entry of entries) {
                const isNew = !entry.lastReviewedAt || entry.lastReviewedAt < entry.loggedAt;
                if (isNew) newCount++;
                severityCounts[entry.severity] = (severityCounts[entry.severity] ?? 0) + 1;

                const newMarker = isNew ? "[NEW]" : "     ";
                const desc =
                    entry.description.length > 60
                        ? entry.description.slice(0, 57) + "..."
                        : entry.description;
                const ageMs = Date.now() - entry.loggedAt.getTime();
                const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
                const age = ageDays === 0 ? "today" : `${ageDays}d`;

                console.log(
                    `${newMarker}${String(entry.id).padEnd(6)}${entry.severity.padEnd(10)}${entry.category.padEnd(14)}${desc.padEnd(62)}${age}`
                );
            }

            // Summary with severity breakdown and new count
            const breakdown = Object.entries(severityCounts)
                .map(([sev, count]) => `${count} ${sev}`)
                .join(", ");
            const toolLabel = options.tool ? ` for ${options.tool}` : "";
            const newLabel = newCount > 0 ? ` -- ${newCount} new since last review` : "";
            console.log(
                `\n${entries.length} ${options.all ? "total" : "open"} entries${toolLabel} (${breakdown})${newLabel}`
            );
        }
    }

    // Mark entries as reviewed when tool is specified
    if (options.tool) {
        await service.markReviewed(options.tool);
    }

    return { exitCode: 0 };
}
