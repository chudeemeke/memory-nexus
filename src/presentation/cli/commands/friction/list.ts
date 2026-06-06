/**
 * Friction List Handler
 *
 * Handles the friction list subcommand.
 */

import { createHash } from "node:crypto";
import type { CommandResult } from "../../command-result.js";
import type { FrictionExecuteOptions } from "./types.js";
import type { FrictionService } from "../../../../application/services/friction-service.js";
import type {
    FrictionEntry,
    FrictionSeverity,
    FrictionStatus,
} from "../../../../domain/entities/friction-entry.js";
import { emitJsonEnvelope, emitJsonErrorEnvelope } from "../../formatters/envelope.js";

const VALID_SEVERITIES: readonly FrictionSeverity[] = ["low", "medium", "high", "critical"];
const VALID_STATUSES: readonly FrictionStatus[] = ["open", "resolved", "wont-fix"];

interface ParsedListOptions {
    limit: number | undefined;
    min: number | undefined;
    since: Date | undefined;
}

/**
 * Handle the list action.
 */
export async function handleList(
    service: FrictionService,
    options: FrictionExecuteOptions
): Promise<CommandResult> {
    const parsed = parseListOptions(options);
    if ("error" in parsed) {
        return emitArgumentError(parsed.error, options);
    }

    const query = await service.query({
        all: options.all,
        status: options.status,
        severity: options.severity,
        category: options.category,
        tool: options.tool,
        sourceProject: options.project,
        since: parsed.since,
        descriptionContains: options.descriptionContains,
        contextContains: options.contextContains,
        limit: parsed.limit,
    });
    const entries = query.entries;
    const totalCount = query.totalCount;
    const exitCode = parsed.min !== undefined && totalCount < parsed.min ? 1 : 0;

    if (options.json) {
        const meta = buildListMeta(options, totalCount, entries.length, parsed);
        if (options.count) {
            emitJsonEnvelope({
                command: "friction",
                kind: "friction",
                data: { count: totalCount },
                meta,
            });
        } else {
            emitJsonEnvelope({
                command: "friction",
                kind: "friction",
                data: entries.map(toFrictionDto),
                meta,
            });
        }
    } else if (options.count) {
        console.log(String(totalCount));
    } else {
        renderTextList(entries, options);
    }

    // Mark entries as reviewed when entries are displayed for a specific tool.
    if (options.tool && !options.count) {
        await service.markReviewed(options.tool);
    }

    return { exitCode };
}

function renderTextList(entries: FrictionEntry[], options: FrictionExecuteOptions): void {
    if (entries.length === 0) {
        console.log(
            options.all
                ? "No friction entries found."
                : "No open friction entries."
        );
        return;
    }

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

    const breakdown = Object.entries(severityCounts)
        .map(([sev, count]) => `${count} ${sev}`)
        .join(", ");
    const toolLabel = options.tool ? ` for ${options.tool}` : "";
    const newLabel = newCount > 0 ? ` -- ${newCount} new since last review` : "";
    console.log(
        `\n${entries.length} ${options.all ? "total" : "open"} entries${toolLabel} (${breakdown})${newLabel}`
    );
}

function parseListOptions(options: FrictionExecuteOptions): ParsedListOptions | { error: string } {
    const limit = options.limit ? parsePositiveInteger(options.limit) : undefined;
    if (limit === null) {
        return { error: "Limit must be a positive integer" };
    }

    const min = options.min ? parsePositiveInteger(options.min) : undefined;
    if (min === null) {
        return { error: "Min must be a positive integer" };
    }

    if (options.severity && !VALID_SEVERITIES.includes(options.severity as FrictionSeverity)) {
        return { error: "Severity must be one of: low, medium, high, critical" };
    }

    if (options.status && !VALID_STATUSES.includes(options.status as FrictionStatus)) {
        return { error: "Status must be one of: open, resolved, wont-fix" };
    }

    const since = options.since ? parseUtcDate(options.since) : undefined;
    if (since === null) {
        return { error: "Since must use YYYY-MM-DD" };
    }

    return { limit, min, since };
}

function parsePositiveInteger(value: string): number | null {
    if (!/^[1-9]\d*$/.test(value)) {
        return null;
    }
    return Number(value);
}

function parseUtcDate(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        return null;
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (
        Number.isNaN(date.getTime()) ||
        date.getUTCFullYear() !== Number(match[1]) ||
        date.getUTCMonth() + 1 !== Number(match[2]) ||
        date.getUTCDate() !== Number(match[3])
    ) {
        return null;
    }

    return date;
}

function emitArgumentError(message: string, options: FrictionExecuteOptions): CommandResult {
    if (options.json) {
        emitJsonErrorEnvelope({
            command: "friction",
            code: "INVALID_ARGUMENT",
            message,
        });
    } else {
        console.error(`Error: ${message}`);
    }
    return { exitCode: 2 };
}

function buildListMeta(
    options: FrictionExecuteOptions,
    totalCount: number,
    returnedCount: number,
    parsed: ParsedListOptions,
): Record<string, unknown> {
    return {
        count: totalCount,
        returned: options.count ? 0 : returnedCount,
        mode: options.count ? "count" : "list",
        filters_applied: buildFiltersApplied(options, parsed),
        ...(parsed.min !== undefined ? { min: parsed.min, threshold_met: totalCount >= parsed.min } : {}),
        ...(parsed.limit !== undefined && !options.count ? { limit: parsed.limit } : {}),
    };
}

function buildFiltersApplied(options: FrictionExecuteOptions, parsed: ParsedListOptions): string[] {
    const filters: string[] = [];
    const effectiveStatus = options.status ?? (options.all ? undefined : "open");

    if (effectiveStatus) filters.push(`status:${effectiveStatus}`);
    if (options.all && !options.status) filters.push("status:all");
    if (options.severity) filters.push(`severity:${options.severity}`);
    if (options.category) filters.push(`category:${options.category}`);
    if (options.tool) filters.push(`tool:${options.tool}`);
    if (options.project) filters.push(`project:${options.project}`);
    if (parsed.since) filters.push(`since:${parsed.since.toISOString()}`);
    if (options.descriptionContains) filters.push(`description_contains:${redactedFilter(options.descriptionContains)}`);
    if (options.contextContains) filters.push(`context_contains:${redactedFilter(options.contextContains)}`);

    return filters;
}

function redactedFilter(value: string): string {
    const fingerprint = createHash("sha256").update(value).digest("hex").slice(0, 8);
    return `[redacted:${fingerprint}]`;
}

function toFrictionDto(entry: FrictionEntry): Record<string, unknown> {
    return {
        id: entry.id,
        description: entry.description,
        severity: entry.severity,
        category: entry.category,
        tool: entry.tool,
        status: entry.status,
        loggedAt: entry.loggedAt.toISOString(),
        resolvedAt: entry.resolvedAt?.toISOString() ?? null,
        resolution: entry.resolution ?? null,
        context: entry.context ?? null,
        sourceProject: entry.sourceProject ?? null,
        lastReviewedAt: entry.lastReviewedAt?.toISOString() ?? null,
    };
}
